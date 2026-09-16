import { describe, expect, it } from 'vitest';
import { sugerenciasBalance, sugerenciasGastos, sugerenciasIngresos } from './sugerencias';
import { MesBarra } from '../db/estadisticas';

/** Ventana típica: 4 pasados, el actual, 4 proyectados. */
const ventana = (vals: [number, number][]): MesBarra[] =>
  vals.map((v, i) => ({
    mes: `2026-${String(i + 5).padStart(2, '0')}`,
    ingresos: v[0],
    egresos: v[1],
    real: i <= 4,
    actual: i === 4,
  }));

/** Solo el mes en curso cargado: el caso de un usuario nuevo. */
const soloEsteMes = (ing: number, egr: number) =>
  ventana([[0, 0], [0, 0], [0, 0], [0, 0], [ing, egr], [0, 0], [0, 0], [0, 0], [0, 0]]);

const titulos = (s: { titulo: string }[]) => s.map((x) => x.titulo).join(' || ');

describe('sugerenciasBalance', () => {
  it('con un solo mes cargado ya dice algo útil, no espera historia', () => {
    const s = sugerenciasBalance({ datos: soloEsteMes(1000, 400) });
    expect(s.length).toBeGreaterThan(0);
    expect(titulos(s)).toMatch(/40% de lo que entra/);
  });

  it('avisa cuando se gasta más de lo que entra y prioriza recortar', () => {
    const s = sugerenciasBalance({ datos: soloEsteMes(1000, 1300) });
    const a = s.find((x) => x.titulo.includes('130%'));
    expect(a?.tono).toBe('aviso');
    expect(a?.detalle).toMatch(/recortar gasto/);
  });

  it('marca el caso de cargar gastos sin ningún ingreso', () => {
    const s = sugerenciasBalance({ datos: soloEsteMes(0, 500) });
    expect(titulos(s)).toMatch(/ningún ingreso/);
  });

  it('compara lo que falta pagar contra lo que falta cobrar', () => {
    const s = sugerenciasBalance({ datos: soloEsteMes(1000, 400), porPagar: 800, porCobrar: 200 });
    const a = s.find((x) => x.titulo.includes('por pagar'));
    expect(a?.tono).toBe('aviso');
    expect(a?.detalle).toMatch(/faltan/);
  });

  it('cuando alcanza lo dice, pero advierte por el orden de las fechas', () => {
    const s = sugerenciasBalance({ datos: soloEsteMes(1000, 400), porPagar: 300, porCobrar: 900 });
    const a = s.find((x) => x.titulo.includes('por pagar'));
    expect(a?.tono).toBe('bien');
    expect(a?.detalle).toMatch(/a tiempo/);
  });

  it('avisa cuántos meses futuros cierran en rojo y cuál es el peor', () => {
    const s = sugerenciasBalance({
      datos: ventana([[500, 400], [500, 400], [500, 400], [500, 400], [500, 400],
                      [500, 900], [500, 600], [500, 400], [500, 400]]),
    });
    const a = s.find((x) => x.titulo.includes('cierran en rojo'));
    expect(a?.titulo).toContain('2 de los próximos 4');
    expect(a?.detalle).toMatch(/octubre/);
  });

  it('sin nada cargado invita a empezar en vez de quedarse mudo', () => {
    const s = sugerenciasBalance({ datos: ventana(Array(9).fill([0, 0])) });
    expect(s).toHaveLength(1);
    expect(s[0].titulo).toMatch(/Empezá cargando/);
  });
});

describe('sugerenciasGastos', () => {
  it('cuando casi todo es fijo, dice que apretarse el cinturón no alcanza', () => {
    const s = sugerenciasGastos({ datos: soloEsteMes(1000, 800), fijosDelMes: 700 });
    const f = s.find((x) => x.titulo.includes('son fijos'));
    expect(f?.titulo).toContain('88%');
    expect(f?.tono).toBe('aviso');
    expect(f?.detalle).toMatch(/renegociar|dar de baja/);
  });

  it('cuando hay margen variable, lo nombra como la palanca del mes', () => {
    const s = sugerenciasGastos({ datos: soloEsteMes(1000, 800), fijosDelMes: 200 });
    const f = s.find((x) => x.titulo.includes('son fijos'));
    expect(f?.tono).toBe('neutro');
    expect(f?.detalle).toMatch(/variable/);
  });

  it('señala la categoría que más pesa, con un solo mes cargado', () => {
    const s = sugerenciasGastos({
      datos: soloEsteMes(1000, 800),
      fijosDelMes: 0,
      porCategoria: [{ nombre: 'Casa', monto: 400 }, { nombre: 'Comida', monto: 100 }],
    });
    expect(titulos(s)).toMatch(/Casa se lleva el 50%/);
  });

  it('no señala una categoría que no pesa lo suficiente', () => {
    const s = sugerenciasGastos({
      datos: soloEsteMes(1000, 800),
      fijosDelMes: 0,
      porCategoria: [{ nombre: 'Casa', monto: 100 }],
    });
    expect(titulos(s)).not.toMatch(/se lleva el/);
  });

  it('detecta la tendencia al alza comparando mitades', () => {
    const s = sugerenciasGastos({
      datos: ventana([[1000, 100], [1000, 100], [1000, 200], [1000, 200], [1000, 150],
                      [0, 0], [0, 0], [0, 0], [0, 0]]),
      fijosDelMes: 0,
    });
    expect(titulos(s)).toMatch(/vienen subiendo/);
  });

  it('sin gastos pide cargar en vez de aconsejar al aire', () => {
    const s = sugerenciasGastos({ datos: ventana(Array(9).fill([0, 0])) });
    expect(s).toHaveLength(1);
    expect(s[0].titulo).toMatch(/Cargá tus gastos/);
  });
});

describe('sugerenciasIngresos', () => {
  it('avisa cuando todo depende de una sola fuente', () => {
    const s = sugerenciasIngresos({
      datos: soloEsteMes(1000, 500),
      fuentes: [{ nombre: 'Sueldo', monto: 980 }, { nombre: 'Extra', monto: 20 }],
    });
    const c = s.find((x) => x.titulo.includes('una sola fuente'));
    expect(c?.tono).toBe('aviso');
    expect(c?.detalle).toContain('Sueldo');
  });

  it('reconoce cuando los ingresos están repartidos', () => {
    const s = sugerenciasIngresos({
      datos: soloEsteMes(1000, 500),
      fuentes: [{ nombre: 'Sueldo', monto: 600 }, { nombre: 'Freelance', monto: 400 }],
    });
    expect(titulos(s)).toMatch(/2 fuentes/);
  });

  it('recuerda que lo no cobrado todavía no es plata', () => {
    const s = sugerenciasIngresos({
      datos: soloEsteMes(1000, 500),
      fuentes: [{ nombre: 'Sueldo', monto: 1000 }],
      porCobrar: 300,
    });
    expect(titulos(s)).toMatch(/por cobrar/);
  });

  it('cruza gastos que suben con ingresos que no', () => {
    const s = sugerenciasIngresos({
      datos: ventana([[1000, 100], [1000, 100], [1000, 200], [1000, 200], [1000, 150],
                      [0, 0], [0, 0], [0, 0], [0, 0]]),
      fuentes: [{ nombre: 'Sueldo', monto: 5000 }],
    });
    const a = s.find((x) => x.titulo.match(/gastos suben/));
    expect(a?.tono).toBe('aviso');
  });
});
