import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearPrecio, eliminarPrecio, historialDe, resumenPorProducto } from './precios';
import { baseVacia } from '../test/fixtures';
import type { DbFake } from '../test/dbFake';

let db: DbFake;

beforeEach(async () => { db = await baseVacia(); });
afterEach(() => db.cerrar());

const p = (producto: string, precio: number, comercio: string, fecha: string) =>
  crearPrecio(db, { producto, precio, moneda: 'ARS', comercio, categoria_id: 'comida', fecha });

describe('registro de precios', () => {
  it('guarda y recupera el historial de un producto en orden cronológico', async () => {
    await p('Aceite girasol 1.5L', 4200, 'Chino', '2026-07-10');
    await p('Aceite girasol 1.5L', 4900, 'Súper', '2026-09-01');

    const h = await historialDe(db, 'Aceite girasol 1.5L');
    expect(h.map((x) => x.precio)).toEqual([4200, 4900]);
  });

  it('no toca el balance: precios vive en su propia tabla', async () => {
    await p('Aceite girasol 1.5L', 4200, 'Chino', '2026-07-10');

    const tx = await db.getFirstAsync<any>('SELECT COUNT(*) n FROM transacciones');
    expect(tx.n).toBe(0);
  });
});

describe('resumenPorProducto', () => {
  it('calcula la variación entre el primer y el último registro', async () => {
    await p('Aceite girasol 1.5L', 4000, 'Chino', '2026-06-01');
    await p('Aceite girasol 1.5L', 5000, 'Súper', '2026-09-01');

    const [r] = await resumenPorProducto(db);
    expect(r.variacion).toBe(25);
    expect(r.ultimo).toBe(5000);
    expect(r.registros).toBe(2);
  });

  it('con un solo registro no inventa una variación', async () => {
    await p('Yerba 1kg', 6000, 'Súper', '2026-09-01');

    const [r] = await resumenPorProducto(db);
    expect(r.variacion).toBeNull();
  });

  it('dice dónde se consiguió más barato, que es para lo que sirve', async () => {
    await p('Yerba 1kg', 6000, 'Súper', '2026-07-01');
    await p('Yerba 1kg', 5200, 'Mayorista', '2026-08-01');
    await p('Yerba 1kg', 6400, 'Chino', '2026-09-01');

    const [r] = await resumenPorProducto(db);
    expect(r.comercioMasBarato).toBe('Mayorista');
    expect([r.minimo, r.maximo]).toEqual([5200, 6400]);
  });

  it('agrupa sin distinguir mayúsculas', async () => {
    await p('Leche', 1000, 'A', '2026-07-01');
    await p('leche', 1200, 'B', '2026-08-01');

    expect(await resumenPorProducto(db)).toHaveLength(1);
  });

  it('un producto por renglón, el más reciente primero', async () => {
    await p('Pan', 900, 'Panadería', '2026-09-10');
    await p('Yerba 1kg', 6000, 'Súper', '2026-08-01');

    expect((await resumenPorProducto(db)).map((r) => r.producto)).toEqual(['Pan', 'Yerba 1kg']);
  });

  it('eliminar saca el registro del historial', async () => {
    const id = await p('Pan', 900, 'Panadería', '2026-09-10');
    await eliminarPrecio(db, id);

    expect(await resumenPorProducto(db)).toEqual([]);
  });
});
