import { describe, expect, it } from 'vitest';
import { sugerenciasBalance, sugerenciasGastos, sugerenciasIngresos } from './sugerencias';
import { MesBarra } from '../db/estadisticas';

const mes = (m: string, ingresos: number, egresos: number, real: boolean, actual = false): MesBarra =>
  ({ mes: m, ingresos, egresos, real, actual });

/** Ventana típica: 4 pasados, el actual, 4 proyectados. */
const ventana = (vals: [number, number][]): MesBarra[] =>
  vals.map((v, i) => mes(`2026-${String(i + 5).padStart(2, '0')}`, v[0], v[1], i <= 4, i === 4));

describe('sugerenciasBalance', () => {
  it('sin datos no inventa consejos, pide cargar', () => {
    const s = sugerenciasBalance(ventana(Array(9).fill([0, 0])));
    expect(s).toHaveLength(1);
    expect(s[0].titulo).toMatch(/no hay con qué comparar/i);
  });

  it('avisa cuántos meses futuros cierran en rojo y cuál es el peor', () => {
    const s = sugerenciasBalance(
      ventana([[500, 400], [500, 400], [500, 400], [500, 400], [500, 400],
               [500, 900], [500, 600], [500, 400], [500, 400]])
    );
    const aviso = s.find((x) => x.titulo.includes('cierran en rojo'));
    expect(aviso?.titulo).toContain('2 de los próximos 4');
    expect(aviso?.detalle).toMatch(/octubre/);
  });

  it('felicita cuando la tasa de ahorro es buena', () => {
    const s = sugerenciasBalance(
      ventana([[0,0],[0,0],[0,0],[0,0],[1000, 500],[0,0],[0,0],[0,0],[0,0]])
    );
    expect(s.some((x) => x.tono === 'bien' && x.titulo.includes('50%'))).toBe(true);
  });

  it('marca cuando el mes viene muy por encima del promedio', () => {
    const s = sugerenciasBalance(
      ventana([[1000, 400], [1000, 400], [1000, 400], [1000, 400], [1000, 600],
               [0,0],[0,0],[0,0],[0,0]])
    );
    expect(s.some((x) => x.titulo.match(/venís gastando 50% más/))).toBe(true);
  });
});

describe('sugerenciasGastos', () => {
  it('cuando casi todo es fijo, dice que recortar sobre la marcha no alcanza', () => {
    const datos = ventana([[0,0],[0,0],[0,0],[0,0],[1000, 800],[0,0],[0,0],[0,0],[0,0]]);
    const s = sugerenciasGastos(datos, 700);
    const fijo = s.find((x) => x.titulo.includes('% de tus gastos son fijos'));
    expect(fijo?.titulo).toContain('88%');
    expect(fijo?.tono).toBe('aviso');
    expect(fijo?.detalle).toMatch(/renegociar|dar de baja/);
  });

  it('cuando hay margen variable, lo nombra como la palanca del mes', () => {
    const datos = ventana([[0,0],[0,0],[0,0],[0,0],[1000, 800],[0,0],[0,0],[0,0],[0,0]]);
    const s = sugerenciasGastos(datos, 200);
    const fijo = s.find((x) => x.titulo.includes('son fijos'));
    expect(fijo?.tono).toBe('neutro');
    expect(fijo?.detalle).toMatch(/variable/);
  });

  it('detecta la tendencia al alza comparando mitades', () => {
    const datos = ventana([[1000, 100], [1000, 100], [1000, 200], [1000, 200], [1000, 150],
                           [0,0],[0,0],[0,0],[0,0]]);
    const s = sugerenciasGastos(datos, 0);
    expect(s.some((x) => x.titulo.match(/vienen subiendo/))).toBe(true);
  });

  it('sin datos pide cargar en vez de aconsejar al aire', () => {
    const s = sugerenciasGastos(ventana(Array(9).fill([0, 0])), 0);
    expect(s).toHaveLength(1);
    expect(s[0].titulo).toMatch(/Cargá tus gastos/);
  });
});

describe('sugerenciasIngresos', () => {
  it('avisa cuando todo depende de una sola fuente', () => {
    const datos = ventana([[0,0],[0,0],[0,0],[0,0],[1000, 500],[0,0],[0,0],[0,0],[0,0]]);
    const s = sugerenciasIngresos(datos, [{ nombre: 'Sueldo', monto: 980 }, { nombre: 'Extra', monto: 20 }]);
    const c = s.find((x) => x.titulo.includes('una sola fuente'));
    expect(c?.tono).toBe('aviso');
    expect(c?.detalle).toContain('Sueldo');
  });

  it('reconoce cuando los ingresos están repartidos', () => {
    const datos = ventana([[0,0],[0,0],[0,0],[0,0],[1000, 500],[0,0],[0,0],[0,0],[0,0]]);
    const s = sugerenciasIngresos(datos, [{ nombre: 'Sueldo', monto: 600 }, { nombre: 'Freelance', monto: 400 }]);
    expect(s.some((x) => x.tono === 'bien' && x.titulo.includes('2 fuentes'))).toBe(true);
  });

  it('marca los ingresos planchados', () => {
    const datos = ventana([[1000, 100], [1000, 100], [1000, 100], [1000, 100], [1000, 100],
                           [0,0],[0,0],[0,0],[0,0]]);
    const s = sugerenciasIngresos(datos, [{ nombre: 'Sueldo', monto: 5000 }]);
    expect(s.some((x) => x.titulo.match(/planchados/))).toBe(true);
  });
});
