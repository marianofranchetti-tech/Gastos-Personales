import type { SQLiteDatabase } from 'expo-sqlite';
import { MONEDA_DEFAULT, Periodo, TipoTx } from '../lib/categorias';
import { Estado } from './types';

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
    const diaVenc = input.venc ? new Date(`${input.venc}T12:00`).getDate() : null;
    const r = await db.runAsync(
      `INSERT INTO reglas_recurrentes (tipo, nombre, categoria_id, cuenta_id, monto, moneda, periodo, fijo, fecha_inicio, dia_venc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.tipo,
      input.nombre,
      input.categoria_id,
      input.cuenta_id ?? null,
      input.monto,
      moneda,
      input.periodo,
      input.fijo ? 1 : 0,
      input.fecha,
      diaVenc
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
  await db.runAsync(
    `UPDATE transacciones SET estado = CASE estado WHEN 'pagado' THEN 'pendiente' ELSE 'pagado' END WHERE id = ?`,
    id
  );
}
