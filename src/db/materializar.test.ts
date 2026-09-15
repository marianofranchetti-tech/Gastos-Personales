import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { materializarRecurrentes } from './materializar';
import { setVentanaPendientes } from './config';
import { baseVacia, insertarRegla, vencimientos } from '../test/fixtures';
import type { DbFake } from '../test/dbFake';

let db: DbFake;

// Congelamos solo Date: el código lee "hoy" del reloj local del dispositivo.
// Sin esto los tests darían distinto según el día en que se corran.
function hoyEs(fecha: string) {
  vi.setSystemTime(new Date(`${fecha}T10:00:00`));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  hoyEs('2026-09-01');
  db = await baseVacia();
});

afterEach(() => {
  vi.useRealTimers();
  db.cerrar();
});

describe('materializarRecurrentes', () => {
  it('genera los vencimientos que caen dentro de la ventana', async () => {
    // Ventana 45 días desde el 2026-09-01 -> horizonte 2026-10-16.
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5 });

    const insertadas = await materializarRecurrentes(db);

    expect(insertadas).toBe(2);
    expect(await vencimientos(db, id)).toEqual(['2026-09-05', '2026-10-05']);
  });

  it('es idempotente: correrla de nuevo no duplica nada', async () => {
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5 });

    await materializarRecurrentes(db);
    const segunda = await materializarRecurrentes(db);

    expect(segunda).toBe(0);
    expect(await vencimientos(db, id)).toEqual(['2026-09-05', '2026-10-05']);
  });

  it('no materializa hacia atrás aunque la regla sea vieja', async () => {
    // Si el usuario no abrió la app en meses, no queremos que le aparezcan
    // ocho cuotas vencidas de golpe.
    const id = await insertarRegla(db, {
      periodo: 'mensual',
      dia_venc: 5,
      fecha_inicio: '2026-01-01',
    });

    await materializarRecurrentes(db);

    const generados = await vencimientos(db, id);
    expect(generados.every((v) => v >= '2026-09-01')).toBe(true);
    expect(generados).toEqual(['2026-09-05', '2026-10-05']);
  });

  it('incluye una ocurrencia que cae hoy mismo', async () => {
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 1 });

    await materializarRecurrentes(db);

    expect(await vencimientos(db, id)).toContain('2026-09-01');
  });

  it('respeta fecha_fin', async () => {
    const id = await insertarRegla(db, {
      periodo: 'mensual',
      dia_venc: 5,
      fecha_fin: '2026-09-30',
    });

    await materializarRecurrentes(db);

    expect(await vencimientos(db, id)).toEqual(['2026-09-05']);
  });

  it('ignora las reglas inactivas', async () => {
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5, activa: 0 });

    expect(await materializarRecurrentes(db)).toBe(0);
    expect(await vencimientos(db, id)).toEqual([]);
  });

  it('usa dia_semana en las reglas semanales', async () => {
    // 2026-09-01 es martes. dia_semana 1 = lunes.
    const id = await insertarRegla(db, { periodo: 'semanal', dia_semana: 1 });
    await setVentanaPendientes(db, 21);

    await materializarRecurrentes(db);

    expect(await vencimientos(db, id)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });

  it('sigue la ventana configurada, no un valor fijo', async () => {
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5 });
    await setVentanaPendientes(db, 120);

    await materializarRecurrentes(db);

    expect(await vencimientos(db, id)).toEqual([
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ]);
  });

  it('copia monto, categoría y moneda de la regla, en estado pendiente', async () => {
    const id = await insertarRegla(db, {
      periodo: 'mensual',
      dia_venc: 5,
      monto: 350000,
      moneda: 'USD',
      categoria_id: 'casa',
      tipo: 'gasto',
      nombre: 'Alquiler',
    });

    await materializarRecurrentes(db);

    const fila = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM transacciones WHERE regla_recurrente_id = ? ORDER BY venc LIMIT 1',
      id
    );
    expect(fila).toMatchObject({
      nombre: 'Alquiler',
      categoria_id: 'casa',
      monto: 350000,
      moneda: 'USD',
      estado: 'pendiente',
      venc: '2026-09-05',
      fecha: '2026-09-05',
      pagado_en: null,
    });
  });
});

describe('el ancla es el día 1 del mes, no hoy', () => {
  it('rellena los vencimientos del mes en curso que ya pasaron', async () => {
    // Instalar la app a mitad de mes no debería dejar el mes en blanco.
    hoyEs('2026-09-20');
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5 });

    await materializarRecurrentes(db);

    expect(await vencimientos(db, id)).toContain('2026-09-05');
  });

  it('el relleno hacia atrás nunca sale del mes en curso', async () => {
    // Aunque la regla sea de hace un año y la app no se abra en meses, no
    // pueden aparecer cuotas viejas: el piso es el día 1 de este mes.
    hoyEs('2026-09-20');
    const id = await insertarRegla(db, {
      periodo: 'mensual', dia_venc: 5, fecha_inicio: '2025-01-01',
    });

    await materializarRecurrentes(db);

    const generados = await vencimientos(db, id);
    expect(generados.every((v) => v >= '2026-09-01')).toBe(true);
    expect(generados[0]).toBe('2026-09-05');
  });

  it('una regla semanal rellena todas las semanas del mes ya transcurridas', async () => {
    hoyEs('2026-09-20');
    // 2026-09-07 es lunes.
    const id = await insertarRegla(db, { periodo: 'semanal', dia_semana: 1 });

    await materializarRecurrentes(db);

    const generados = await vencimientos(db, id);
    expect(generados.slice(0, 3)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });
});
