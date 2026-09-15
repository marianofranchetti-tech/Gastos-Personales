import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarTransaccion,
  crearTransaccion,
  eliminarTransaccion,
  limpiarDatos,
  NuevaTransaccion,
} from './queries';
import { materializarRecurrentes } from './materializar';
import { baseVacia, insertarRegla, insertarTx, vencimientos } from '../test/fixtures';
import type { DbFake } from '../test/dbFake';

let db: DbFake;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T10:00:00'));
  db = await baseVacia();
});

afterEach(() => {
  vi.useRealTimers();
  db.cerrar();
});

const base: NuevaTransaccion = {
  tipo: 'gasto',
  nombre: 'Alquiler',
  monto: 350000,
  categoria_id: 'casa',
  fecha: '2026-09-05',
  venc: '2026-09-05',
  rec: true,
  periodo: 'mensual',
  fijo: true,
  estado: 'pendiente',
};

const fila = (id: number) =>
  db.getFirstAsync<any>('SELECT * FROM transacciones WHERE id = ?', id);
const regla = (id: number) =>
  db.getFirstAsync<any>('SELECT * FROM reglas_recurrentes WHERE id = ?', id);

/** Una regla mensual ya materializada, con el primer mes pagado. */
async function escenario() {
  const reglaId = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 350000 });
  await materializarRecurrentes(db); // 2026-09-05 y 2026-10-05
  const sept = await db.getFirstAsync<any>(
    "SELECT id FROM transacciones WHERE venc = '2026-09-05'"
  );
  await db.runAsync(
    "UPDATE transacciones SET estado='pagado', pagado_en='2026-09-05' WHERE id = ?",
    sept.id
  );
  const oct = await db.getFirstAsync<any>(
    "SELECT id FROM transacciones WHERE venc = '2026-10-05'"
  );
  return { reglaId, septId: sept.id as number, octId: oct.id as number };
}

describe('actualizarTransaccion — alcance solo', () => {
  it('cambia ese movimiento y deja la regla intacta', async () => {
    const { reglaId, octId } = await escenario();

    await actualizarTransaccion(db, octId, { ...base, monto: 400000 }, 'solo');

    expect((await fila(octId)).monto).toBe(400000);
    expect((await regla(reglaId)).monto).toBe(350000);
  });

  it('no arrastra a los otros pendientes de la misma regla', async () => {
    const { reglaId, octId } = await escenario();
    await db.runAsync(
      `INSERT INTO transacciones (tipo,nombre,categoria_id,monto,moneda,fecha,venc,estado,regla_recurrente_id)
       VALUES ('gasto','Alquiler','casa',350000,'ARS','2026-11-05','2026-11-05','pendiente',?)`,
      reglaId
    );

    await actualizarTransaccion(db, octId, { ...base, monto: 400000 }, 'solo');

    const nov = await db.getFirstAsync<any>("SELECT monto FROM transacciones WHERE venc='2026-11-05'");
    expect(nov.monto).toBe(350000);
  });
});

describe('actualizarTransaccion — alcance adelante', () => {
  it('actualiza la regla y los pendientes futuros', async () => {
    const { reglaId, octId } = await escenario();

    await actualizarTransaccion(db, octId, { ...base, monto: 400000 }, 'adelante');

    expect((await fila(octId)).monto).toBe(400000);
    expect((await regla(reglaId)).monto).toBe(400000);
  });

  it('NO toca lo ya pagado: es historia, no proyección', async () => {
    const { septId, octId } = await escenario();

    await actualizarTransaccion(db, octId, { ...base, monto: 400000 }, 'adelante');

    expect((await fila(septId)).monto).toBe(350000);
  });

  it('no toca pendientes anteriores al movimiento editado', async () => {
    const { reglaId, octId } = await escenario();
    await db.runAsync(
      `INSERT INTO transacciones (tipo,nombre,categoria_id,monto,moneda,fecha,venc,estado,regla_recurrente_id)
       VALUES ('gasto','Alquiler','casa',350000,'ARS','2026-08-05','2026-08-05','pendiente',?)`,
      reglaId
    );

    await actualizarTransaccion(db, octId, { ...base, monto: 400000 }, 'adelante');

    const ago = await db.getFirstAsync<any>("SELECT monto FROM transacciones WHERE venc='2026-08-05'");
    expect(ago.monto).toBe(350000);
  });
});

