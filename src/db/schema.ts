import type { SQLiteDatabase } from 'expo-sqlite';
import { CATS, CATS_ING, MONEDA_DEFAULT } from '../lib/categorias';
import { iso, hoy } from '../lib/format';

const DATABASE_VERSION = 4;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      PRAGMA foreign_keys = ON;

      CREATE TABLE cuentas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        moneda TEXT NOT NULL DEFAULT '${MONEDA_DEFAULT}',
        saldo_inicial REAL NOT NULL DEFAULT 0,
        icono TEXT
      );

      CREATE TABLE categorias (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        emoji TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('gasto','ingreso')),
        orden INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE reglas_recurrentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL CHECK (tipo IN ('gasto','ingreso')),
        nombre TEXT NOT NULL,
        categoria_id TEXT NOT NULL REFERENCES categorias(id),
        cuenta_id INTEGER REFERENCES cuentas(id),
        monto REAL NOT NULL,
        moneda TEXT NOT NULL DEFAULT '${MONEDA_DEFAULT}',
        periodo TEXT NOT NULL CHECK (periodo IN ('diario','semanal','mensual','anual')),
        fijo INTEGER NOT NULL DEFAULT 1,
        fecha_inicio TEXT NOT NULL,
        dia_venc INTEGER,
        activa INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE transacciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL CHECK (tipo IN ('gasto','ingreso')),
        nombre TEXT NOT NULL,
        categoria_id TEXT NOT NULL REFERENCES categorias(id),
        cuenta_id INTEGER REFERENCES cuentas(id),
        monto REAL NOT NULL,
        moneda TEXT NOT NULL DEFAULT '${MONEDA_DEFAULT}',
        fecha TEXT NOT NULL,
        venc TEXT,
        estado TEXT NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pendiente','pagado')),
        regla_recurrente_id INTEGER REFERENCES reglas_recurrentes(id)
      );
      CREATE INDEX idx_transacciones_fecha ON transacciones(fecha);
      CREATE INDEX idx_transacciones_tipo ON transacciones(tipo);

      CREATE TABLE presupuestos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoria_id TEXT REFERENCES categorias(id),
        mes TEXT NOT NULL,
        monto_limite REAL NOT NULL,
        moneda TEXT NOT NULL DEFAULT '${MONEDA_DEFAULT}',
        UNIQUE(categoria_id, mes)
      );
    `);

    await seed(db);
    currentVersion = 3;

  }

  if (currentVersion === 1) {
    // v2: los ingresos también manejan estado (pendiente/cobrado). En el seed,
    // "Venta usados" pasa a pendiente para reflejar el balance real del prototipo.
    await db.runAsync(
      "UPDATE transacciones SET estado = 'pendiente' WHERE tipo = 'ingreso' AND nombre = 'Venta usados'"
    );
    currentVersion = 2;
  }

  if (currentVersion === 2) {
    // v3: sanea fechas guardadas con formato inválido (crasheaban la app al leer)
    const GLOB_FECHA = "'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";
    await db.execAsync(`
      UPDATE transacciones SET fecha = date('now') WHERE fecha NOT GLOB ${GLOB_FECHA};
      UPDATE transacciones SET venc = NULL WHERE venc IS NOT NULL AND venc NOT GLOB ${GLOB_FECHA};
      UPDATE reglas_recurrentes SET fecha_inicio = date('now') WHERE fecha_inicio NOT GLOB ${GLOB_FECHA};
    `);
    currentVersion = 3;
  }

  if (currentVersion === 3) {
    // v4: recurrentes completos (semanal/anual con ancla propia), fecha de pago
    // y tabla de configuracion para la ventana de "por pagar".
    await db.execAsync(`
      ALTER TABLE reglas_recurrentes ADD COLUMN dia_semana INTEGER;
      ALTER TABLE reglas_recurrentes ADD COLUMN mes_anio INTEGER;
      ALTER TABLE reglas_recurrentes ADD COLUMN fecha_fin TEXT;
      ALTER TABLE transacciones ADD COLUMN pagado_en TEXT;

      CREATE TABLE IF NOT EXISTS config (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
    `);

    await db.runAsync(
      "INSERT OR IGNORE INTO config (clave, valor) VALUES ('ventana_pendientes_dias', '45')"
    );

    // Backfill de anclas: las reglas viejas solo tenian dia_venc.
    // strftime('%w') -> 0=domingo..6=sabado, igual que dia_semana.
    await db.execAsync(`
      UPDATE reglas_recurrentes
         SET dia_semana = CAST(strftime('%w', fecha_inicio) AS INTEGER)
       WHERE periodo = 'semanal' AND dia_semana IS NULL;

      UPDATE reglas_recurrentes
         SET mes_anio = CAST(strftime('%m', fecha_inicio) AS INTEGER)
       WHERE periodo = 'anual' AND mes_anio IS NULL;

      UPDATE reglas_recurrentes
         SET dia_venc = CAST(strftime('%d', fecha_inicio) AS INTEGER)
       WHERE periodo IN ('mensual','anual') AND dia_venc IS NULL;

      UPDATE transacciones SET venc = fecha WHERE venc IS NULL;
      UPDATE transacciones SET pagado_en = fecha WHERE estado = 'pagado' AND pagado_en IS NULL;

      CREATE INDEX IF NOT EXISTS idx_transacciones_estado_venc ON transacciones(estado, venc);
      CREATE INDEX IF NOT EXISTS idx_transacciones_regla_venc ON transacciones(regla_recurrente_id, venc);
      CREATE INDEX IF NOT EXISTS idx_transacciones_pagado_en ON transacciones(pagado_en);
    `);

    currentVersion = 4;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

async function seed(db: SQLiteDatabase) {
  for (const [i, c] of [...CATS, ...CATS_ING].entries()) {
    await db.runAsync(
      'INSERT INTO categorias (id, nombre, emoji, tipo, orden) VALUES (?, ?, ?, ?, ?)',
      c.id, c.nombre, c.emoji, c.tipo, i
    );
  }

  await db.runAsync(
    "INSERT INTO cuentas (nombre, moneda, saldo_inicial, icono) VALUES ('Efectivo', ?, 0, '💵')",
    MONEDA_DEFAULT
  );

  const dEste = (dia: number) => iso(new Date(hoy.getFullYear(), hoy.getMonth(), dia, 12));

  const seedGastos = [
    { nombre: 'Alquiler', cat: 'casa', monto: 350000, fecha: dEste(1), rec: true, periodo: 'mensual', fijo: 1, estado: 'pagado', venc: dEste(5) },
    { nombre: 'Supermercado', cat: 'comida', monto: 82000, fecha: dEste(8), rec: false, periodo: null, fijo: 0, estado: 'pagado', venc: dEste(8) },
    { nombre: 'Internet fibra', cat: 'tel', monto: 28000, fecha: dEste(10), rec: true, periodo: 'mensual', fijo: 1, estado: 'pendiente', venc: dEste(15) },
    { nombre: 'Nafta', cat: 'auto', monto: 45000, fecha: dEste(12), rec: true, periodo: 'semanal', fijo: 0, estado: 'pagado', venc: dEste(12) },
    { nombre: 'Cuota préstamo', cat: 'prest', monto: 96000, fecha: dEste(3), rec: true, periodo: 'mensual', fijo: 1, estado: 'pendiente', venc: dEste(20) },
  ] as const;

  const seedIngresos = [
    { nombre: 'Sueldo', cat: 'salario', monto: 520000, fecha: dEste(1), rec: true, periodo: 'mensual', estado: 'pagado' },
    { nombre: 'Venta usados', cat: 'extras', monto: 30000, fecha: dEste(9), rec: false, periodo: null, estado: 'pendiente' },
  ] as const;

  for (const g of seedGastos) {
    let reglaId: number | null = null;
    if (g.rec) {
      const r = await db.runAsync(
        `INSERT INTO reglas_recurrentes (tipo, nombre, categoria_id, monto, moneda, periodo, fijo, fecha_inicio, dia_venc)
         VALUES ('gasto', ?, ?, ?, ?, ?, ?, ?, ?)`,
        g.nombre, g.cat, g.monto, MONEDA_DEFAULT, g.periodo!, g.fijo, g.fecha, new Date(g.venc + 'T12:00').getDate()
      );
      reglaId = r.lastInsertRowId;
    }
    await db.runAsync(
      `INSERT INTO transacciones (tipo, nombre, categoria_id, monto, moneda, fecha, venc, estado, regla_recurrente_id)
       VALUES ('gasto', ?, ?, ?, ?, ?, ?, ?, ?)`,
      g.nombre, g.cat, g.monto, MONEDA_DEFAULT, g.fecha, g.venc, g.estado, reglaId
    );
  }

  for (const it of seedIngresos) {
    let reglaId: number | null = null;
    if (it.rec) {
      const r = await db.runAsync(
        `INSERT INTO reglas_recurrentes (tipo, nombre, categoria_id, monto, moneda, periodo, fijo, fecha_inicio)
         VALUES ('ingreso', ?, ?, ?, ?, ?, 1, ?)`,
        it.nombre, it.cat, it.monto, MONEDA_DEFAULT, it.periodo!, it.fecha
      );
      reglaId = r.lastInsertRowId;
    }
    await db.runAsync(
      `INSERT INTO transacciones (tipo, nombre, categoria_id, monto, moneda, fecha, estado, regla_recurrente_id)
       VALUES ('ingreso', ?, ?, ?, ?, ?, ?, ?)`,
      it.nombre, it.cat, it.monto, MONEDA_DEFAULT, it.fecha, it.estado, reglaId
    );
  }
}
