import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calcularProyeccion } from './proyeccion';
import { materializarRecurrentes } from './materializar';
import { baseVacia, insertarRegla, insertarTx } from '../test/fixtures';
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

describe('calcularProyeccion', () => {
  it('arranca en el mes siguiente y devuelve meses calendario completos', async () => {
    // Hoy es 2026-09-01. Septiembre queda afuera entero: a mitad de mes ya
    // tiene movimientos hechos y proyectar solo lo que falta lo pintaría mal.
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 40000 });

    const p = await calcularProyeccion(db, 3);

    expect(p.ARS.map((m) => m.mes)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(p.ARS.map((m) => m.egresos)).toEqual([40000, 40000, 40000]);
  });

  it('deja afuera el mes en curso aunque queden vencimientos por caer', async () => {
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 28, monto: 40000 });

    const p = await calcularProyeccion(db, 2);

    expect(p.ARS.map((m) => m.mes)).toEqual(['2026-10', '2026-11']);
  });

  it('incluye el día 1 y el último día del mes, sin cortar por la mitad', async () => {
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 1, monto: 1000 });
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 31, monto: 500 });

    const p = await calcularProyeccion(db, 2);

    // Noviembre tiene 30 días: el "31" se recorta al 30 y sigue entrando.
    expect(p.ARS.map((m) => [m.mes, m.egresos])).toEqual([
      ['2026-10', 1500],
      ['2026-11', 1500],
    ]);
  });

  it('NO cuenta dos veces lo que ya fue materializado como pendiente', async () => {
    // Este es el bug caro: la regla aporta su ocurrencia y la fila pendiente
    // que salió de esa misma regla no debe volver a sumarse.
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 40000 });
    await materializarRecurrentes(db);

    const p = await calcularProyeccion(db, 3);

    expect(p.ARS.map((m) => m.egresos)).toEqual([40000, 40000, 40000]);
  });

  it('suma las pendientes cargadas a mano, que no tienen regla', async () => {
    await insertarTx(db, { venc: '2026-11-20', monto: 15000, estado: 'pendiente' });

    const p = await calcularProyeccion(db, 3);

    expect(p.ARS).toEqual([
      { mes: '2026-11', ingresos: 0, egresos: 15000, diferencia: -15000, acumulado: -15000 },
    ]);
  });

  it('ignora lo ya pagado, lo viejo y lo del mes en curso', async () => {
    await insertarTx(db, { venc: '2026-10-10', monto: 15000, estado: 'pagado' });
    await insertarTx(db, { venc: '2026-08-10', monto: 99000, estado: 'pendiente' });
    await insertarTx(db, { venc: '2026-09-25', monto: 77000, estado: 'pendiente' });

    expect(await calcularProyeccion(db, 3)).toEqual({});
  });

  it('separa por moneda y no las mezcla en un total inventado', async () => {
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 40000, moneda: 'ARS' });
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 300, moneda: 'USD' });

    const p = await calcularProyeccion(db, 2);

    expect(Object.keys(p).sort()).toEqual(['ARS', 'USD']);
    expect(p.ARS[0].egresos).toBe(40000);
    expect(p.USD[0].egresos).toBe(300);
  });

  it('acumula la diferencia mes a mes', async () => {
    await insertarRegla(db, { tipo: 'ingreso', categoria_id: 'salario', periodo: 'mensual', dia_venc: 10, monto: 100000 });
    await insertarRegla(db, { tipo: 'gasto', periodo: 'mensual', dia_venc: 5, monto: 40000 });

    const p = await calcularProyeccion(db, 3);

    expect(p.ARS.map((m) => [m.mes, m.diferencia, m.acumulado])).toEqual([
      ['2026-10', 60000, 60000],
      ['2026-11', 60000, 120000],
      ['2026-12', 60000, 180000],
    ]);
  });

  it('excluye las reglas inactivas y respeta fecha_fin', async () => {
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 40000, activa: 0 });
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 8, monto: 7000, fecha_fin: '2026-11-30' });

    const p = await calcularProyeccion(db, 4);

    expect(p.ARS.map((m) => [m.mes, m.egresos])).toEqual([
      ['2026-10', 7000],
      ['2026-11', 7000],
    ]);
  });

  it('no escribe en la base', async () => {
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5 });
    const antes = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM transacciones');

    await calcularProyeccion(db, 6);

    const despues = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM transacciones');
    expect(despues!.n).toBe(antes!.n);
  });
});
