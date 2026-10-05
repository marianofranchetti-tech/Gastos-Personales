import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cantidadPendientes,
  encolarTodo,
  EventoRemoto,
  FilaRemota,
  Remoto,
  sincronizar,
  TablaSync,
  vaciarLocal,
} from './motor';
import { registrarEvento } from './eventos';
import { HORA_GENERADA } from '../db/schema';
import { materializarRecurrentes } from '../db/materializar';
import { alternarEstado, eliminarTransaccion, limpiarDatos } from '../db/queries';
import { baseVacia, insertarRegla, insertarTx } from '../test/fixtures';
import type { DbFake } from '../test/dbFake';

/**
 * La nube, en memoria, con las mismas reglas que el SQL de Supabase:
 * upsert por id, y un cambio más viejo que lo guardado se descarta.
 */
class NubeFalsa implements Remoto {
  tablas: Record<TablaSync, Map<string, FilaRemota>> = {
    reglas_recurrentes: new Map(),
    transacciones: new Map(),
    precios: new Map(),
  };
  eventos: EventoRemoto[] = [];
  private n = 0;

  private hora() {
    // Estrictamente creciente aunque dos escrituras caigan en el mismo milisegundo.
    return new Date(Date.UTC(2026, 0, 1) + ++this.n).toISOString();
  }

  async traer(tabla: TablaSync, desde: string, limite: number) {
    return [...this.tablas[tabla].values()]
      .filter((f) => f.servidor_actualizado! > desde)
      .sort((a, b) => (a.servidor_actualizado! < b.servidor_actualizado! ? -1 : 1))
      .slice(0, limite)
      .map((f) => ({ ...f }));
  }

  async subir(tabla: TablaSync, filas: FilaRemota[]) {
    for (const f of filas) {
      const actual = this.tablas[tabla].get(f.id);
      if (actual && f.actualizado < actual.actualizado) continue;
      this.tablas[tabla].set(f.id, { ...actual, ...f, servidor_actualizado: this.hora() });
    }
  }

  async subirEventos(evs: EventoRemoto[]) {
    this.eventos.push(...evs);
  }

  vivas(tabla: TablaSync) {
    return [...this.tablas[tabla].values()].filter((f) => !f.borrado);
  }
}

const USUARIO = '11111111-1111-4111-8111-111111111111';
const espera = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Un dispositivo recién vinculado: sin datos y sin nada pendiente. */
async function dispositivo(): Promise<DbFake> {
  const db = await baseVacia();
  await db.execAsync('DELETE FROM sync_cola; DELETE FROM eventos_cola;');
  return db;
}

const filas = (db: DbFake, sql: string, ...p: unknown[]) => db.getAllAsync<any>(sql, ...(p as never[]));

let nube: NubeFalsa;
let a: DbFake;
let b: DbFake;

beforeEach(async () => {
  nube = new NubeFalsa();
  a = await dispositivo();
  b = await dispositivo();
});

afterEach(() => {
  a.cerrar();
  b.cerrar();
});

