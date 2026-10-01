import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alternarEstado, contarFueraDeRango, crearTransaccion, eliminarFueraDeRango, getPorPagar, marcarPagada } from './queries';
import { setVentanaPendientes } from './config';
import { baseVacia, insertarRegla, insertarTx } from '../test/fixtures';
import type { DbFake } from '../test/dbFake';

let db: DbFake;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T10:00:00'));
  db = await baseVacia();
});

afterEach(() => {
  vi.useRealTimers();
  db.cerrar();
});

const estadoDe = async (id: number) =>
  db.getFirstAsync<{ estado: string; pagado_en: string | null }>(
    'SELECT estado, pagado_en FROM transacciones WHERE id = ?',
    id
  );

describe('getPorPagar', () => {
  it('trae lo pendiente dentro de la ventana, más próximo primero', async () => {
    await insertarTx(db, { nombre: 'Lejano', venc: '2026-09-30' });
    await insertarTx(db, { nombre: 'Cercano', venc: '2026-09-03' });

    const filas = await getPorPagar(db);

    expect(filas.map((f) => f.nombre)).toEqual(['Cercano', 'Lejano']);
  });

  it('incluye lo ya vencido, que es justamente lo que urge', async () => {
    await insertarTx(db, { nombre: 'Atrasado', venc: '2026-08-20' });

    expect((await getPorPagar(db)).map((f) => f.nombre)).toEqual(['Atrasado']);
  });

  it('deja afuera lo que cae más allá de la ventana', async () => {
    await insertarTx(db, { nombre: 'Diciembre', venc: '2026-12-01' });

    expect(await getPorPagar(db)).toEqual([]);
  });

  it('sigue la ventana configurada', async () => {
    await insertarTx(db, { nombre: 'Diciembre', venc: '2026-12-01' });
    await setVentanaPendientes(db, 180);

    expect((await getPorPagar(db)).map((f) => f.nombre)).toEqual(['Diciembre']);
  });

  it('ignora lo pagado', async () => {
    await insertarTx(db, { nombre: 'Pagado', venc: '2026-09-03', estado: 'pagado' });

    expect(await getPorPagar(db)).toEqual([]);
  });

  it('filtra por tipo cuando se le pide', async () => {
    await insertarTx(db, { nombre: 'Gasto', venc: '2026-09-03', tipo: 'gasto' });
    await insertarTx(db, { nombre: 'Cobro', venc: '2026-09-04', tipo: 'ingreso', categoria_id: 'salario' });

    expect((await getPorPagar(db, 'ingreso')).map((f) => f.nombre)).toEqual(['Cobro']);
    expect((await getPorPagar(db, 'gasto')).map((f) => f.nombre)).toEqual(['Gasto']);
  });

  it('marca si la fila viene de una regla recurrente', async () => {
    const reglaId = await insertarRegla(db, { periodo: 'mensual', dia_venc: 3 });
    await insertarTx(db, { nombre: 'Con regla', venc: '2026-09-03', regla_recurrente_id: reglaId });
    await insertarTx(db, { nombre: 'Sin regla', venc: '2026-09-04' });

    const filas = await getPorPagar(db);

    expect(filas.map((f) => [f.nombre, f.rec, f.periodo])).toEqual([
      ['Con regla', 1, 'mensual'],
      ['Sin regla', 0, null],
    ]);
  });
});

describe('estado y fecha de pago', () => {
  it('marcarPagada registra el día real de pago', async () => {
    const id = await insertarTx(db, { venc: '2026-09-20' });

    await marcarPagada(db, id);

    expect(await estadoDe(id)).toMatchObject({ estado: 'pagado', pagado_en: '2026-09-01' });
  });

  it('alternarEstado deja pagado_en coherente en los dos sentidos', async () => {
    // El bug a evitar: volver algo a pendiente y que quede con fecha de pago.
    const id = await insertarTx(db, { venc: '2026-09-20' });

    await alternarEstado(db, id);
    expect(await estadoDe(id)).toMatchObject({ estado: 'pagado', pagado_en: '2026-09-01' });

    await alternarEstado(db, id);
    expect(await estadoDe(id)).toMatchObject({ estado: 'pendiente', pagado_en: null });
  });
});

describe('crearTransaccion', () => {
  it('completa el ancla que corresponde a cada periodo', async () => {
    await crearTransaccion(db, {
      tipo: 'gasto', nombre: 'Semanal', monto: 1000, categoria_id: 'casa',
      fecha: '2026-09-01', venc: '2026-09-10', rec: true, periodo: 'semanal',
    });
    await crearTransaccion(db, {
      tipo: 'gasto', nombre: 'Anual', monto: 1000, categoria_id: 'casa',
      fecha: '2026-03-17', rec: true, periodo: 'anual',
    });

    const reglas = await db.getAllAsync<{
      nombre: string; dia_semana: number | null; mes_anio: number | null; dia_venc: number | null;
    }>('SELECT nombre, dia_semana, mes_anio, dia_venc FROM reglas_recurrentes ORDER BY nombre');

    // 2026-09-10 es jueves -> 4
    expect(reglas).toEqual([
      { nombre: 'Anual', dia_semana: null, mes_anio: 3, dia_venc: 17 },
      { nombre: 'Semanal', dia_semana: 4, mes_anio: null, dia_venc: null },
    ]);
  });

  it('no crea regla cuando la transacción no es recurrente', async () => {
    await crearTransaccion(db, {
      tipo: 'gasto', nombre: 'Suelta', monto: 1000, categoria_id: 'casa',
      fecha: '2026-09-01', rec: false,
    });

    const n = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM reglas_recurrentes');
    expect(n!.n).toBe(0);
  });
});
describe('eliminarFueraDeRango', () => {
  it('borra lo anterior a desde y lo posterior a hasta, por vencimiento', async () => {
    await insertarTx(db, { nombre: 'Viejo', fecha: '2024-12-31', estado: 'pagado' });
    await insertarTx(db, { nombre: 'Borde inicio', fecha: '2025-01-01', estado: 'pagado' });
    await insertarTx(db, { nombre: 'Borde fin', fecha: '2027-06-30' });
    await insertarTx(db, { nombre: 'Lejano', fecha: '2027-07-01' });
    // Cargado dentro del rango pero vence afuera: manda el vencimiento.
    await insertarTx(db, { nombre: 'Vence afuera', fecha: '2026-10-01', venc: '2028-01-10' });

    expect(await contarFueraDeRango(db, '2025-01-01', '2027-06-30')).toEqual({ antes: 1, despues: 2 });
    expect(await eliminarFueraDeRango(db, '2025-01-01', '2027-06-30')).toBe(3);

    const quedan = await db.getAllAsync<{ nombre: string }>('SELECT nombre FROM transacciones ORDER BY id');
    expect(quedan.map((q) => q.nombre)).toEqual(['Borde inicio', 'Borde fin']);
  });
});
