import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarTransaccion,
  alternarEstado,
  crearTransaccion,
  eliminarPago,
  eliminarTransaccion,
  getPagos,
  getPorPagar,
  getTransaccionesConRegla,
  PagoInvalido,
  registrarPago,
  volverAPendiente,
} from './queries';
import { materializarRecurrentes } from './materializar';
import { calcularProyeccion } from './proyeccion';
import { baseVacia, insertarRegla, insertarTx } from '../test/fixtures';
import type { DbFake } from '../test/dbFake';

let db: DbFake;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-10T10:00:00'));
  db = await baseVacia();
});

afterEach(() => {
  vi.useRealTimers();
  db.cerrar();
});

const vista = async (id: number) => {
  const todas = [...(await getTransaccionesConRegla(db, 'gasto')), ...(await getTransaccionesConRegla(db, 'ingreso'))];
  return todas.find((t) => t.id === id)!;
};
const fila = (id: number) =>
  db.getFirstAsync<{ estado: string; pagado_en: string | null; venc: string; fecha: string }>(
    'SELECT estado, pagado_en, venc, fecha FROM transacciones WHERE id = ?',
    id
  );
const cuantas = async () => (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM transacciones'))!.n;

describe('registrarPago', () => {
  it('un pago parcial deja saldo en el mismo vencimiento, sin crear otro concepto', async () => {
    const id = await insertarTx(db, { nombre: 'EPEC', monto: 100000, venc: '2026-09-20' });

    await registrarPago(db, id, { monto: 40000, fecha: '2026-09-05', nota: 'primera parte' });

    expect(await vista(id)).toMatchObject({ pagado: 40000, saldo: 60000, n_pagos: 1, estado: 'pendiente', venc: '2026-09-20' });
    expect(await fila(id)).toMatchObject({ estado: 'pendiente', pagado_en: null, venc: '2026-09-20' });
    expect(await cuantas()).toBe(1);
  });

  it('el pago que completa el saldo lo deja pagado, con la fecha del último pago', async () => {
    const id = await insertarTx(db, { monto: 100000, venc: '2026-09-20' });
    await registrarPago(db, id, { monto: 40000, fecha: '2026-09-05' });
    await registrarPago(db, id, { monto: 60000, fecha: '2026-09-08' });

    expect(await fila(id)).toMatchObject({ estado: 'pagado', pagado_en: '2026-09-08' });
    expect(await vista(id)).toMatchObject({ pagado: 100000, saldo: 0, n_pagos: 2 });
  });

  it('no deja pagar más que el saldo, ni cero', async () => {
    const id = await insertarTx(db, { monto: 100 });
    await registrarPago(db, id, { monto: 30 });

    await expect(registrarPago(db, id, { monto: 71 })).rejects.toBeInstanceOf(PagoInvalido);
    await expect(registrarPago(db, id, { monto: 0 })).rejects.toBeInstanceOf(PagoInvalido);
    await expect(registrarPago(db, 9999, { monto: 1 })).rejects.toBeInstanceOf(PagoInvalido);
    expect((await vista(id)).pagado).toBe(30);
  });

  it('la fecha por defecto es hoy', async () => {
    const id = await insertarTx(db, { monto: 100 });
    await registrarPago(db, id, { monto: 100 });
    const [p] = await getPagos(db);
    expect(p).toMatchObject({ transaccion_id: id, fecha: '2026-09-10', legado: 0, tipo: 'gasto', categoria_id: 'casa' });
  });

  it('funciona igual para cobros de ingresos', async () => {
    const id = await insertarTx(db, { tipo: 'ingreso', categoria_id: 'salario', monto: 500 });
    await registrarPago(db, id, { monto: 200 });
    expect(await vista(id)).toMatchObject({ tipo: 'ingreso', pagado: 200, saldo: 300 });
  });
});

describe('borrar pagos', () => {
  it('borrar un pago devuelve su monto al saldo y el concepto vuelve a pendiente', async () => {
    const id = await insertarTx(db, { monto: 100 });
    await registrarPago(db, id, { monto: 30, fecha: '2026-09-01' });
    await registrarPago(db, id, { monto: 70, fecha: '2026-09-02' });
    expect((await fila(id))!.estado).toBe('pagado');

    const ultimo = (await getPagos(db)).find((p) => p.monto === 70)!;
    await eliminarPago(db, ultimo.id);

    expect(await fila(id)).toMatchObject({ estado: 'pendiente', pagado_en: null });
    expect(await vista(id)).toMatchObject({ pagado: 30, saldo: 70, n_pagos: 1 });
  });

  it('volver a pendiente borra todos los pagos', async () => {
    const id = await insertarTx(db, { monto: 100 });
    await registrarPago(db, id, { monto: 30 });
    await registrarPago(db, id, { monto: 70 });
    await volverAPendiente(db, id);
    expect(await vista(id)).toMatchObject({ pagado: 0, saldo: 100, n_pagos: 0, estado: 'pendiente' });
  });

  it('borrar el concepto borra sus pagos, y las bajas quedan para subir', async () => {
    const id = await insertarTx(db, { monto: 100 });
    await registrarPago(db, id, { monto: 30 });
    await db.execAsync('DELETE FROM sync_cola');

    await eliminarTransaccion(db, id);

    expect((await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM pagos'))!.n).toBe(0);
    const cola = await db.getAllAsync<{ tabla: string; borrado: number }>('SELECT tabla, borrado FROM sync_cola ORDER BY tabla');
    expect(cola).toEqual([
      { tabla: 'pagos', borrado: 1 },
      { tabla: 'transacciones', borrado: 1 },
    ]);
  });
});

describe('estado derivado', () => {
  it('el ✓ sobre un parcial salda lo que falta (con fecha de hoy)', async () => {
    const id = await insertarTx(db, { monto: 100 });
    await registrarPago(db, id, { monto: 30, fecha: '2026-09-01' });

    await alternarEstado(db, id);

    expect(await fila(id)).toMatchObject({ estado: 'pagado', pagado_en: '2026-09-10' });
    expect((await getPagos(db)).map((p) => p.monto).sort()).toEqual([30, 70]);
  });

  it('subir el monto de algo saldado lo vuelve a dejar con saldo; bajarlo lo salda', async () => {
    const id = await insertarTx(db, { monto: 100 });
    await registrarPago(db, id, { monto: 100 });

    await db.runAsync('UPDATE transacciones SET monto = 150 WHERE id = ?', id);
    expect(await vista(id)).toMatchObject({ estado: 'pendiente', saldo: 50 });

    await db.runAsync('UPDATE transacciones SET monto = 90 WHERE id = ?', id);
    expect(await vista(id)).toMatchObject({ estado: 'pagado', saldo: 0 });
  });

  it('un pagado sin pagos (versión vieja) cuenta como pagado por el total', async () => {
    const id = await insertarTx(db, { monto: 100, estado: 'pagado' });

    expect(await vista(id)).toMatchObject({ pagado: 100, saldo: 0, n_pagos: 0 });
    const [p] = await getPagos(db);
    expect(p).toMatchObject({ id: -id, transaccion_id: id, monto: 100, legado: 1 });

    await volverAPendiente(db, id);
    expect(await vista(id)).toMatchObject({ estado: 'pendiente', pagado: 0, saldo: 100 });
  });

  it('crear como pagado registra un pago por el total, el día del movimiento', async () => {
    await crearTransaccion(db, {
      tipo: 'ingreso', nombre: 'Venta', monto: 500, categoria_id: 'extras', fecha: '2026-09-03', rec: false, estado: 'pagado',
    });
    const [p] = await getPagos(db);
    expect(p).toMatchObject({ monto: 500, fecha: '2026-09-03', legado: 0 });
    const [t] = await getTransaccionesConRegla(db, 'ingreso');
    expect(t).toMatchObject({ estado: 'pagado', saldo: 0 });
  });

  it('crear como pagado algo que vence más adelante lo paga hoy', async () => {
    await crearTransaccion(db, {
      tipo: 'gasto', nombre: 'Seguro', monto: 90, categoria_id: 'casa', fecha: '2026-09-25', venc: '2026-09-25', rec: false, estado: 'pagado',
    });
    const [p] = await getPagos(db);
    expect(p.fecha).toBe('2026-09-10');
  });

  it('editar un parcial sin tocar el estado no borra sus pagos', async () => {
    const id = await insertarTx(db, { nombre: 'Gas', monto: 100, venc: '2026-09-20' });
    await registrarPago(db, id, { monto: 30 });

    await actualizarTransaccion(db, id, {
      tipo: 'gasto', nombre: 'Gas natural', monto: 120, categoria_id: 'casa', fecha: '2026-09-20', venc: '2026-09-20', rec: false,
    });
    expect(await vista(id)).toMatchObject({ nombre: 'Gas natural', pagado: 30, saldo: 90 });

    // Con estado 'pendiente' explícito tampoco: sigue pendiente, es un parcial.
    await actualizarTransaccion(db, id, {
      tipo: 'gasto', nombre: 'Gas natural', monto: 120, categoria_id: 'casa', fecha: '2026-09-20', venc: '2026-09-20', rec: false, estado: 'pendiente',
    });
    expect((await vista(id)).pagado).toBe(30);
  });
});

describe('por pagar, reglas y proyección', () => {
  it('un parcial sigue en "por pagar", con su saldo', async () => {
    const id = await insertarTx(db, { monto: 100, venc: '2026-09-15' });
    await registrarPago(db, id, { monto: 40 });
    const [t] = await getPorPagar(db);
    expect(t).toMatchObject({ id, saldo: 60, pagado: 40 });
  });

  it('cortar una regla no borra cuotas futuras que ya tienen pagos', async () => {
    const reglaId = await insertarRegla(db, { dia_venc: 20, monto: 1000 });
    await materializarRecurrentes(db);
    const futuras = await db.getAllAsync<{ id: number; venc: string }>(
      'SELECT id, venc FROM transacciones WHERE regla_recurrente_id = ? ORDER BY venc',
      reglaId
    );
    const [sept, oct] = futuras;
    await registrarPago(db, oct.id, { monto: 300 });

    await eliminarTransaccion(db, sept.id, 'adelante');

    const quedan = await db.getAllAsync<{ venc: string }>('SELECT venc FROM transacciones ORDER BY venc');
    expect(quedan.map((q) => q.venc)).toEqual([oct.venc]);
  });

  it('la proyección de un pendiente cargado a mano cuenta solo su saldo', async () => {
    const id = await insertarTx(db, { monto: 1000, venc: '2026-11-10' });
    await registrarPago(db, id, { monto: 400 });
    const proy = await calcularProyeccion(db, 3);
    expect(proy.ARS.find((m) => m.mes === '2026-11')).toMatchObject({ egresos: 600 });
  });
});
