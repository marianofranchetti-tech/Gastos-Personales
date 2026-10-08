import { describe, expect, it } from 'vitest';
import { agruparPendientes, sumar } from './agruparPendientes';
import { TransaccionVista } from '../db/queries';

const fila = (id: number, regla: number | null, venc: string, monto = 1000): TransaccionVista => ({
  id,
  tipo: 'gasto',
  nombre: regla ? `Regla ${regla}` : `Suelta ${id}`,
  categoria_id: 'casa',
  cat_emoji: '🏠',
  cat_nombre: 'Casa',
  monto,
  moneda: 'ARS',
  fecha: venc,
  venc,
  estado: 'pendiente',
  regla_recurrente_id: regla,
  rec: regla ? 1 : 0,
  periodo: regla ? 'mensual' : null,
  fijo: regla ? 1 : null,
  pagado: 0,
  saldo: monto,
  n_pagos: 0,
});

describe('agruparPendientes', () => {
  it('colapsa las ocurrencias de una misma regla en la más próxima', () => {
    // Una regla semanal genera 7 filas en 45 días y sepulta al resto.
    const semanal = [1, 2, 3, 4].map((i) => fila(i, 7, `2026-09-0${i + 2}`));

    const r = agruparPendientes(semanal);

    expect(r).toHaveLength(1);
    expect(r[0].fila.id).toBe(1);
    expect(r[0].fila.venc).toBe('2026-09-03');
    expect(r[0].mas).toBe(3);
  });

  it('no agrupa las transacciones sueltas: cada una es un hecho distinto', () => {
    const sueltas = [fila(1, null, '2026-09-03'), fila(2, null, '2026-09-04')];

    const r = agruparPendientes(sueltas);

    expect(r).toHaveLength(2);
    expect(r.every((x) => x.mas === 0)).toBe(true);
  });

  it('mantiene el orden de llegada y mezcla reglas con sueltas', () => {
    const filas = [
      fila(1, 7, '2026-09-03'),
      fila(2, null, '2026-09-04'),
      fila(3, 7, '2026-09-10'),
      fila(4, 9, '2026-09-12'),
    ];

    const r = agruparPendientes(filas);

    expect(r.map((x) => [x.fila.id, x.mas])).toEqual([
      [1, 1],
      [2, 0],
      [4, 0],
    ]);
  });

  it('el total suma TODAS las ocurrencias, no solo las visibles', () => {
    // Si el encabezado sumara solo lo agrupado, subestimaría lo que viene.
    const filas = [1, 2, 3].map((i) => fila(i, 7, `2026-09-0${i}`, 45000));

    expect(agruparPendientes(filas)).toHaveLength(1);
    expect(sumar(filas)).toBe(135000);
  });

  it('con la lista vacía no rompe', () => {
    expect(agruparPendientes([])).toEqual([]);
    expect(sumar([])).toBe(0);
  });
});
