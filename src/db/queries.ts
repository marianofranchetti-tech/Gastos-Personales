import type { SQLiteDatabase } from 'expo-sqlite';
import { MONEDA_DEFAULT, Periodo, TipoTx } from '../lib/categorias';
import { Estado } from './types';
import { getVentanaPendientes } from './config';
import { diaSemanaISO, hoyISO, sumarDiasISO } from '../lib/fechasRecurrentes';

export type TransaccionVista = {
  id: number;
  tipo: TipoTx;
  nombre: string;
  categoria_id: string;
  cat_emoji: string;
  cat_nombre: string;
  monto: number;
  moneda: string;
  fecha: string;
  venc: string | null;
  estado: Estado;
  regla_recurrente_id: number | null;
  rec: number; // 0 | 1
  periodo: Periodo | null;
  fijo: number | null; // 0 | 1
};

export async function getTransaccionesConRegla(
  db: SQLiteDatabase,
  tipo: TipoTx
): Promise<TransaccionVista[]> {
  return db.getAllAsync<TransaccionVista>(
    `SELECT t.id, t.tipo, t.nombre, t.categoria_id, t.monto, t.moneda, t.fecha, t.venc, t.estado,
            t.regla_recurrente_id,
            c.emoji as cat_emoji, c.nombre as cat_nombre,
            r.periodo as periodo, r.fijo as fijo,
            CASE WHEN t.regla_recurrente_id IS NULL THEN 0 ELSE 1 END as rec
     FROM transacciones t
     JOIN categorias c ON c.id = t.categoria_id
     LEFT JOIN reglas_recurrentes r ON r.id = t.regla_recurrente_id
     WHERE t.tipo = ?
     ORDER BY t.fecha DESC, t.id DESC`,
    tipo
  );
}

export type NuevaTransaccion = {
  tipo: TipoTx;
  nombre: string;
  monto: number;
  categoria_id: string;
  fecha: string;
  rec: boolean;
  periodo?: Periodo;
  fijo?: boolean; // sólo gasto
  estado?: Estado; // 'pagado' representa también 'cobrado' en ingresos
  venc?: string;
  cuenta_id?: number | null;
  moneda?: string;
};

/**
 * Crea la regla recurrente de una transacción y devuelve su id.
 *
 * El ancla de repetición sale del vencimiento si lo hay, y si no de la fecha
 * del movimiento. Cada período necesita la suya: mensual usa el día del mes,
 * semanal el día de la semana, anual el día y el mes.
 */