describe('triggers de la cola', () => {
  it('un alta recibe uuid y queda anotada para subir', async () => {
    const id = await insertarTx(a, { nombre: 'Super' });
    const [t] = await filas(a, 'SELECT uuid, actualizado FROM transacciones WHERE id = ?', id);

    expect(t.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await filas(a, 'SELECT tabla, uuid, borrado FROM sync_cola')).toEqual([
      { tabla: 'transacciones', uuid: t.uuid, borrado: 0 },
    ]);
  });

  it('un cambio renueva la hora del registro', async () => {
    const id = await insertarTx(a);
    const [antes] = await filas(a, 'SELECT actualizado FROM transacciones WHERE id = ?', id);
    await espera();
    await a.runAsync('UPDATE transacciones SET monto = 1 WHERE id = ?', id);
    const [despues] = await filas(a, 'SELECT actualizado FROM transacciones WHERE id = ?', id);

    expect(despues.actualizado > antes.actualizado).toBe(true);
    expect(await cantidadPendientes(a)).toBe(1);
  });

  it('un cambio en el mismo milisegundo igual queda después del anterior', async () => {
    // Una hora "del futuro" fuerza el caso: ahora es anterior a la hora previa.
    const id = await insertarTx(a);
    await a.runAsync("UPDATE transacciones SET actualizado = '2099-01-01T00:00:00.000Z' WHERE id = ?", id);
    await a.runAsync('UPDATE transacciones SET monto = 1 WHERE id = ?', id);
    const [t] = await filas(a, 'SELECT actualizado FROM transacciones WHERE id = ?', id);
    expect(t.actualizado).toBe('2099-01-01T00:00:00.001Z');
  });

  it('una baja en el mismo milisegundo que el alta igual queda después', async () => {
    const id = await insertarTx(a);
    await a.runAsync("UPDATE transacciones SET actualizado = '2099-01-01T00:00:00.000Z' WHERE id = ?", id);
    await a.runAsync('DELETE FROM transacciones WHERE id = ?', id);
    const [baja] = await filas(a, 'SELECT actualizado FROM sync_cola WHERE borrado = 1');
    expect(baja.actualizado).toBe('2099-01-01T00:00:00.001Z');
  });

  it('una baja queda anotada como baja', async () => {
    const id = await insertarTx(a);
    await a.runAsync('DELETE FROM transacciones WHERE id = ?', id);
    const cola = await filas(a, 'SELECT borrado FROM sync_cola');
    expect(cola).toEqual([{ borrado: 1 }]);
  });

  it('la cuota de una regla toma un uuid derivado de la regla y la fecha', async () => {
    const reglaId = await insertarRegla(a, { dia_venc: 5 });
    const id = await insertarTx(a, { regla_recurrente_id: reglaId, venc: '2026-09-05' });
    const [r] = await filas(a, 'SELECT uuid FROM reglas_recurrentes WHERE id = ?', reglaId);
    const [t] = await filas(a, 'SELECT uuid, actualizado FROM transacciones WHERE id = ?', id);

    expect(t.uuid).toBe(`${r.uuid}:2026-09-05`);
    expect(t.actualizado).toBe(HORA_GENERADA);
  });
});

