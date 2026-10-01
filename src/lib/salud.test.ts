import { describe, expect, it } from 'vitest';
import { saludFinanciera } from './salud';
import type { MesBarra } from '../db/estadisticas';

const mes = (m: string, ingresos: number, egresos: number, real = true, actual = false): MesBarra => ({ mes: m, ingresos, egresos, real, actual });

describe('saludFinanciera', () => {
  it('sin datos no inventa un diagnóstico', () => {
    expect(saludFinanciera({ datos: [mes('2026-10', 0, 0, true, true)], porPagar: 0, porCobrar: 0, fijosDelMes: 0 })).toBeNull();
  });

  it('ignora el mes en curso y mira los cerrados', () => {
    const s = saludFinanciera({
      datos: [mes('2026-08', 1000, 600), mes('2026-09', 1000, 700), mes('2026-10', 0, 5000, true, true)],
      porPagar: 0, porCobrar: 0, fijosDelMes: 0,
    })!;
    const gasto = s.indicadores.find((i) => i.id === 'gasto')!;
    expect(gasto.valor).toBe('65%');
    expect(gasto.nivel).toBe('bien');
    expect(s.indicadores.find((i) => i.id === 'racha')!.valor).toBe('2 de 2');
  });

  it('gastar más de lo que entra y no cubrir pendientes es frágil', () => {
    const s = saludFinanciera({
      datos: [mes('2026-07', 1000, 1300), mes('2026-08', 1000, 1400), mes('2026-09', 1000, 1310)],
      porPagar: 1000, porCobrar: 500, fijosDelMes: 900,
    })!;
    expect(s.nivel).toBe('mal');
    expect(s.titulo).toBe('Frágil');
    expect(s.indicadores.map((i) => i.nivel)).toEqual(['mal', 'mal', 'mal', 'mal']);
  });
});