async function insertarRegla(
  db: SQLiteDatabase,
  input: NuevaTransaccion,
  moneda: string
): Promise<number> {
  const ancla = input.venc ?? input.fecha;
  const [, mesAncla, diaAncla] = ancla.split('-').map(Number);

  const r = await db.runAsync(
    `INSERT INTO reglas_recurrentes
       (tipo, nombre, categoria_id, cuenta_id, monto, moneda, periodo, fijo,
        fecha_inicio, dia_venc, dia_semana, mes_anio)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.tipo,
    input.nombre,
    input.categoria_id,
    input.cuenta_id ?? null,
    input.monto,
    moneda,
    input.periodo!,
    input.fijo ? 1 : 0,
    input.fecha,
    input.periodo === 'mensual' || input.periodo === 'anual' ? diaAncla : null,
    input.periodo === 'semanal' ? diaSemanaISO(ancla) : null,
    input.periodo === 'anual' ? mesAncla : null
  );
  return r.lastInsertRowId;
}

export async function crearTransaccion(db: SQLiteDatabase, input: NuevaTransaccion) {
  const moneda = input.moneda ?? MONEDA_DEFAULT;
  let reglaId: number | null = null;

  if (input.rec && input.periodo) {
    reglaId = await insertarRegla(db, input, moneda);
  }

  await db.runAsync(
    `INSERT INTO transacciones (tipo, nombre, categoria_id, cuenta_id, monto, moneda, fecha, venc, estado, regla_recurrente_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.tipo,
    input.nombre,
    input.categoria_id,
    input.cuenta_id ?? null,
    input.monto,
    moneda,
    input.fecha,
    input.venc ?? null,
    input.estado ?? (input.tipo === 'gasto' ? 'pendiente' : 'pagado'),
    reglaId
  );
}

export async function alternarEstado(db: SQLiteDatabase, id: number) {
  // pagado_en acompaña al estado: si vuelve a pendiente, la fecha de pago
  // deja de existir. Si no, quedaría una fecha de pago sobre algo impago.
  await db.runAsync(
    `UPDATE transacciones
        SET estado    = CASE estado WHEN 'pagado' THEN 'pendiente' ELSE 'pagado' END,
            pagado_en = CASE estado WHEN 'pagado' THEN NULL ELSE ? END
      WHERE id = ?`,
    hoyISO(),
    id
  );
}

// ---------------------------------------------------------------------------
// Por pagar / pagado
// ---------------------------------------------------------------------------

/**
 * "Por pagar": pendientes que vencen dentro de la ventana configurada,
 * más las ya vencidas (venc < hoy), que son justamente las que urgen.
 * Orden ascendente por vencimiento: primero lo más próximo.
 */
export async function getPorPagar(
  db: SQLiteDatabase,
  tipo?: TipoTx
): Promise<TransaccionVista[]> {
  const ventana = await getVentanaPendientes(db);
  const limite = sumarDiasISO(hoyISO(), ventana);

  return db.getAllAsync<TransaccionVista>(
    `SELECT t.id, t.tipo, t.nombre, t.categoria_id, t.monto, t.moneda, t.fecha, t.venc, t.estado,
            t.regla_recurrente_id,
            c.emoji as cat_emoji, c.nombre as cat_nombre,
            r.periodo as periodo, r.fijo as fijo,
            CASE WHEN t.regla_recurrente_id IS NULL THEN 0 ELSE 1 END as rec
       FROM transacciones t
       JOIN categorias c ON c.id = t.categoria_id
       LEFT JOIN reglas_recurrentes r ON r.id = t.regla_recurrente_id
      WHERE t.estado = 'pendiente'
        AND t.venc IS NOT NULL AND t.venc <= ?
        AND (? IS NULL OR t.tipo = ?)
      ORDER BY t.venc ASC, t.id ASC`,
    limite,
    tipo ?? null,
    tipo ?? null
  );
}

/** Marca una transacción como pagada y registra el día real de pago. */
export async function marcarPagada(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(
    "UPDATE transacciones SET estado = 'pagado', pagado_en = ? WHERE id = ?",
    hoyISO(),
    id
  );
}

/** Vuelve una transacción a pendiente y borra la fecha de pago. */
export async function marcarPendiente(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(
    "UPDATE transacciones SET estado = 'pendiente', pagado_en = NULL WHERE id = ?",
    id
  );
}

// ---------------------------------------------------------------------------
// Editar y eliminar
// ---------------------------------------------------------------------------

/**
 * Alcance de un cambio sobre un movimiento que viene de una regla recurrente.
 *
 * - 'solo'     → toca únicamente ese movimiento. El resto de los meses queda
 *                como estaba. Es lo correcto para corregir un mes puntual.
 * - 'adelante' → toca además la regla y todos los pendientes futuros. Es lo
 *                correcto cuando algo cambió de verdad (subió el alquiler).
 *
 * Lo ya pagado nunca se toca en ninguno de los dos casos: es historia, no
 * proyección. Si el alquiler sube, los meses que ya pagaste siguieron
 * costando lo que costaron.
 */
export type Alcance = 'solo' | 'adelante';

/** Corta una regla para que no genere más ocurrencias desde `desdeISO`. */
async function terminarRegla(db: SQLiteDatabase, reglaId: number, desdeISO: string) {
  // fecha_fin en vez de activa = 0: conserva la historia y es reversible.
  await db.runAsync(
    'UPDATE reglas_recurrentes SET fecha_fin = ? WHERE id = ?',
    sumarDiasISO(desdeISO, -1),
    reglaId
  );
  await db.runAsync(
    `DELETE FROM transacciones
      WHERE regla_recurrente_id = ? AND estado = 'pendiente' AND venc >= ?`,
    reglaId,
    desdeISO
  );
}

/** Propaga nombre/monto/categoría a la regla y a sus pendientes futuros. */
async function propagarARegla(
  db: SQLiteDatabase,
  reglaId: number,
  input: NuevaTransaccion,
  moneda: string,
  desdeISO: string
) {
  await db.runAsync(
    `UPDATE reglas_recurrentes
        SET nombre = ?, categoria_id = ?, monto = ?, moneda = ?, fijo = ?
      WHERE id = ?`,
    input.nombre,
    input.categoria_id,
    input.monto,
    moneda,
    input.fijo ? 1 : 0,
    reglaId
  );
  await db.runAsync(
    `UPDATE transacciones
        SET nombre = ?, categoria_id = ?, monto = ?, moneda = ?
      WHERE regla_recurrente_id = ? AND estado = 'pendiente' AND venc >= ?`,
    input.nombre,
    input.categoria_id,
    input.monto,
    moneda,
    reglaId,
    desdeISO
  );
}

/**
 * Edita un movimiento existente. Además de los campos propios, contempla los
 * tres cambios de clasificación posibles: seguir siendo recurrente, dejar de
 * serlo, y pasar a serlo.
 */
export async function actualizarTransaccion(
  db: SQLiteDatabase,
  id: number,
  input: NuevaTransaccion,
  alcance: Alcance = 'solo'
): Promise<void> {
  const actual = await db.getFirstAsync<{ regla_recurrente_id: number | null; venc: string | null }>(
    'SELECT regla_recurrente_id, venc FROM transacciones WHERE id = ?',
    id
  );
  if (!actual) return;

  const moneda = input.moneda ?? MONEDA_DEFAULT;
  const estado = input.estado ?? 'pendiente';
  const venc = input.venc ?? input.fecha;
  const desde = actual.venc ?? input.fecha;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE transacciones
          SET nombre = ?, categoria_id = ?, monto = ?, moneda = ?, fecha = ?, venc = ?,
              estado = ?,
              pagado_en = CASE WHEN ? = 'pagado' THEN COALESCE(pagado_en, ?) ELSE NULL END
        WHERE id = ?`,
      input.nombre,
      input.categoria_id,
      input.monto,
      moneda,
      input.fecha,
      venc,
      estado,
      estado,
      hoyISO(),
      id
    );

    const reglaId = actual.regla_recurrente_id;

    if (reglaId != null && !input.rec) {
      // Era recurrente y dejó de serlo: se desprende de la regla.
      await db.runAsync('UPDATE transacciones SET regla_recurrente_id = NULL WHERE id = ?', id);
      if (alcance === 'adelante') await terminarRegla(db, reglaId, desde);
    } else if (reglaId != null && input.rec && alcance === 'adelante') {
      await propagarARegla(db, reglaId, input, moneda, desde);
    } else if (reglaId == null && input.rec && input.periodo) {
      // Era eventual y ahora se repite: nace una regla y este movimiento
      // pasa a ser su primera ocurrencia.
      const nuevaId = await insertarRegla(db, input, moneda);
      await db.runAsync('UPDATE transacciones SET regla_recurrente_id = ? WHERE id = ?', nuevaId, id);
    }
  });
}

/**
 * Elimina un movimiento. Con alcance 'adelante' además corta la regla, así
 * no vuelve a aparecer el mes que viene.
 */
export async function eliminarTransaccion(
  db: SQLiteDatabase,
  id: number,
  alcance: Alcance = 'solo'
): Promise<void> {
  const actual = await db.getFirstAsync<{ regla_recurrente_id: number | null; venc: string | null; fecha: string }>(
    'SELECT regla_recurrente_id, venc, fecha FROM transacciones WHERE id = ?',
    id
  );
  if (!actual) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transacciones WHERE id = ?', id);
    if (actual.regla_recurrente_id != null && alcance === 'adelante') {
      await terminarRegla(db, actual.regla_recurrente_id, actual.venc ?? actual.fecha);
    }
  });
}

/**
 * Vacía movimientos y reglas. Deja las categorías, las cuentas y la
 * configuración: no es un reinstalar, es empezar de cero con tus números.
 */
export async function limpiarDatos(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transacciones');
    await db.runAsync('DELETE FROM reglas_recurrentes');
  });
}
