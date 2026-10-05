import type { SQLiteDatabase } from 'expo-sqlite';
import { CATS, CATS_ING, MONEDA_DEFAULT } from '../lib/categorias';
import { iso, hoy } from '../lib/format';

const DATABASE_VERSION = 8;

/** uuid v4 armado en SQL. randomblob se evalúa por fila: cada una recibe el suyo. */
const UUID_SQL = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2)
  || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`;

/** Hora UTC con milisegundos, en el mismo formato que Date.toISOString(). */
const AHORA_SQL = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/**
 * Hora de las ocurrencias que genera una regla. Es a propósito la más vieja
 * posible: si dos dispositivos generan la misma cuota y uno ya la pagó, la
 * versión pagada tiene que ganarle a la recién generada, siempre.
 */
export const HORA_GENERADA = '2000-01-01T00:00:00.000Z';

/**
 * Hora de un cambio sobre una fila que ya tenía `previa`: ahora, pero siempre
 * al menos 1 ms después de la anterior. Sin esto, crear y borrar (o editar)
 * dentro del mismo milisegundo empata, y en un empate gana lo que ya está: el
 * otro dispositivo no se enteraría del cambio.
 */
const despuesDe = (previa: string) =>
  `MAX(${AHORA_SQL}, COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', ${previa}, '+0.001 seconds'), ''))`;

/** Mientras se aplican cambios bajados de la nube, los triggers no anotan nada. */
const NO_APLICANDO = `(SELECT valor FROM sync_meta WHERE clave = 'aplicando') IS NOT '1'`;

/**
 * Triggers de sincronización de una tabla. No son historia como las
 * migraciones: se reinstalan en cada arranque (ver instalarTriggersSync), así
 * que un arreglo acá llega a todas las bases sin migración nueva.
 *
 * - Alta: asigna uuid y hora, y anota en la cola.
 * - Cambio: renueva la hora y anota. Si el UPDATE ya traía su propia hora (lo
 *   hace el alta, de arriba) no hace nada, para no pisarla.
 * - Baja: anota la baja en la cola, con la hora en que ocurrió.
 */
function triggersSync(tabla: 'reglas_recurrentes' | 'transacciones' | 'precios'): string {
  // Una ocurrencia de regla toma un uuid derivado de la regla y su
  // vencimiento original: dos dispositivos que generan la misma cuota generan
  // el mismo registro. Si ese uuid ya está tomado (una ocurrencia que se
  // desprendió de la regla), va uno al azar para no chocar.
  const uuidNuevo =
    tabla === 'transacciones'
      ? `CASE
           WHEN NEW.regla_recurrente_id IS NOT NULL
            AND (SELECT uuid FROM reglas_recurrentes WHERE id = NEW.regla_recurrente_id) IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM transacciones
               WHERE uuid = (SELECT uuid FROM reglas_recurrentes WHERE id = NEW.regla_recurrente_id)
                            || ':' || COALESCE(NEW.venc_regla, NEW.venc, NEW.fecha))
           THEN (SELECT uuid FROM reglas_recurrentes WHERE id = NEW.regla_recurrente_id)
                || ':' || COALESCE(NEW.venc_regla, NEW.venc, NEW.fecha)
           ELSE ${UUID_SQL}
         END`
      : UUID_SQL;

  return `
    DROP TRIGGER IF EXISTS sync_alta_${tabla};
    DROP TRIGGER IF EXISTS sync_cambio_${tabla};
    DROP TRIGGER IF EXISTS sync_baja_${tabla};

    CREATE TRIGGER sync_alta_${tabla} AFTER INSERT ON ${tabla}
    WHEN ${NO_APLICANDO}
    BEGIN
      UPDATE ${tabla} SET uuid = COALESCE(NEW.uuid, ${uuidNuevo}), actualizado = '' WHERE id = NEW.id;
      UPDATE ${tabla}
         SET actualizado = CASE WHEN uuid LIKE '%:%' THEN '${HORA_GENERADA}' ELSE ${AHORA_SQL} END
       WHERE id = NEW.id;
      INSERT OR REPLACE INTO sync_cola (tabla, uuid, borrado, actualizado)
        SELECT '${tabla}', uuid, 0, actualizado FROM ${tabla} WHERE id = NEW.id;
    END;

    CREATE TRIGGER sync_cambio_${tabla} AFTER UPDATE ON ${tabla}
    WHEN ${NO_APLICANDO} AND NEW.actualizado IS OLD.actualizado AND NEW.uuid IS NOT NULL
    BEGIN
      UPDATE ${tabla} SET actualizado = ${despuesDe('OLD.actualizado')} WHERE id = NEW.id;
      INSERT OR REPLACE INTO sync_cola (tabla, uuid, borrado, actualizado)
        SELECT '${tabla}', uuid, 0, actualizado FROM ${tabla} WHERE id = NEW.id;
    END;

    CREATE TRIGGER sync_baja_${tabla} AFTER DELETE ON ${tabla}
    WHEN ${NO_APLICANDO} AND OLD.uuid IS NOT NULL
    BEGIN
      INSERT OR REPLACE INTO sync_cola (tabla, uuid, borrado, actualizado)
        VALUES ('${tabla}', OLD.uuid, 1, ${despuesDe('OLD.actualizado')});
    END;
  `;
}

async function instalarTriggersSync(db: SQLiteDatabase) {
  for (const tabla of ['reglas_recurrentes', 'transacciones', 'precios'] as const) {
    await db.execAsync(triggersSync(tabla));
  }
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) {
    await instalarTriggersSync(db);
    return;
  }

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

  if (currentVersion === 4) {
    // v5: registro de precios. Vive aparte del balance a propósito: anotar
    // cuánto salió el aceite en el súper no es un gasto, es un dato de
    // referencia para comparar después.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS precios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto TEXT NOT NULL,
        precio REAL NOT NULL,
        moneda TEXT NOT NULL DEFAULT '${MONEDA_DEFAULT}',
        comercio TEXT NOT NULL,
        categoria_id TEXT REFERENCES categorias(id),
        fecha TEXT NOT NULL
      );

      -- La consulta que importa es "este producto, a lo largo del tiempo".
      CREATE INDEX IF NOT EXISTS idx_precios_producto ON precios(producto, fecha);
      CREATE INDEX IF NOT EXISTS idx_precios_fecha ON precios(fecha);
    `);

    currentVersion = 5;
  }

  if (currentVersion === 5) {
    // v6: categorías nuevas (Viajes, Tarjetas, Servicios). La UI lee CATS del
    // código, pero transacciones.categoria_id tiene FK a categorias(id): una base
    // ya instalada necesita las filas. OR IGNORE: inserta solo las que falten.
    for (const [i, c] of [...CATS, ...CATS_ING].entries()) {
      await db.runAsync(
        'INSERT OR IGNORE INTO categorias (id, nombre, emoji, tipo, orden) VALUES (?, ?, ?, ?, ?)',
        c.id, c.nombre, c.emoji, c.tipo, i
      );
    }
    currentVersion = 6;
  }

  if (currentVersion === 6) {
    // v7: venc_regla guarda el vencimiento que generó la regla cuando el
    // usuario mueve una ocurrencia a otra fecha (arrastrándola en el
    // calendario o editándola). Sin esto, materializar no la reconoce como
    // propia y vuelve a crear la del día original: aparece duplicada.
    await db.execAsync('ALTER TABLE transacciones ADD COLUMN venc_regla TEXT;');
    currentVersion = 7;
  }

  if (currentVersion === 7) {
    // v8: sincronización con Supabase. Cada fila sincronizable recibe un uuid
    // (el id numérico solo vale en este dispositivo) y la hora de su último
    // cambio, que decide los conflictos: gana el cambio más reciente.
    //
    // Los triggers anotan en sync_cola todo alta, cambio o baja, así las
    // consultas de la app no tuvieron que enterarse de que existe la nube.
    await db.execAsync(`
      ALTER TABLE reglas_recurrentes ADD COLUMN uuid TEXT;
      ALTER TABLE reglas_recurrentes ADD COLUMN actualizado TEXT;
      ALTER TABLE transacciones ADD COLUMN uuid TEXT;
      ALTER TABLE transacciones ADD COLUMN actualizado TEXT;
      ALTER TABLE precios ADD COLUMN uuid TEXT;
      ALTER TABLE precios ADD COLUMN actualizado TEXT;

      UPDATE reglas_recurrentes SET uuid = ${UUID_SQL};
      UPDATE precios SET uuid = ${UUID_SQL};
      -- Ocurrencias de regla: uuid derivado de regla + vencimiento original,
      -- igual que el que les pone el trigger. Si hubiera dos de la misma regla
      -- y día (no debería), solo la primera lo toma; la otra va al azar.
      UPDATE transacciones
         SET uuid = (SELECT r.uuid FROM reglas_recurrentes r WHERE r.id = transacciones.regla_recurrente_id)
                    || ':' || COALESCE(venc_regla, venc, fecha)
       WHERE regla_recurrente_id IS NOT NULL
         AND id = (SELECT MIN(t2.id) FROM transacciones t2
                    WHERE t2.regla_recurrente_id = transacciones.regla_recurrente_id
                      AND COALESCE(t2.venc_regla, t2.venc, t2.fecha)
                          = COALESCE(transacciones.venc_regla, transacciones.venc, transacciones.fecha));
      UPDATE transacciones SET uuid = ${UUID_SQL} WHERE uuid IS NULL;

      UPDATE reglas_recurrentes SET actualizado = ${AHORA_SQL};
      UPDATE transacciones SET actualizado = ${AHORA_SQL};
      UPDATE precios SET actualizado = ${AHORA_SQL};

      CREATE UNIQUE INDEX IF NOT EXISTS ux_reglas_uuid ON reglas_recurrentes(uuid);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_transacciones_uuid ON transacciones(uuid);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_precios_uuid ON precios(uuid);

      -- Cambios locales que todavía no subieron. Una fila por registro: si se
      -- edita tres veces antes de sincronizar, sube una vez, con lo último.
      CREATE TABLE IF NOT EXISTS sync_cola (
        tabla TEXT NOT NULL,
        uuid TEXT NOT NULL,
        borrado INTEGER NOT NULL DEFAULT 0,
        actualizado TEXT NOT NULL,
        PRIMARY KEY (tabla, uuid)
      );

      -- Estado de la sincronización: usuario dueño de los datos, cursores de
      -- descarga, id del dispositivo y la bandera 'aplicando'.
      CREATE TABLE IF NOT EXISTS sync_meta (
        clave TEXT PRIMARY KEY,
        valor TEXT
      );

      -- Uso de la app, para entender cómo se usa. Sube con la sincronización.
      CREATE TABLE IF NOT EXISTS eventos_cola (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        props TEXT,
        ocurrido TEXT NOT NULL
      );

      INSERT OR IGNORE INTO sync_meta (clave, valor) VALUES ('dispositivo_id', ${UUID_SQL});
    `);
    // Los triggers se instalan al final (instalarTriggersSync), no acá.
    currentVersion = 8;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  await instalarTriggersSync(db);
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

  const ahora = hoy();
  const dEste = (dia: number) => iso(new Date(ahora.getFullYear(), ahora.getMonth(), dia, 12));

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
