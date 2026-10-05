import { describe, expect, it } from 'vitest';
import { migrateDbIfNeeded } from './schema';
import { crearDbFake, DbFake } from '../test/dbFake';

/**
 * Schema tal como quedó en la v3, congelado. Es historia: no se toca aunque
 * cambie el schema actual. Sirve para probar que una base ya instalada en el
 * teléfono de alguien sobrevive la migración con sus datos intactos.
 */
const SCHEMA_V3 = `
CREATE TABLE cuentas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'ARS', saldo_inicial REAL NOT NULL DEFAULT 0, icono TEXT);
CREATE TABLE categorias (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, emoji TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto','ingreso')), orden INTEGER NOT NULL DEFAULT 0);
CREATE TABLE reglas_recurrentes (id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto','ingreso')), nombre TEXT NOT NULL,
  categoria_id TEXT NOT NULL REFERENCES categorias(id), cuenta_id INTEGER REFERENCES cuentas(id),
  monto REAL NOT NULL, moneda TEXT NOT NULL DEFAULT 'ARS',
  periodo TEXT NOT NULL CHECK (periodo IN ('diario','semanal','mensual','anual')),
  fijo INTEGER NOT NULL DEFAULT 1, fecha_inicio TEXT NOT NULL, dia_venc INTEGER,
  activa INTEGER NOT NULL DEFAULT 1);
CREATE TABLE transacciones (id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto','ingreso')), nombre TEXT NOT NULL,
  categoria_id TEXT NOT NULL REFERENCES categorias(id), cuenta_id INTEGER REFERENCES cuentas(id),
  monto REAL NOT NULL, moneda TEXT NOT NULL DEFAULT 'ARS', fecha TEXT NOT NULL, venc TEXT,
  estado TEXT NOT NULL DEFAULT 'pagado' CHECK (estado IN ('pendiente','pagado')),
  regla_recurrente_id INTEGER REFERENCES reglas_recurrentes(id));
CREATE TABLE presupuestos (id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id TEXT REFERENCES categorias(id), mes TEXT NOT NULL, monto_limite REAL NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'ARS', UNIQUE(categoria_id, mes));

INSERT INTO categorias VALUES ('casa','Casa','C','gasto',0),('salario','Salario','S','ingreso',1);

-- Reglas como las dejaba la v3: solo dia_venc, y muchas veces ni eso.
INSERT INTO reglas_recurrentes (tipo,nombre,categoria_id,monto,periodo,fijo,fecha_inicio,dia_venc)
  VALUES ('gasto','Alquiler','casa',350000,'mensual',1,'2026-09-01',5),
         ('gasto','Nafta','casa',45000,'semanal',0,'2026-09-10',NULL),
         ('gasto','Seguro','casa',90000,'anual',1,'2026-03-17',NULL),
         ('ingreso','Sueldo','salario',520000,'mensual',1,'2026-09-01',NULL);

INSERT INTO transacciones (tipo,nombre,categoria_id,monto,fecha,venc,estado,regla_recurrente_id)
  VALUES ('gasto','Alquiler','casa',350000,'2026-09-01','2026-09-05','pagado',1),
         ('gasto','Super','casa',82000,'2026-09-08',NULL,'pagado',NULL),
         ('gasto','Internet','casa',28000,'2026-09-10','2026-09-15','pendiente',NULL);

PRAGMA user_version = 3;
`;

async function baseV3(): Promise<DbFake> {
  const db = crearDbFake();
  db.__raw.exec(SCHEMA_V3);
  return db;
}

