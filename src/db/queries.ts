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

export async function crearTransaccion(db: SQLiteDatabase, input: NuevaTransaccion) {
  const moneda = input.moneda ?? MONEDA_DEFAULT;
  let reglaId: number | null = null;

  if (input.rec && input.periodo) {
    // El ancla de repetición sale del vencimiento si lo hay, y si no de la
    // fecha de la transacción. Cada periodo necesita su propia ancla:
    // mensual -> día del mes; semanal -> día de la semana; anual -> día y mes.
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
      input.periodo,
      input.fijo ? 1 : 0,
      input.fecha,
      input.periodo === 'mensual' || input.periodo === 'anual' ? diaAncla : null,
      input.periodo === 'semanal' ? diaSemanaISO(ancla) : null,
      input.periodo === 'anual' ? mesAncla : null
    );
    reglaId = r.lastInsertRowId;
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
