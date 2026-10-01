import { describe, expect, it } from 'vitest';
import { etiquetaPeriodo, gastosPorCategoria, lunesDe, moverAncla, rangoPeriodo, serieBarras, Mov } from './periodo';

const HOY = '2026-10-01'; // jueves

const g = (fecha: string, monto: number, extra: Partial<Mov> = {}): Mov => ({
  tipo: 'gasto', monto, moneda: 'ARS', fecha, estado: 'pagado', categoria_id: 'comida', ...extra,
});
const i = (fecha: string, monto: number): Mov => ({ tipo: 'ingreso', monto, moneda: 'ARS', fecha, estado: 'pagado' });

describe('rangos y navegación', () => {
  it('semana de lunes a domingo', () => {
    expect(lunesDe(HOY)).toBe('2026-09-28');
    expect(rangoPeriodo('semana', HOY)).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
  });
  it('mes y año completos', () => {
    expect(rangoPeriodo('mes', '2026-02-14')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoPeriodo('anio', HOY)).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' });
  });
  it('mover cruza años sin romper el día', () => {
    expect(moverAncla('mes', '2026-01-31', -1)).toBe('2025-12-31');
    expect(moverAncla('mes', '2026-03-31', -1)).toBe('2026-02-28');
    expect(moverAncla('semana', HOY, 1)).toBe('2026-10-08');
    expect(moverAncla('dia', '2026-12-31', 1)).toBe('2027-01-01');
  });
  it('etiquetas', () => {
    expect(etiquetaPeriodo('mes', HOY, HOY)).toBe('octubre 2026');
    expect(etiquetaPeriodo('semana', HOY, HOY)).toBe('Esta semana');
    expect(etiquetaPeriodo('semana', '2026-09-20', HOY)).toBe('14 sep – 20 sep');
    expect(etiquetaPeriodo('dia', '2026-09-30', HOY)).toBe('Ayer');
  });
});

describe('serieBarras', () => {
  it('vista Mes: 13 meses con el elegido al centro', () => {
    const s = serieBarras({ g: 'mes', ancla: HOY, hoy: HOY, movs: [] });
    expect(s).toHaveLength(13);
    expect(s[0].clave).toBe('2026-04');
    expect(s[6]).toMatchObject({ clave: '2026-10', actual: true, elegido: true, real: true });
    expect(s[12]).toMatchObject({ clave: '2027-04', real: false });
  });

  it('meses pasados suman todo lo registrado; futuros salen de la proyección', () => {
    const s = serieBarras({
      g: 'mes', ancla: HOY, hoy: HOY,
      movs: [g('2026-09-05', 100, { estado: 'pendiente' }), g('2026-09-20', 50), i('2026-09-01', 1000), g('2026-11-05', 999, { estado: 'pendiente' })],
      proyeccion: [{ mes: '2026-11', ingresos: 10, egresos: 20, diferencia: -10, acumulado: -10 }],
    });
    const m = Object.fromEntries(s.map((b) => [b.clave, [b.ingresos, b.egresos]]));
    expect(m['2026-09']).toEqual([1000, 150]);
    // El pendiente de noviembre ya está dentro de la proyección: no se suma dos veces.
    expect(m['2026-11']).toEqual([10, 20]);
  });

  it('vista Año: los 12 meses calendario', () => {
    const s = serieBarras({ g: 'anio', ancla: HOY, hoy: HOY, movs: [] });
    expect(s.map((b) => b.clave)).toEqual(Array.from({ length: 12 }, (_, k) => `2026-${String(k + 1).padStart(2, '0')}`));
  });

  it('vista Semana: 13 semanas terminando en la elegida', () => {
    const s = serieBarras({ g: 'semana', ancla: HOY, hoy: HOY, movs: [g('2026-09-28', 10), g('2026-10-04', 5), g('2026-09-27', 7)] });
    expect(s).toHaveLength(13);
    expect(s[12]).toMatchObject({ clave: '2026-09-28', egresos: 15, actual: true });
    expect(s[11]).toMatchObject({ clave: '2026-09-21', egresos: 7 });
  });

  it('vista Día: 13 días, no mezcla monedas', () => {
    const s = serieBarras({ g: 'dia', ancla: HOY, hoy: HOY, movs: [g(HOY, 10), g(HOY, 99, { moneda: 'USD' })] });
    expect(s[12]).toMatchObject({ clave: HOY, egresos: 10, sub: 'J' });
    expect(s[0].clave).toBe('2026-09-19');
  });
});

describe('gastosPorCategoria', () => {
  it('solo pagado, ordenado, con lo pendiente aparte', () => {
    const r = gastosPorCategoria(
      [g('2026-10-01', 30, { categoria_id: 'casa' }), g('2026-10-02', 70), g('2026-10-03', 40, { estado: 'pendiente' }), g('2026-09-30', 500)],
      rangoPeriodo('mes', HOY)
    );
    expect(r.total).toBe(100);
    expect(r.pendiente).toBe(40);
    expect(r.categorias.map((c) => [c.id, c.monto, c.porcentaje])).toEqual([['comida', 70, 70], ['casa', 30, 30]]);
  });
});