const columnas = async (db: DbFake, tabla: string) =>
  (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabla})`)).map((c) => c.name);

const version = async (db: DbFake) =>
  (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version;

describe('migración — instalación nueva', () => {
  it('deja la base en la última versión con todas las columnas', async () => {
    const db = crearDbFake();
    await migrateDbIfNeeded(db);

    expect(await version(db)).toBe(8);
    expect(await columnas(db, 'reglas_recurrentes')).toEqual(
      expect.arrayContaining(['dia_semana', 'mes_anio', 'fecha_fin'])
    );
    expect(await columnas(db, 'transacciones')).toEqual(expect.arrayContaining(['pagado_en', 'venc_regla']));
    db.cerrar();
  });

  it('deja seteada la ventana de pendientes por defecto', async () => {
    const db = crearDbFake();
    await migrateDbIfNeeded(db);

    const cfg = await db.getFirstAsync<{ valor: string }>(
      "SELECT valor FROM config WHERE clave = 'ventana_pendientes_dias'"
    );
    expect(cfg!.valor).toBe('45');
    db.cerrar();
  });
});

describe('migración v3 -> v4 sobre una base con datos', () => {
  it('deriva dia_semana de fecha_inicio en las reglas semanales', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    // 2026-09-10 es jueves -> 4
    const r = await db.getFirstAsync<{ dia_semana: number }>(
      "SELECT dia_semana FROM reglas_recurrentes WHERE nombre = 'Nafta'"
    );
    expect(r!.dia_semana).toBe(4);
    db.cerrar();
  });

  it('deriva mes_anio y dia_venc en las reglas anuales', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    const r = await db.getFirstAsync<{ mes_anio: number; dia_venc: number }>(
      "SELECT mes_anio, dia_venc FROM reglas_recurrentes WHERE nombre = 'Seguro'"
    );
    expect(r).toMatchObject({ mes_anio: 3, dia_venc: 17 });
    db.cerrar();
  });

  it('no pisa un dia_venc que ya estaba cargado', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    const r = await db.getFirstAsync<{ dia_venc: number }>(
      "SELECT dia_venc FROM reglas_recurrentes WHERE nombre = 'Alquiler'"
    );
    expect(r!.dia_venc).toBe(5);
    db.cerrar();
  });

  it('rellena venc con fecha donde estaba vacío', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    const t = await db.getFirstAsync<{ venc: string }>(
      "SELECT venc FROM transacciones WHERE nombre = 'Super'"
    );
    expect(t!.venc).toBe('2026-09-08');
    db.cerrar();
  });

  it('rellena pagado_en solo en las pagadas', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    const pagada = await db.getFirstAsync<{ pagado_en: string | null }>(
      "SELECT pagado_en FROM transacciones WHERE nombre = 'Alquiler'"
    );
    const pendiente = await db.getFirstAsync<{ pagado_en: string | null }>(
      "SELECT pagado_en FROM transacciones WHERE nombre = 'Internet'"
    );
    expect(pagada!.pagado_en).toBe('2026-09-01');
    expect(pendiente!.pagado_en).toBeNull();
    db.cerrar();
  });

  it('no pierde datos y es idempotente si se corre de nuevo', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);
    await migrateDbIfNeeded(db);

    const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM transacciones');
    expect(n!.n).toBe(3);
    expect(await version(db)).toBe(8);
    db.cerrar();
  });
});

describe('migración v4 -> v5 (precios)', () => {
  it('crea la tabla de precios en una instalación nueva', async () => {
    const db = crearDbFake();
    await migrateDbIfNeeded(db);

    expect(await columnas(db, 'precios')).toEqual(
      expect.arrayContaining(['producto', 'precio', 'moneda', 'comercio', 'categoria_id', 'fecha'])
    );
    db.cerrar();
  });

  it('la agrega también sobre una base vieja, sin tocar sus datos', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM precios');
    const tx = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM transacciones');
    expect(n!.n).toBe(0);
    expect(tx!.n).toBe(3);
    expect(await version(db)).toBe(8);
    db.cerrar();
  });
});

describe('migración v7 -> v8 (sincronización)', () => {
  it('da un uuid único a cada registro existente, sin anotarlos para subir', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    const tx = await db.getAllAsync<{ uuid: string; regla_recurrente_id: number | null; actualizado: string }>(
      'SELECT uuid, regla_recurrente_id, actualizado FROM transacciones'
    );
    expect(tx).toHaveLength(3);
    expect(new Set(tx.map((t) => t.uuid)).size).toBe(3);
    expect(tx.every((t) => t.actualizado)).toBe(true);
    // La cuota del alquiler toma el uuid derivado de su regla y su vencimiento.
    const regla = await db.getFirstAsync<{ uuid: string }>("SELECT uuid FROM reglas_recurrentes WHERE nombre = 'Alquiler'");
    expect(tx.find((t) => t.regla_recurrente_id === 1)!.uuid).toBe(`${regla!.uuid}:2026-09-05`);
    // Lo que ya había no sube solo: eso lo decide el usuario al entrar a su cuenta.
    const cola = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM sync_cola');
    expect(cola!.n).toBe(0);
    db.cerrar();
  });

  it('deja los triggers andando y un id de dispositivo', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    await db.runAsync("UPDATE transacciones SET monto = 1 WHERE nombre = 'Super'");
    const cola = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM sync_cola');
    const disp = await db.getFirstAsync<{ valor: string }>("SELECT valor FROM sync_meta WHERE clave = 'dispositivo_id'");
    expect(cola!.n).toBe(1);
    expect(disp!.valor).toMatch(/^[0-9a-f-]{36}$/);
    db.cerrar();
  });
});

describe('migración v5 -> v6 (categorías nuevas)', () => {
  it('agrega Viajes, Tarjetas y Servicios a una base vieja', async () => {
    const db = await baseV3();
    await migrateDbIfNeeded(db);

    const ids = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM categorias WHERE id IN ('viajes','tarj','serv') ORDER BY id"
    );
    expect(ids.map((r) => r.id)).toEqual(['serv', 'tarj', 'viajes']);
    // Con la fila presente, la FK de transacciones acepta la categoría nueva.
    await db.runAsync(
      "INSERT INTO transacciones (tipo,nombre,categoria_id,monto,fecha) VALUES ('gasto','Pasaje','viajes',1000,'2026-10-03')"
    );
    db.cerrar();
  });
});
