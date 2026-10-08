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
  /** 'pagado' = saldado por completo. Para parcial/vencido ver estadoVista. */
  estado: Estado;
  regla_recurrente_id: number | null;
  rec: number; // 0 | 1
  periodo: Periodo | null;
  fijo: number | null; // 0 | 1
  /** Suma de los pagos (o cobros) registrados. */
  pagado: number;
  /** monto - pagado, nunca negativo. */
  saldo: number;
  n_pagos: number;
};

/** Margen para comparar montos REAL: medio centavo. */
export const CENTAVO = 0.005;

/**
 * Lo pagado de un concepto. Si no tiene pagos pero figura pagado, vino de una
 * versión vieja de la app (otro dispositivo sin actualizar): cuenta como
 * pagado por el total, igual que antes.
 */
const PAGADO_SQL = `COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.transaccion_id = t.id),
                             CASE WHEN t.estado = 'pagado' THEN t.monto ELSE 0 END)`;

const SELECT_VISTA = `
  SELECT t.id, t.tipo, t.nombre, t.categoria_id, t.monto, t.moneda, t.fecha, t.venc, t.estado,
         t.regla_recurrente_id,
         c.emoji as cat_emoji, c.nombre as cat_nombre,
         r.periodo as periodo, r.fijo as fijo,
         CASE WHEN t.regla_recurrente_id IS NULL THEN 0 ELSE 1 END as rec,
         ${PAGADO_SQL} as pagado,
         MAX(t.monto - ${PAGADO_SQL}, 0) as saldo,
         (SELECT COUNT(*) FROM pagos p WHERE p.transaccion_id = t.id) as n_pagos
    FROM transacciones t
    JOIN categorias c ON c.id = t.categoria_id
    LEFT JOIN reglas_recurrentes r ON r.id = t.regla_recurrente_id`;

