import { describe, expect, it } from 'vitest';
import {
  AnclaRegla,
  diaSemanaISO,
  ocurrenciasEntre,
  proximaFecha,
  sumarDiasISO,
  sumarMesesISO,
  ultimoDiaDelMes,
} from './fechasRecurrentes';

/** Regla mínima: cada test sobreescribe solo lo que le importa. */
const regla = (p: Partial<AnclaRegla>): AnclaRegla => ({
  id: 1,
  periodo: 'mensual',
  dia_venc: null,
  dia_semana: null,
  mes_anio: null,
  fecha_inicio: '2000-01-01',
  fecha_fin: null,
  ...p,
});

describe('proximaFecha — mensual', () => {
  const dia31 = regla({ periodo: 'mensual', dia_venc: 31 });

  it('devuelve el día del mes en curso si todavía no pasó', () => {
    expect(proximaFecha(dia31, '2026-01-15')).toBe('2026-01-31');
  });

  it('es estrictamente posterior: si hoy es el día, salta al mes siguiente', () => {
    expect(proximaFecha(regla({ dia_venc: 5 }), '2026-09-05')).toBe('2026-10-05');
  });

  it('recorta el 31 al último día real de febrero', () => {
    expect(proximaFecha(dia31, '2026-01-31')).toBe('2026-02-28');
    expect(proximaFecha(dia31, '2028-01-31')).toBe('2028-02-29');
  });

  it('no se queda trabado en el 28: recupera el 31 al mes siguiente', () => {
    // El bug clásico es arrastrar el día recortado. Tras febrero debe volver al 31.
    let cursor = '2025-12-30';
    const serie: string[] = [];
    for (let i = 0; i < 4; i++) {
      cursor = proximaFecha(dia31, cursor);
      serie.push(cursor);
    }
    expect(serie).toEqual(['2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('cruza el fin de año', () => {
    expect(proximaFecha(dia31, '2026-12-31')).toBe('2027-01-31');
  });

  it('exige dia_venc', () => {
    expect(() => proximaFecha(regla({ periodo: 'mensual' }), '2026-01-01')).toThrow(/dia_venc/);
  });
});

describe('proximaFecha — semanal', () => {
  // 2026-09-09 es miércoles (3).
  it('salta al próximo día de semana pedido', () => {
    expect(diaSemanaISO('2026-09-09')).toBe(3);
    expect(proximaFecha(regla({ periodo: 'semanal', dia_semana: 1 }), '2026-09-09')).toBe('2026-09-14');
  });

  it('si hoy ya es ese día, salta 7 y no devuelve hoy', () => {
    expect(proximaFecha(regla({ periodo: 'semanal', dia_semana: 3 }), '2026-09-09')).toBe('2026-09-16');
  });

  it('exige dia_semana', () => {
    expect(() => proximaFecha(regla({ periodo: 'semanal' }), '2026-09-09')).toThrow(/dia_semana/);
  });
});

describe('proximaFecha — anual', () => {
  const feb29 = regla({ periodo: 'anual', dia_venc: 29, mes_anio: 2 });

  it('recorta al 28 en año no bisiesto', () => {
    expect(proximaFecha(feb29, '2026-01-01')).toBe('2026-02-28');
  });

  it('usa el 29 real cuando el año es bisiesto', () => {
    expect(proximaFecha(feb29, '2027-06-01')).toBe('2028-02-29');
  });
});

describe('proximaFecha — diario', () => {
  it('avanza un día cruzando el fin de mes', () => {
    expect(proximaFecha(regla({ periodo: 'diario' }), '2026-02-28')).toBe('2026-03-01');
  });
});

describe('ocurrenciasEntre', () => {
  it('corta en fecha_fin', () => {
    const r = regla({ dia_venc: 10, fecha_inicio: '2026-09-01', fecha_fin: '2026-11-30' });
    expect(ocurrenciasEntre(r, '2026-09-08', '2027-06-01')).toEqual([
      '2026-09-10',
      '2026-10-10',
      '2026-11-10',
    ]);
  });

  it('no genera nada anterior a fecha_inicio', () => {
    const r = regla({ dia_venc: 10, fecha_inicio: '2027-01-05' });
    expect(ocurrenciasEntre(r, '2026-09-08', '2027-03-01')).toEqual(['2027-01-10', '2027-02-10']);
  });

  it('trata `desde` como exclusivo y `hasta` como inclusivo', () => {
    const r = regla({ dia_venc: 10 });
    expect(ocurrenciasEntre(r, '2026-09-10', '2026-09-30')).toEqual([]);
    expect(ocurrenciasEntre(r, '2026-09-09', '2026-09-10')).toEqual(['2026-09-10']);
  });

  it('termina aunque el horizonte sea absurdo (corta por maxIteraciones)', () => {
    const r = regla({ periodo: 'diario', fecha_inicio: '2026-01-01' });
    expect(ocurrenciasEntre(r, '2026-01-01', '2999-01-01', 10)).toHaveLength(10);
  });
});

describe('helpers de fecha', () => {
  it('sumarMesesISO recorta el día al mes destino', () => {
    expect(sumarMesesISO('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('sumarDiasISO cruza el año y acepta días negativos', () => {
    expect(sumarDiasISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDiasISO('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('ultimoDiaDelMes contempla bisiestos', () => {
    expect(ultimoDiaDelMes(2028, 2)).toBe(29);
    expect(ultimoDiaDelMes(2026, 2)).toBe(28);
  });
});
