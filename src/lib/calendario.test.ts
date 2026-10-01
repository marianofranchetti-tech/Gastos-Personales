import { describe, expect, it } from 'vitest';
import { conceptos, estadoVista, filtrarMovs, MovCal, porDia, semanasDelMes, sumarMes, totales } from './calendario';

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
    expect(totales(oct, HOY)).toEqual({ pagado: 20, pendiente: 1000, vencido: 0, todos: 1020 });
    expect(filtrarMovs(items, { desde: '2026-01-01', hasta: '2026-12-31', estado: 'vencido', concepto: null, hoy: HOY }).map((t) => t.nombre)).toEqual(['GAS']);
    expect(filtrarMovs(items, { desde: '2026-01-01', hasta: '2026-12-31', estado: 'todos', concepto: 'ALQUILER', hoy: HOY })).toHaveLength(2);
    expect(conceptos(items)[0]).toEqual({ nombre: 'ALQUILER', total: 2000, cantidad: 2 });
    const d = porDia(oct);
    expect(d['2026-10-10'].map((t) => t.estado)).toEqual(['pendiente', 'pagado']);
  });
});