export async function getTransaccionesConRegla(
  db: SQLiteDatabase,
  tipo: TipoTx
): Promise<TransaccionVista[]> {
  return db.getAllAsync<TransaccionVista>(
    `${SELECT_VISTA}
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

  const estado = input.estado ?? (input.tipo === 'gasto' ? 'pendiente' : 'pagado');
  const r = await db.runAsync(
    `INSERT INTO transacciones (tipo, nombre, categoria_id, cuenta_id, monto, moneda, fecha, venc, estado, regla_recurrente_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
    input.tipo,
    input.nombre,
    input.categoria_id,
    input.cuenta_id ?? null,
    input.monto,
    moneda,
    input.fecha,
    input.venc ?? null,
    reglaId
  );
  // Cargado como ya pagado: un pago por el total, el día del movimiento, o hoy
  // si vence más adelante (no hay pagos en el futuro). El estado lo pone el
  // trigger de pagos.
  if (estado === 'pagado') {
    const hoy = hoyISO();
    await saldar(db, r.lastInsertRowId, input.fecha < hoy ? input.fecha : hoy);
  }
}

// ---------------------------------------------------------------------------
// Pagos y cobros (parciales o totales)
// ---------------------------------------------------------------------------

export type Pago = {
  id: number;
  transaccion_id: number;
  monto: number;
  fecha: string; // día del pago o cobro
  nota: string | null;
};

/** Un pago con lo que hace falta del concepto para sumarlo en los gráficos. */
export type PagoVista = Pago & {
  tipo: TipoTx;
  categoria_id: string;
  moneda: string;
  /** Pagado sin detalle: viene de una versión vieja (ver PAGADO_SQL). */
  legado: number; // 0 | 1
};

/**
 * Todos los pagos y cobros, más un pago implícito por cada concepto marcado
 * pagado sin pagos registrados (id negativo = -id del concepto).
 */
export async function getPagos(db: SQLiteDatabase): Promise<PagoVista[]> {
  return db.getAllAsync<PagoVista>(
    `SELECT p.id, p.transaccion_id, p.monto, p.fecha, p.nota,
            t.tipo, t.categoria_id, t.moneda, 0 AS legado
       FROM pagos p JOIN transacciones t ON t.id = p.transaccion_id
     UNION ALL
     SELECT -t.id, t.id, t.monto, COALESCE(t.pagado_en, t.venc, t.fecha), NULL,
            t.tipo, t.categoria_id, t.moneda, 1
       FROM transacciones t
      WHERE t.estado = 'pagado' AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.transaccion_id = t.id)
     ORDER BY 4 DESC, 1 DESC`
  );
}

async function saldoDe(db: SQLiteDatabase, id: number): Promise<number | null> {
  const r = await db.getFirstAsync<{ saldo: number }>(
    `SELECT MAX(t.monto - ${PAGADO_SQL}, 0) AS saldo FROM transacciones t WHERE t.id = ?`,
    id
  );
  return r ? r.saldo : null;
}

export class PagoInvalido extends Error {}

/**
 * Registra un pago (o cobro) parcial o total. No puede superar el saldo: un
 * concepto pagado de más no tiene sentido, y el exceso es casi siempre un
 * error de tipeo. El vencimiento del concepto no se toca.
 */
export async function registrarPago(
  db: SQLiteDatabase,
  transaccionId: number,
  { monto, fecha, nota }: { monto: number; fecha?: string; nota?: string | null }
): Promise<void> {
  const saldo = await saldoDe(db, transaccionId);
  if (saldo == null) throw new PagoInvalido('El concepto ya no existe.');
  if (!(monto > 0)) throw new PagoInvalido('El monto tiene que ser mayor que cero.');
  if (monto > saldo + CENTAVO) throw new PagoInvalido('El monto supera el saldo.');
  await db.runAsync(
    'INSERT INTO pagos (transaccion_id, monto, fecha, nota) VALUES (?, ?, ?, ?)',
    transaccionId,
    Math.min(monto, saldo),
    fecha ?? hoyISO(),
    nota?.trim() ? nota.trim() : null
  );
}

/** Paga (o cobra) todo el saldo de una vez. Si no queda saldo, no hace nada. */
export async function saldar(db: SQLiteDatabase, id: number, fecha: string = hoyISO()): Promise<void> {
  const saldo = await saldoDe(db, id);
  if (saldo != null && saldo > CENTAVO) await registrarPago(db, id, { monto: saldo, fecha });
}

/** Borra un pago. El concepto vuelve a tener ese saldo, en el mismo vencimiento. */
export async function eliminarPago(db: SQLiteDatabase, pagoId: number): Promise<void> {
  await db.runAsync('DELETE FROM pagos WHERE id = ?', pagoId);
}

/** Borra todos los pagos: el concepto queda pendiente por el total. */
export async function volverAPendiente(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM pagos WHERE transaccion_id = ?', id);
  // Un pagado sin pagos (versión vieja) no dispara el trigger: se pasa a mano.
  await db.runAsync(
    "UPDATE transacciones SET estado = 'pendiente', pagado_en = NULL WHERE id = ? AND (estado <> 'pendiente' OR pagado_en IS NOT NULL)",
    id
  );
}

/** El ✓ de siempre: salda lo que falte, o si ya estaba saldado lo vuelve a pendiente. */
export async function alternarEstado(db: SQLiteDatabase, id: number) {
  const t = await db.getFirstAsync<{ estado: Estado }>('SELECT estado FROM transacciones WHERE id = ?', id);
  if (!t) return;
  if (t.estado === 'pagado') await volverAPendiente(db, id);
  else await saldar(db, id);
}

/**
 * Mueve un movimiento a otro día (arrastre en el calendario). El calendario
 * ubica por vencimiento, así que `venc` pasa al día nuevo. `fecha` se corre
 * la misma cantidad de días: si eran iguales siguen iguales, y si había
 * distancia entre ambas (alquiler con fecha día 1 y vencimiento día 5) esa
 * distancia se conserva en vez de perderse.
 *
 * Si es una ocurrencia de regla, solo se mueve esta: la regla sigue igual y
 * venc_regla recuerda el día original para no regenerarlo.
 */
export async function moverFecha(db: SQLiteDatabase, id: number, nueva: string): Promise<void> {
  // En un UPDATE, SQLite evalúa todas las expresiones con los valores viejos
  // de la fila, así que COALESCE(venc, fecha) es el día de origen en las tres.
  await db.runAsync(
    `UPDATE transacciones
        SET venc_regla = CASE
              WHEN regla_recurrente_id IS NOT NULL AND COALESCE(venc, fecha) <> ?
                THEN COALESCE(venc_regla, venc, fecha)
              ELSE venc_regla
            END,
            fecha = date(
              fecha,
              printf('%+d days', CAST(round(julianday(?) - julianday(COALESCE(venc, fecha))) AS INTEGER))
            ),
            venc  = ?
      WHERE id = ?`,
    nueva,
    nueva,
    nueva,
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
    `${SELECT_VISTA}
      WHERE t.estado = 'pendiente'
        AND t.venc IS NOT NULL AND t.venc <= ?
        AND (? IS NULL OR t.tipo = ?)
      ORDER BY t.venc ASC, t.id ASC`,
    limite,
    tipo ?? null,
    tipo ?? null
  );
}

/** Marca una transacción como pagada: registra un pago por el saldo, con fecha de hoy. */
export async function marcarPagada(db: SQLiteDatabase, id: number): Promise<void> {
  await saldar(db, id);
}

/** Vuelve una transacción a pendiente: borra sus pagos y la fecha de pago. */
export async function marcarPendiente(db: SQLiteDatabase, id: number): Promise<void> {
  await volverAPendiente(db, id);
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
  // Lo que tiene algún pago tampoco se borra: ya es historia, aunque falte saldo.
  await db.runAsync(
    `DELETE FROM transacciones
      WHERE regla_recurrente_id = ? AND estado = 'pendiente' AND venc >= ?
        AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.transaccion_id = transacciones.id)`,
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
  const venc = input.venc ?? input.fecha;
  const desde = actual.venc ?? input.fecha;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE transacciones
          SET nombre = ?, categoria_id = ?, monto = ?, moneda = ?, fecha = ?,
              -- Si una ocurrencia de regla cambia de día, recordamos el original
              -- para que materializar no la vuelva a crear (ver schema v7).
              venc_regla = CASE
                WHEN regla_recurrente_id IS NOT NULL AND venc IS NOT NULL AND venc <> ?
                  THEN COALESCE(venc_regla, venc)
                ELSE venc_regla
              END,
              venc = ?
        WHERE id = ?`,
      input.nombre,
      input.categoria_id,
      input.monto,
      moneda,
      input.fecha,
      venc,
      venc,
      id
    );

    // El estado sale de los pagos. Si el formulario pide uno, se lleva a eso:
    // 'pagado' salda lo que falte (hoy) y 'pendiente' borra los pagos, pero
    // solo si estaba saldado: un parcial que "sigue pendiente" no se toca.
    if (input.estado) {
      const ahora = await db.getFirstAsync<{ estado: Estado }>('SELECT estado FROM transacciones WHERE id = ?', id);
      if (input.estado === 'pagado' && ahora?.estado !== 'pagado') await saldar(db, id);
      if (input.estado === 'pendiente' && ahora?.estado === 'pagado') await volverAPendiente(db, id);
    }

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
    await db.runAsync('DELETE FROM pagos');
    await db.runAsync('DELETE FROM transacciones');
    await db.runAsync('DELETE FROM reglas_recurrentes');
  });
}

// ---------------------------------------------------------------------------
// Depurar por rango
// ---------------------------------------------------------------------------

/**
 * Movimientos cuya fecha efectiva (vencimiento, o fecha si no vence) cae
 * fuera de [desde, hasta]. Las reglas recurrentes no se tocan: solo generan
 * dentro de la ventana de pendientes, así que no vuelven a crear lo borrado.
 */
const FUERA_DE_RANGO = `COALESCE(venc, fecha) < ? OR COALESCE(venc, fecha) > ?`;

export async function contarFueraDeRango(
  db: SQLiteDatabase,
  desde: string,
  hasta: string
): Promise<{ antes: number; despues: number }> {
  const r = await db.getFirstAsync<{ antes: number; despues: number }>(
    `SELECT SUM(CASE WHEN COALESCE(venc, fecha) < ? THEN 1 ELSE 0 END) AS antes,
            SUM(CASE WHEN COALESCE(venc, fecha) > ? THEN 1 ELSE 0 END) AS despues
       FROM transacciones`,
    desde,
    hasta
  );
  return { antes: r?.antes ?? 0, despues: r?.despues ?? 0 };
}

export async function eliminarFueraDeRango(db: SQLiteDatabase, desde: string, hasta: string): Promise<number> {
  const r = await db.runAsync(`DELETE FROM transacciones WHERE ${FUERA_DE_RANGO}`, desde, hasta);
  return r.changes;
}
