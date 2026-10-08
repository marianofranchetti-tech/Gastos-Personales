import { describe, expect, it } from 'vitest';
import { conceptos, conceptosRepetidos, enFiltro, estadoVista, filtrarMovs, MovCal, porDia, semanasDelMes, sumarMes, totales } from './calendario';

const HOY = '2026-10-01';
let id = 0;
const m = (nombre: string, venc: string, monto: number, estado = 'pendiente'): MovCal => ({
  id: ++id, nombre, monto, moneda: 'ARS', fecha: venc, venc, estado,
});

describe('calendario', () => {
  it('semanas de lunes a domingo que cubren el mes', () => {
    const s = semanasDelMes('2026-10');
    expect(s[0]).toMatchObject({ desde: '2026-09-28', hasta: '2026-10-04' });
    expect(s[s.length - 1].hasta >= '2026-10-31').toBe(true);
    expect(s).toHaveLength(5);
    expect(semanasDelMes('2026-02')).toHaveLength(4 + 1); // 1 feb 2026 es domingo
  });

  it('sumarMes cruza años', () => {
    expect(sumarMes('2026-01', -1)).toBe('2025-12');
    expect(sumarMes('2026-12', 1)).toBe('2027-01');
  });

  it('estado: vencido = pendiente con fecha pasada', () => {
    expect(estadoVista(m('a', '2026-09-30', 1), HOY)).toBe('vencido');
    expect(estadoVista(m('a', HOY, 1), HOY)).toBe('pendiente');
    expect(estadoVista(m('a', '2026-09-01', 1, 'pagado'), HOY)).toBe('pagado');
  });

  it('filtra por mes, estado y concepto; totales y conceptos', () => {
    const items = [
      m('ALQUILER', '2026-10-10', 1000),
      m('ALQUILER', '2026-11-10', 1000),
      m('AGUA', '2026-10-10', 20, 'pagado'),
      m('GAS', '2026-09-07', 15),
    ];
    const oct = filtrarMovs(items, { desde: '2026-10-01', hasta: '2026-10-31', estado: 'todos', concepto: null, hoy: HOY });
    expect(oct.map((t) => t.nombre)).toEqual(['ALQUILER', 'AGUA']);
    expect(totales(oct, HOY)).toEqual({ pagado: 20, parcial: 0, pendiente: 1000, vencido: 0, todos: 1020 });
    expect(filtrarMovs(items, { desde: '2026-01-01', hasta: '2026-12-31', estado: 'vencido', concepto: null, hoy: HOY }).map((t) => t.nombre)).toEqual(['GAS']);
    expect(filtrarMovs(items, { desde: '2026-01-01', hasta: '2026-12-31', estado: 'todos', concepto: 'ALQUILER', hoy: HOY })).toHaveLength(2);
    expect(conceptos(items)[0]).toEqual({ nombre: 'ALQUILER', total: 2000, cantidad: 2 });
    const d = porDia(oct);
    expect(d['2026-10-10'].map((t) => t.estado)).toEqual(['pendiente', 'pagado']);
  });

  it('estado con pagos parciales: parcial en fecha, vencido si la fecha pasó', () => {
    const p = (venc: string, pagado: number) => ({ ...m('EPEC', venc, 100), pagado });
    expect(estadoVista(p('2026-10-20', 40), HOY)).toBe('parcial');
    expect(estadoVista(p('2026-09-20', 40), HOY)).toBe('vencido');
    expect(estadoVista(p('2026-09-20', 100), HOY)).toBe('pagado');
    expect(estadoVista(p('2026-10-20', 0), HOY)).toBe('pendiente');
  });

  it('totales: pendientes y vencidos suman saldo; pagados, lo pagado; parciales, su saldo', () => {
    const items = [
      { ...m('EPEC', '2026-10-20', 100), pagado: 40 }, // parcial en fecha
      { ...m('GAS', '2026-10-25', 50), pagado: 0 }, // pendiente
      { ...m('MUNI', '2026-09-30', 200), pagado: 150 }, // parcial vencido
      { ...m('AGUA', '2026-10-05', 30, 'pagado'), pagado: 30 }, // pagado
    ];
    expect(totales(items, HOY)).toEqual({ todos: 380, pagado: 220, pendiente: 110, vencido: 50, parcial: 110 });

    const nombres = (f: Parameters<typeof enFiltro>[1]) => items.filter((t) => enFiltro(t, f, HOY)).map((t) => t.nombre);
    expect(nombres('pendiente')).toEqual(['EPEC', 'GAS']);
    expect(nombres('vencido')).toEqual(['MUNI']);
    expect(nombres('pagado')).toEqual(['EPEC', 'MUNI', 'AGUA']);
    expect(nombres('parcial')).toEqual(['EPEC', 'MUNI']);
  });

  it('conceptos repetidos en un mismo mes (solo lectura)', () => {
    const t = (nombre: string, venc: string, tipo = 'gasto') => ({ ...m(nombre, venc, 10), tipo });
    const r = conceptosRepetidos([
      t('EPEC', '2026-10-05'),
      t('EPEC', '2026-10-20'),
      t('EPEC', '2026-11-05'),
      t('MUNIC CASA', '2026-10-01'),
      t('MUNIC CASA', '2026-10-02'),
      t('MUNIC CASA', '2026-10-03'),
      t('MUNIC CASA', '2026-10-04'),
      t('EPEC', '2026-10-07', 'ingreso'),
      // Una regla semanal se repite en el mes porque sí: no es un duplicado.
      { ...t('Nafta', '2026-10-05'), periodo: 'semanal' },
      { ...t('Nafta', '2026-10-12'), periodo: 'semanal' },
    ]);
    expect(r).toEqual([
      { tipo: 'gasto', nombre: 'EPEC', mes: '2026-10', cantidad: 2, total: 20 },
      { tipo: 'gasto', nombre: 'MUNIC CASA', mes: '2026-10', cantidad: 4, total: 40 },
    ]);
  });
});
