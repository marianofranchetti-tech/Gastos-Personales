import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estadisticasVentana, ventanaMeses, cortoDeMes } from './estadisticas';
import { materializarRecurrentes } from './materializar';
import { baseVacia, insertarRegla, insertarTx } from '../test/fixtures';
import type { DbFake } from '../test/dbFake';

let db: DbFake;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-15T10:00:00'));
  db = await baseVacia();
});

afterEach(() => {
  vi.useRealTimers();
  db.cerrar();
});

const porMes = (s: Awaited<ReturnType<typeof estadisticasVentana>>) =>
  Object.fromEntries(s.map((m) => [m.mes, [m.ingresos, m.egresos]]));

describe('ventanaMeses', () => {
  it('son 9 meses con el actual al centro', () => {
    expect(ventanaMeses('2026-09')).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
      '2026-10', '2026-11', '2026-12', '2027-01',
    ]);
  });

  it('cruza el fin de año hacia atrás sin romperse', () => {
    expect(ventanaMeses('2026-02')[0]).toBe('2025-10');
  });
});

describe('estadisticasVentana', () => {
  it('devuelve siempre 9 meses, aunque no haya ningún dato', async () => {
    const s = await estadisticasVentana(db);
    expect(s).toHaveLength(9);
    expect(s.every((m) => m.ingresos === 0 && m.egresos === 0)).toBe(true);
  });

  it('marca cuáles son reales y cuál es el mes en curso', async () => {
    const s = await estadisticasVentana(db);
    expect(s.filter((m) => m.real).map((m) => m.mes)).toEqual([
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);
    expect(s.filter((m) => m.actual).map((m) => m.mes)).toEqual(['2026-09']);
  });

  it('suma lo registrado en los meses pasados, esté pagado o no', async () => {
    await insertarTx(db, { fecha: '2026-07-10', monto: 50000, estado: 'pagado' });
    await insertarTx(db, { fecha: '2026-07-20', monto: 20000, estado: 'pendiente' });
    await insertarTx(db, {
      fecha: '2026-07-01', monto: 500000, tipo: 'ingreso', categoria_id: 'salario', estado: 'pagado',
    });

    const m = porMes(await estadisticasVentana(db))['2026-07'];
    expect(m).toEqual([500000, 70000]);
  });

  it('ignora lo que cae fuera de la ventana', async () => {
    await insertarTx(db, { fecha: '2026-01-10', monto: 99000 });

    const s = await estadisticasVentana(db);
    expect(s.reduce((a, m) => a + m.egresos, 0)).toBe(0);
  });

  it('proyecta los meses futuros desde las reglas activas', async () => {
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 40000 });

    const s = porMes(await estadisticasVentana(db));
    expect(s['2026-10']).toEqual([0, 40000]);
    expect(s['2027-01']).toEqual([0, 40000]);
  });

  it('NO cuenta dos veces los pendientes ya materializados', async () => {
    // El bug caro: la regla aporta la ocurrencia de octubre y la fila pendiente
    // que salió de esa misma regla no debe volver a sumarse.
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 40000 });
    await materializarRecurrentes(db);

    const s = porMes(await estadisticasVentana(db));
    expect(s['2026-10']).toEqual([0, 40000]);
  });

  it('el mes en curso sale de lo registrado, no de la proyección', async () => {
    await insertarTx(db, { fecha: '2026-09-02', monto: 40000 });
    await insertarTx(db, { fecha: '2026-09-28', monto: 7000 });

    const s = porMes(await estadisticasVentana(db));
    expect(s['2026-09']).toEqual([0, 47000]);
  });

  it('un vencimiento del mes en curso que ya pasó SÍ aparece', async () => {
    // Hoy es 15 de septiembre y la regla vence los días 5. Materializar
    // arranca el día 1 del mes, así que el alquiler del 5 existe aunque la
    // app se haya instalado después.
    await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, monto: 40000 });
    await materializarRecurrentes(db);

    const s = porMes(await estadisticasVentana(db));
    expect(s['2026-09']).toEqual([0, 40000]);
    expect(s['2026-10']).toEqual([0, 40000]);
  });

  it('no mezcla monedas', async () => {
    await insertarTx(db, { fecha: '2026-08-10', monto: 100, moneda: 'USD' });
    await insertarTx(db, { fecha: '2026-08-10', monto: 50000, moneda: 'ARS' });

    const ars = porMes(await estadisticasVentana(db, 'ARS'))['2026-08'];
    const usd = porMes(await estadisticasVentana(db, 'USD'))['2026-08'];
    expect(ars).toEqual([0, 50000]);
    expect(usd).toEqual([0, 100]);
  });
});

describe('etiquetas', () => {
  it('abrevia el mes en tres letras', () => {
    expect(cortoDeMes('2026-01')).toBe('Ene');
    expect(cortoDeMes('2026-12')).toBe('Dic');
  });
});
