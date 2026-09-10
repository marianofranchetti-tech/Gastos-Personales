/**
 * Helpers para armar bases de prueba.
 *
 * La base "nueva" se construye corriendo la migración real, no un DDL copiado:
 * si `migrateDbIfNeeded` se rompe, los tests de materialización se rompen con
 * ella, que es exactamente lo que queremos.
 */
import { migrateDbIfNeeded } from '../db/schema';
import { crearDbFake, DbFake } from './dbFake';

/** Base migrada a la última versión, con el seed y todo vaciado. */
export async function baseVacia(): Promise<DbFake> {
  const db = crearDbFake();
  await migrateDbIfNeeded(db);
  // El seed usa la fecha real del sistema; lo borramos para que cada test
  // controle sus propios datos.
  await db.execAsync('DELETE FROM transacciones; DELETE FROM reglas_recurrentes;');
  return db;
}

type ReglaSeed = {
  tipo?: 'gasto' | 'ingreso';
  nombre?: string;
  categoria_id?: string;
  monto?: number;
  moneda?: string;
  periodo?: 'diario' | 'semanal' | 'mensual' | 'anual';
  dia_venc?: number | null;
  dia_semana?: number | null;
  mes_anio?: number | null;
  fecha_inicio?: string;
  fecha_fin?: string | null;
  activa?: number;
};

export async function insertarRegla(db: DbFake, r: ReglaSeed = {}): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO reglas_recurrentes
       (tipo, nombre, categoria_id, monto, moneda, periodo, fijo,
        fecha_inicio, fecha_fin, dia_venc, dia_semana, mes_anio, activa)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    r.tipo ?? 'gasto',
    r.nombre ?? 'Alquiler',
    r.categoria_id ?? 'casa',
    r.monto ?? 100000,
    r.moneda ?? 'ARS',
    r.periodo ?? 'mensual',
    r.fecha_inicio ?? '2026-01-01',
    r.fecha_fin ?? null,
    r.dia_venc ?? null,
    r.dia_semana ?? null,
    r.mes_anio ?? null,
    r.activa ?? 1
  );
  return res.lastInsertRowId;
}

type TxSeed = {
  tipo?: 'gasto' | 'ingreso';
  nombre?: string;
  categoria_id?: string;
  monto?: number;
  moneda?: string;
  fecha?: string;
  venc?: string | null;
  estado?: 'pendiente' | 'pagado';
  regla_recurrente_id?: number | null;
};

export async function insertarTx(db: DbFake, t: TxSeed = {}): Promise<number> {
  const fecha = t.fecha ?? '2026-09-01';
  const res = await db.runAsync(
    `INSERT INTO transacciones
       (tipo, nombre, categoria_id, monto, moneda, fecha, venc, estado, regla_recurrente_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.tipo ?? 'gasto',
    t.nombre ?? 'Suelto',
    t.categoria_id ?? 'casa',
    t.monto ?? 50000,
    t.moneda ?? 'ARS',
    fecha,
    t.venc === undefined ? fecha : t.venc,
    t.estado ?? 'pendiente',
    t.regla_recurrente_id ?? null
  );
  return res.lastInsertRowId;
}

/** Vencimientos generados para una regla, en orden. */
export async function vencimientos(db: DbFake, reglaId: number): Promise<string[]> {
  const filas = await db.getAllAsync<{ venc: string }>(
    'SELECT venc FROM transacciones WHERE regla_recurrente_id = ? ORDER BY venc',
    reglaId
  );
  return filas.map((f) => f.venc);
}