describe('cambios de clasificación', () => {
  it('de recurrente a eventual con alcance adelante corta la regla', async () => {
    const { reglaId, octId } = await escenario();

    await actualizarTransaccion(db, octId, { ...base, rec: false, periodo: undefined }, 'adelante');

    expect((await fila(octId)).regla_recurrente_id).toBeNull();
    expect((await regla(reglaId)).fecha_fin).toBe('2026-10-04');
    // Y no vuelve a generar en la próxima apertura.
    expect(await materializarRecurrentes(db)).toBe(0);
  });

  it('de recurrente a eventual con alcance solo desprende únicamente ese mes', async () => {
    const { reglaId, octId } = await escenario();

    await actualizarTransaccion(db, octId, { ...base, rec: false, periodo: undefined }, 'solo');

    expect((await fila(octId)).regla_recurrente_id).toBeNull();
    expect((await regla(reglaId)).fecha_fin).toBeNull();
  });

  it('de eventual a recurrente crea la regla y engancha el movimiento', async () => {
    const id = await insertarTx(db, { nombre: 'Gimnasio', venc: '2026-09-20', monto: 30000 });

    await actualizarTransaccion(
      db,
      id,
      { ...base, nombre: 'Gimnasio', monto: 30000, fecha: '2026-09-20', venc: '2026-09-20' },
      'solo'
    );

    const f = await fila(id);
    expect(f.regla_recurrente_id).not.toBeNull();
    const r = await regla(f.regla_recurrente_id);
    expect(r).toMatchObject({ nombre: 'Gimnasio', periodo: 'mensual', dia_venc: 20 });
  });
});

describe('estado y fecha de pago al editar', () => {
  it('marcar pagado registra la fecha, y volver atrás la borra', async () => {
    const id = await insertarTx(db, { venc: '2026-09-20' });

    await actualizarTransaccion(db, id, { ...base, rec: false, periodo: undefined, estado: 'pagado' }, 'solo');
    expect((await fila(id)).pagado_en).toBe('2026-09-01');

    await actualizarTransaccion(db, id, { ...base, rec: false, periodo: undefined, estado: 'pendiente' }, 'solo');
    expect((await fila(id)).pagado_en).toBeNull();
  });
});

describe('eliminarTransaccion', () => {
  it('con alcance solo borra ese movimiento y la regla sigue viva', async () => {
    const { reglaId, octId } = await escenario();

    await eliminarTransaccion(db, octId, 'solo');

    expect(await fila(octId)).toBeNull();
    expect((await regla(reglaId)).fecha_fin).toBeNull();
    // Al reabrir la app vuelve a generarlo, porque la regla sigue activa.
    expect(await materializarRecurrentes(db)).toBe(1);
  });

  it('con alcance adelante corta la regla y no reaparece', async () => {
    const { reglaId, octId } = await escenario();

    await eliminarTransaccion(db, octId, 'adelante');

    expect(await fila(octId)).toBeNull();
    expect((await regla(reglaId)).fecha_fin).toBe('2026-10-04');
    expect(await materializarRecurrentes(db)).toBe(0);
  });

  it('no toca lo ya pagado de la misma regla', async () => {
    const { septId, octId } = await escenario();

    await eliminarTransaccion(db, octId, 'adelante');

    expect(await fila(septId)).not.toBeNull();
  });
});

describe('limpiarDatos', () => {
  it('vacía movimientos y reglas pero conserva categorías y configuración', async () => {
    await crearTransaccion(db, base);
    await materializarRecurrentes(db);

    await limpiarDatos(db);

    const tx = await db.getFirstAsync<any>('SELECT COUNT(*) n FROM transacciones');
    const rg = await db.getFirstAsync<any>('SELECT COUNT(*) n FROM reglas_recurrentes');
    const cat = await db.getFirstAsync<any>('SELECT COUNT(*) n FROM categorias');
    const cfg = await db.getFirstAsync<any>('SELECT COUNT(*) n FROM config');
    expect([tx.n, rg.n]).toEqual([0, 0]);
    expect(cat.n).toBeGreaterThan(0);
    expect(cfg.n).toBeGreaterThan(0);
  });

  it('después de limpiar, la app no regenera nada al abrir', async () => {
    await crearTransaccion(db, base);
    await materializarRecurrentes(db);
    await limpiarDatos(db);

    expect(await materializarRecurrentes(db)).toBe(0);
  });
});
