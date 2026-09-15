/**
 * Registro de precios: qué salió cada cosa, dónde y cuándo.
 *
 * Es un módulo aparte del balance y no lo toca. Anotar que el aceite salió
 * $4.200 en el chino no es un gasto —el gasto fue la compra entera— es un dato
 * de referencia. Con inflación alta, tener la serie propia de lo que pagaste
 * vale más que cualquier índice publicado.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { MONEDA_DEFAULT } from '../lib/categorias';

export type Precio = {
  id: number;
  producto: string;
  precio: number;
  moneda: string;
  comercio: string;
  categoria_id: string | null;
  fecha: string;
};

export type NuevoPrecio = Omit<Precio, 'id'>;

/** Un producto con su última referencia y cómo viene variando. */
export type ResumenProducto = {
  producto: string;
  ultimo: number;
  moneda: string;
  comercio: string;
  fecha: string;
  registros: number;
  minimo: number;
  maximo: number;
  /** Variación % entre el primer y el último registro. null si hay uno solo. */
  variacion: number | null;
  /** Dónde se consiguió más barato de todos los registros. */
  comercioMasBarato: string;
};

export async function crearPrecio(db: SQLiteDatabase, p: NuevoPrecio): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO precios (producto, precio, moneda, comercio, categoria_id, fecha)
     VALUES (?, ?, ?, ?, ?, ?)`,
    p.producto.trim(),
    p.precio,
    p.moneda || MONEDA_DEFAULT,
    p.comercio.trim(),
    p.categoria_id,
    p.fecha
  );
  return r.lastInsertRowId;
}

export async function actualizarPrecio(db: SQLiteDatabase, id: number, p: NuevoPrecio): Promise<void> {
  await db.runAsync(
    `UPDATE precios SET producto = ?, precio = ?, moneda = ?, comercio = ?, categoria_id = ?, fecha = ?
      WHERE id = ?`,
    p.producto.trim(),
    p.precio,
    p.moneda || MONEDA_DEFAULT,
    p.comercio.trim(),
    p.categoria_id,
    p.fecha,
    id
  );
}

export async function eliminarPrecio(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM precios WHERE id = ?', id);
}

/** Todos los registros, del más nuevo al más viejo. */
export async function listarPrecios(db: SQLiteDatabase): Promise<Precio[]> {
  return db.getAllAsync<Precio>('SELECT * FROM precios ORDER BY fecha DESC, id DESC');
}

/** El historial de un producto, del más viejo al más nuevo. */
export async function historialDe(db: SQLiteDatabase, producto: string): Promise<Precio[]> {
  return db.getAllAsync<Precio>(
    'SELECT * FROM precios WHERE producto = ? ORDER BY fecha ASC, id ASC',
    producto
  );
}

/**
 * Un renglón por producto, con la variación entre el primer y el último
 * registro. Es la vista que justifica el módulo: sin esto son notas sueltas.
 */
export async function resumenPorProducto(db: SQLiteDatabase): Promise<ResumenProducto[]> {
  const filas = await listarPrecios(db);
  const porProducto = new Map<string, Precio[]>();
  for (const f of filas) {
    const k = f.producto.toLowerCase();
    if (!porProducto.has(k)) porProducto.set(k, []);
    porProducto.get(k)!.push(f);
  }

  const out: ResumenProducto[] = [];
  for (const registros of porProducto.values()) {
    // listarPrecios viene descendente: el primero es el más reciente.
    const ultimo = registros[0];
    const masViejo = registros[registros.length - 1];
    const precios = registros.map((r) => r.precio);
    const barato = registros.reduce((a, b) => (b.precio < a.precio ? b : a));

    out.push({
      producto: ultimo.producto,
      ultimo: ultimo.precio,
      moneda: ultimo.moneda,
      comercio: ultimo.comercio,
      fecha: ultimo.fecha,
      registros: registros.length,
      minimo: Math.min(...precios),
      maximo: Math.max(...precios),
      variacion:
        registros.length > 1 && masViejo.precio > 0
          ? Math.round(((ultimo.precio - masViejo.precio) / masViejo.precio) * 100)
          : null,
      comercioMasBarato: barato.comercio,
    });
  }

  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