describe('sincronizar entre dos dispositivos', () => {
  it('un gasto cargado en uno aparece en el otro', async () => {
    await insertarTx(a, { nombre: 'Farmacia', monto: 12000 });
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    expect(await filas(b, 'SELECT nombre, monto FROM transacciones')).toEqual([{ nombre: 'Farmacia', monto: 12000 }]);
    // Lo bajado no vuelve a subir como si fuera un cambio de B.
    expect(await cantidadPendientes(b)).toBe(0);
    expect(await cantidadPendientes(a)).toBe(0);
  });

  it('las cuotas quedan unidas a la regla correcta en el otro dispositivo', async () => {
    await insertarRegla(a, { nombre: 'Alquiler', dia_venc: 5, fecha_inicio: '2026-01-01' });
    await materializarRecurrentes(a);
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    const huerfanas = await filas(
      b,
      `SELECT t.id FROM transacciones t LEFT JOIN reglas_recurrentes r ON r.id = t.regla_recurrente_id
        WHERE r.nombre IS NOT 'Alquiler'`
    );
    expect(huerfanas).toEqual([]);
    // B ya tiene las cuotas: generar de nuevo no agrega nada.
    expect(await materializarRecurrentes(b)).toBe(0);
  });

  it('la misma cuota generada en los dos no se duplica, y gana la pagada', async () => {
    const reglaId = await insertarRegla(a, { dia_venc: 5, fecha_inicio: '2026-01-01' });
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO); // B tiene la regla, todavía sin cuotas

    // El caso difícil: A genera y paga PRIMERO; B genera las mismas cuotas
    // DESPUÉS y sube antes que A. Si la cuota recién generada tuviera la hora
    // de su creación, le ganaría a la pagada y el pago se perdería.
    await materializarRecurrentes(a);
    const [cuota] = await filas(a, 'SELECT id FROM transacciones WHERE regla_recurrente_id = ? ORDER BY venc LIMIT 1', reglaId);
    await alternarEstado(a, cuota.id);
    await espera();
    await materializarRecurrentes(b);

    await sincronizar(b, nube, USUARIO);
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    const enA = await filas(a, 'SELECT uuid, estado FROM transacciones ORDER BY venc');
    const enB = await filas(b, 'SELECT uuid, estado FROM transacciones ORDER BY venc');
    expect(enB).toEqual(enA);
    expect(enB[0].estado).toBe('pagado');
    expect(nube.vivas('transacciones')).toHaveLength(enA.length);
  });

  it('pagar en un dispositivo se ve en el otro', async () => {
    const id = await insertarTx(a, { estado: 'pendiente' });
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    const [enB] = await filas(b, 'SELECT id FROM transacciones');
    await espera();
    await alternarEstado(b, enB.id);
    await sincronizar(b, nube, USUARIO);
    await sincronizar(a, nube, USUARIO);

    const [enA] = await filas(a, 'SELECT estado, pagado_en FROM transacciones WHERE id = ?', id);
    expect(enA.estado).toBe('pagado');
    expect(enA.pagado_en).not.toBeNull();
  });

  it('borrar en un dispositivo lo borra en el otro', async () => {
    const id = await insertarTx(a);
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    await eliminarTransaccion(a, id);
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    expect(await filas(b, 'SELECT id FROM transacciones')).toEqual([]);
    expect(nube.vivas('transacciones')).toEqual([]);
  });

  it('dos cambios al mismo registro: gana el más reciente, sin importar quién sube primero', async () => {
    const id = await insertarTx(a, { monto: 100 });
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);
    const [enB] = await filas(b, 'SELECT id FROM transacciones');

    await espera();
    await a.runAsync('UPDATE transacciones SET monto = 200 WHERE id = ?', id); // primero A
    await espera();
    await b.runAsync('UPDATE transacciones SET monto = 300 WHERE id = ?', enB.id); // después B

    // B sube primero; A, más viejo, llega tarde y no pisa.
    await sincronizar(b, nube, USUARIO);
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    expect(await filas(a, 'SELECT monto FROM transacciones')).toEqual([{ monto: 300 }]);
    expect(await filas(b, 'SELECT monto FROM transacciones')).toEqual([{ monto: 300 }]);
  });

  it('limpiar los datos se propaga como bajas', async () => {
    await insertarTx(a);
    await insertarTx(a, { nombre: 'Otro' });
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    await limpiarDatos(a);
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);

    expect(await filas(b, 'SELECT id FROM transacciones')).toEqual([]);
  });

  it('los precios también viajan', async () => {
    await a.runAsync(
      "INSERT INTO precios (producto, precio, moneda, comercio, categoria_id, fecha) VALUES ('Aceite', 4200, 'ARS', 'Chino', 'comida', '2026-10-01')"
    );
    await sincronizar(a, nube, USUARIO);
    await sincronizar(b, nube, USUARIO);
    expect(await filas(b, 'SELECT producto, precio FROM precios')).toEqual([{ producto: 'Aceite', precio: 4200 }]);
  });
});

describe('cuenta y dispositivo', () => {
  it('vaciar el dispositivo no borra nada de la cuenta', async () => {
    await insertarTx(a);
    await sincronizar(a, nube, USUARIO);

    await vaciarLocal(a);

    expect(await filas(a, 'SELECT id FROM transacciones')).toEqual([]);
    expect(await cantidadPendientes(a)).toBe(0);
    expect(nube.vivas('transacciones')).toHaveLength(1);

    // Y al volver a entrar, baja todo de nuevo.
    await sincronizar(a, nube, USUARIO);
    expect(await filas(a, 'SELECT id FROM transacciones')).toHaveLength(1);
  });

  it('sumar los datos de antes de tener cuenta los sube todos', async () => {
    await insertarTx(a);
    await insertarRegla(a);
    await a.execAsync('DELETE FROM sync_cola'); // como si se hubieran cargado sin cuenta

    await encolarTodo(a);
    await sincronizar(a, nube, USUARIO);

    expect(nube.vivas('transacciones')).toHaveLength(1);
    expect(nube.vivas('reglas_recurrentes')).toHaveLength(1);
  });

  it('los eventos de uso suben con el usuario y el dispositivo', async () => {
    await registrarEvento(a, 'movimiento_creado', { tipo: 'gasto' });
    await sincronizar(a, nube, USUARIO);

    expect(nube.eventos).toHaveLength(1);
    expect(nube.eventos[0]).toMatchObject({ user_id: USUARIO, tipo: 'movimiento_creado', props: { tipo: 'gasto' } });
    expect(nube.eventos[0].dispositivo_id).toBeTruthy();
    expect(await filas(a, 'SELECT id FROM eventos_cola')).toEqual([]);
  });
});
