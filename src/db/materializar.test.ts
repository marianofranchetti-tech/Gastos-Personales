import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { materializarRecurrentes } from './materializar';
import { setVentanaPendientes } from './config';
import { baseVacia, insertarRegla, insertarTx, vencimientos } from '../test/fixtures';
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

describe('mover una ocurrencia de día (arrastre en el calendario)', () => {
  it('no la vuelve a generar en el día original', async () => {
    const { moverFecha } = await import('./queries');
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5 });
    await materializarRecurrentes(db);

    const sep = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM transacciones WHERE regla_recurrente_id = ? AND venc = '2026-09-05'",
      id
    );
    await moverFecha(db, sep!.id, '2026-09-12');
    const insertadas = await materializarRecurrentes(db);

    expect(insertadas).toBe(0);
    expect(await vencimientos(db, id)).toEqual(['2026-09-12', '2026-10-05']);
    const movida = await db.getFirstAsync<{ fecha: string; venc: string; venc_regla: string }>(
      'SELECT fecha, venc, venc_regla FROM transacciones WHERE id = ?',
      sep!.id
    );
    expect(movida).toEqual({ fecha: '2026-09-12', venc: '2026-09-12', venc_regla: '2026-09-05' });
  });

  it('moverla dos veces conserva el día original de la regla', async () => {
    const { moverFecha } = await import('./queries');
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 5 });
    await materializarRecurrentes(db);
    const sep = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM transacciones WHERE regla_recurrente_id = ? AND venc = '2026-09-05'",
      id
    );
    await moverFecha(db, sep!.id, '2026-09-12');
    await moverFecha(db, sep!.id, '2026-09-20');

    expect(await materializarRecurrentes(db)).toBe(0);
    const r = await db.getFirstAsync<{ venc_regla: string }>('SELECT venc_regla FROM transacciones WHERE id = ?', sep!.id);
    expect(r!.venc_regla).toBe('2026-09-05');
  });

  it('moverla al día de otra cuota de la misma regla no le quita el lugar a esa cuota', async () => {
    // Regla del día 1. Con hoy 2026-09-01 el horizonte (45 días) llega al
    // 16/10: existen septiembre y octubre, noviembre todavía no.
    const { moverFecha } = await import('./queries');
    const id = await insertarRegla(db, { periodo: 'mensual', dia_venc: 1 });
    await materializarRecurrentes(db);
    const oct = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM transacciones WHERE regla_recurrente_id = ? AND venc = '2026-10-01'",
      id
    );
    await moverFecha(db, oct!.id, '2026-11-01');

    hoyEs('2026-10-20');
    await materializarRecurrentes(db);

    // Dos filas el 1/11: la de octubre movida y la propia de noviembre.
    expect(await vencimientos(db, id)).toEqual(['2026-09-01', '2026-11-01', '2026-11-01', '2026-12-01']);
  });
});

describe('moverFecha: qué pasa con la fecha del movimiento', () => {
  it('si fecha y vencimiento coinciden, siguen coincidiendo', async () => {
    const { moverFecha } = await import('./queries');
    const tx = await insertarTx(db, { fecha: '2026-09-08', venc: '2026-09-08' });
    await moverFecha(db, tx, '2026-09-15');
    const r = await db.getFirstAsync<{ fecha: string; venc: string; venc_regla: string | null }>(
      'SELECT fecha, venc, venc_regla FROM transacciones WHERE id = ?',
      tx
    );
    expect(r).toEqual({ fecha: '2026-09-15', venc: '2026-09-15', venc_regla: null });
  });

  it('si había distancia entre fecha y vencimiento, se conserva', async () => {
    const { moverFecha } = await import('./queries');
    // Alquiler: fecha día 1, vence el 5. Se arrastra al 10 -> fecha pasa al 6.
    const tx = await insertarTx(db, { fecha: '2026-09-01', venc: '2026-09-05' });
    await moverFecha(db, tx, '2026-09-10');
    const r = await db.getFirstAsync<{ fecha: string; venc: string }>('SELECT fecha, venc FROM transacciones WHERE id = ?', tx);
    expect(r).toEqual({ fecha: '2026-09-06', venc: '2026-09-10' });
  });

  it('hacia atrás y cruzando de mes también', async () => {
    const { moverFecha } = await import('./queries');
    const tx = await insertarTx(db, { fecha: '2026-10-01', venc: '2026-10-05' });
    await moverFecha(db, tx, '2026-09-28');
    const r = await db.getFirstAsync<{ fecha: string; venc: string }>('SELECT fecha, venc FROM transacciones WHERE id = ?', tx);
    expect(r).toEqual({ fecha: '2026-09-24', venc: '2026-09-28' });
  });
});
