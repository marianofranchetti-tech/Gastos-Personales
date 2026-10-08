/**
 * Motor de sincronización: SQLite local <-> nube.
 *
 * La app sigue leyendo y escribiendo solo en SQLite; funciona igual sin red.
 * Los triggers de la v8 (ver schema.ts) anotan cada cambio en `sync_cola`, y
 * este módulo hace el resto:
 *
 *   1. Baja lo que cambió en la nube desde la última vez y lo aplica.
 *   2. Sube lo que quedó en la cola.
 *
 * Conflictos: gana el cambio más reciente (`actualizado`), registro por
 * registro. La nube aplica la misma regla de su lado, así que un dispositivo
 * atrasado no puede pisar un cambio más nuevo.
 *
 * Las bajas viajan como marcas (`borrado = true`): si la fila desapareciera de
 * la nube, los otros dispositivos no tendrían cómo enterarse de que se borró.
 *
 * No conoce a Supabase: habla con un `Remoto`. En la app es Supabase (ver
 * remotoSupabase.ts); en los tests, un remoto en memoria.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type TablaSync = 'reglas_recurrentes' | 'transacciones' | 'pagos' | 'precios';

/**
 * Orden de aplicación: cada tabla después de la que nombra (las reglas antes
 * que las transacciones, y estas antes que sus pagos).
 */
export const TABLAS: TablaSync[] = ['reglas_recurrentes', 'transacciones', 'pagos', 'precios'];

/**
 * La nube todavía no tiene esta tabla: la app se actualizó antes de correr la
 * migración de Supabase. No es un error de la sincronización: esa tabla se
 * saltea (lo local queda en la cola) y las demás siguen andando.
 */
export class TablaInexistente extends Error {
  constructor(readonly tabla: TablaSync) {
    super(`La tabla ${tabla} no existe en la nube`);
  }
}

/** Columnas de datos que viajan tal cual. `id`, `uuid` y `actualizado` van aparte. */
const COLUMNAS: Record<TablaSync, string[]> = {
  reglas_recurrentes: [
    'tipo', 'nombre', 'categoria_id', 'monto', 'moneda', 'periodo', 'fijo',
    'fecha_inicio', 'dia_venc', 'dia_semana', 'mes_anio', 'fecha_fin', 'activa',
  ],
  // regla_recurrente_id es un id local: viaja traducido a `regla_id` (el uuid de la regla).
  transacciones: [
    'tipo', 'nombre', 'categoria_id', 'monto', 'moneda', 'fecha', 'venc', 'estado',
    'pagado_en', 'venc_regla',
  ],
  // transaccion_id es un id local: viaja traducido al uuid de la transacción.
  pagos: ['monto', 'fecha', 'nota'],
  precios: ['producto', 'precio', 'moneda', 'comercio', 'categoria_id', 'fecha'],
};

/** Una fila tal como vive en la nube. `id` es el uuid local. */
export type FilaRemota = {
  id: string;
  user_id?: string;
  actualizado: string;
  borrado: boolean;
  /** Hora de escritura en el servidor: es el cursor de descarga. */
  servidor_actualizado?: string;
  regla_id?: string | null;
  /** En pagos: uuid de la transacción. */
  transaccion_id?: string | null;
  [columna: string]: unknown;
};

export type EventoRemoto = {
  id: string;
  user_id: string;
  dispositivo_id: string | null;
  tipo: string;
  props: Record<string, unknown> | null;
  ocurrido: string;
};

export interface Remoto {
  /** Filas con servidor_actualizado > desde, en orden ascendente, hasta `limite`. */
  traer(tabla: TablaSync, desde: string, limite: number): Promise<FilaRemota[]>;
  /** Upsert por (user_id, id). La nube descarta lo que sea más viejo que lo suyo. */
  subir(tabla: TablaSync, filas: FilaRemota[]): Promise<void>;
  subirEventos(eventos: EventoRemoto[]): Promise<void>;
}

const LOTE = 500;
/**
 * Al bajar se repasan también los últimos dos minutos antes del cursor. Dos
 * dispositivos que suben a la vez pueden confirmar en otro orden que el de sus
 * horas, y sin este margen una de esas filas quedaría salteada para siempre.
 * Reaplicar es inofensivo: lo que no es más nuevo que lo local se ignora.
 */
const MARGEN_MS = 2 * 60 * 1000;

// ---------------------------------------------------------------------------
// Estado (sync_meta)
// ---------------------------------------------------------------------------

export async function leerMeta(db: SQLiteDatabase, clave: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ valor: string | null }>('SELECT valor FROM sync_meta WHERE clave = ?', clave);
  return r?.valor ?? null;
}

export async function escribirMeta(db: SQLiteDatabase, clave: string, valor: string | null): Promise<void> {
  if (valor === null) {
    await db.runAsync('DELETE FROM sync_meta WHERE clave = ?', clave);
    return;
  }
  await db.runAsync(
    'INSERT INTO sync_meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
    clave,
    valor
  );
}

/** Corre `fn` con los triggers en silencio: lo que hace no se anota para subir. */
async function sinAnotar(db: SQLiteDatabase, fn: () => Promise<void>): Promise<void> {
  await escribirMeta(db, 'aplicando', '1');
  try {
    await fn();
  } finally {
    await escribirMeta(db, 'aplicando', '0');
  }
}

export async function cantidadPendientes(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_cola');
  return r?.n ?? 0;
}

/** Cuántos registros propios tiene este dispositivo (sin contar la nube). */
export async function cantidadLocal(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM transacciones) + (SELECT COUNT(*) FROM reglas_recurrentes)
            + (SELECT COUNT(*) FROM precios) AS n`
  );
  return r?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Bajar
// ---------------------------------------------------------------------------

export type ResultadoSync = { bajados: number; subidos: number; depurados: number };

export async function bajarCambios(db: SQLiteDatabase, remoto: Remoto): Promise<{ aplicados: number; depurados: number }> {
  const cambios: Record<TablaSync, FilaRemota[]> = { reglas_recurrentes: [], transacciones: [], pagos: [], precios: [] };
  const cursores: Partial<Record<TablaSync, string>> = {};

  for (const tabla of TABLAS) {
    const cursor = await leerMeta(db, `cursor_${tabla}`);
    let desde = cursor ? new Date(Date.parse(cursor) - MARGEN_MS).toISOString() : '1970-01-01T00:00:00.000Z';
    for (;;) {
      let filas: FilaRemota[];
      try {
        filas = await remoto.traer(tabla, desde, LOTE);
      } catch (e) {
        if (e instanceof TablaInexistente) break;
        throw e;
      }
      cambios[tabla].push(...filas);
      const ultimo = filas[filas.length - 1]?.servidor_actualizado;
      if (ultimo && (!cursores[tabla] || ultimo > cursores[tabla]!)) cursores[tabla] = ultimo;
      if (filas.length < LOTE || !ultimo || ultimo === desde) break;
      desde = ultimo;
    }
  }

  let aplicados = 0;
  await db.withTransactionAsync(async () => {
    await sinAnotar(db, async () => {
      // Altas y cambios primero (reglas antes que transacciones); bajas al
      // final y al revés, así una transacción nunca apunta a una regla que ya no está.
      for (const tabla of TABLAS) {
        for (const f of cambios[tabla]) if (!f.borrado) aplicados += await aplicarFila(db, tabla, f);
      }
      for (const tabla of [...TABLAS].reverse()) {
        for (const f of cambios[tabla]) if (f.borrado) aplicados += await aplicarFila(db, tabla, f);
      }
    });
    for (const [tabla, cursor] of Object.entries(cursores)) await escribirMeta(db, `cursor_${tabla}`, cursor!);
  });

  // Fuera de sinAnotar: lo que se depura sí tiene que subir como baja.
  const depurados = aplicados > 0 ? await depurarDuplicados(db) : 0;
  return { aplicados, depurados };
}

/** Aplica una fila remota si es más nueva que lo local. Devuelve 1 si la aplicó. */
async function aplicarFila(db: SQLiteDatabase, tabla: TablaSync, f: FilaRemota): Promise<number> {
  const remota = normalizarHora(f.actualizado);
  const local = await db.getFirstAsync<{ id: number; actualizado: string | null }>(
    `SELECT id, actualizado FROM ${tabla} WHERE uuid = ?`,
    f.id
  );
  const enCola = await db.getFirstAsync<{ actualizado: string }>(
    'SELECT actualizado FROM sync_cola WHERE tabla = ? AND uuid = ?',
    tabla,
    f.id
  );
  // Lo local cuenta con su hora; si se borró acá y la baja no subió todavía,
  // cuenta la hora de la baja.
  const horaLocal = local?.actualizado ?? enCola?.actualizado ?? null;
  if (horaLocal && horaLocal >= remota) return 0;

  // Un pago necesita su transacción. Si acá no está (se borró y la baja no
  // subió todavía), el pago no tiene dónde ir: se saltea.
  let transaccionLocal: number | null = null;
  if (tabla === 'pagos' && !f.borrado) {
    const t = f.transaccion_id
      ? await db.getFirstAsync<{ id: number }>('SELECT id FROM transacciones WHERE uuid = ?', f.transaccion_id)
      : null;
    if (!t) return 0;
    transaccionLocal = t.id;
  }

  if (f.borrado) {
    if (local) {
      if (tabla === 'reglas_recurrentes') {
        await db.runAsync('UPDATE transacciones SET regla_recurrente_id = NULL WHERE regla_recurrente_id = ?', local.id);
      }
      await db.runAsync(`DELETE FROM ${tabla} WHERE id = ?`, local.id);
    }
  } else {
    const cols = COLUMNAS[tabla];
    const valores = cols.map((c) => (f[c] === undefined ? null : f[c])) as (string | number | null)[];
    const extraCols: string[] = [];
    const extraVals: (string | number | null)[] = [];
    if (tabla === 'transacciones') {
      const regla = f.regla_id
        ? await db.getFirstAsync<{ id: number }>('SELECT id FROM reglas_recurrentes WHERE uuid = ?', f.regla_id)
        : null;
      extraCols.push('regla_recurrente_id');
      extraVals.push(regla?.id ?? null);
    }
    if (tabla === 'pagos') {
      extraCols.push('transaccion_id');
      extraVals.push(transaccionLocal);
    }
    const todas = [...cols, ...extraCols];
    const vals = [...valores, ...extraVals];
    if (local) {
      await db.runAsync(
        `UPDATE ${tabla} SET ${todas.map((c) => `${c} = ?`).join(', ')}, actualizado = ? WHERE id = ?`,
        ...vals,
        remota,
        local.id
      );
    } else {
      await db.runAsync(
        `INSERT INTO ${tabla} (${todas.join(', ')}, uuid, actualizado) VALUES (${todas.map(() => '?').join(', ')}, ?, ?)`,
        ...vals,
        f.id,
        remota
      );
    }
  }

  // Ganó la nube: lo que hubiera pendiente de este registro ya no corre.
  if (enCola) await db.runAsync('DELETE FROM sync_cola WHERE tabla = ? AND uuid = ?', tabla, f.id);
  return 1;
}

/**
 * Red de seguridad: dos ocurrencias de la misma regla para el mismo
 * vencimiento original. Puede pasar si un dispositivo generó la cuota antes de
 * enterarse de que en otro ya existía con otro uuid. Queda la que tiene más
 * pagado, y si no la más reciente. La otra se borra (con sus pagos, si tenía) y
 * su baja sube como cualquier otra.
 */
async function depurarDuplicados(db: SQLiteDatabase): Promise<number> {
  const r = await db.runAsync(
    `DELETE FROM transacciones WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
                  PARTITION BY regla_recurrente_id, COALESCE(venc_regla, venc)
                  ORDER BY (estado = 'pagado') DESC,
                           (SELECT COALESCE(SUM(p.monto), 0) FROM pagos p WHERE p.transaccion_id = transacciones.id) DESC,
                           actualizado DESC, id
                ) AS n
           FROM transacciones
          WHERE regla_recurrente_id IS NOT NULL AND COALESCE(venc_regla, venc) IS NOT NULL
       ) WHERE n > 1
     )`
  );
  return r.changes;
}

// ---------------------------------------------------------------------------
// Subir
// ---------------------------------------------------------------------------

type EntradaCola = { tabla: TablaSync; uuid: string; borrado: number; actualizado: string };

export async function subirCambios(db: SQLiteDatabase, remoto: Remoto, usuarioId: string): Promise<number> {
  let subidos = 0;
  // Tablas que la nube todavía no tiene: lo suyo queda en la cola para después.
  const faltantes: TablaSync[] = [];
  // Tope de vueltas: si algo se reencola sin parar, no colgamos la app.
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const cola = await db.getAllAsync<EntradaCola>(
      `SELECT tabla, uuid, borrado, actualizado FROM sync_cola
        WHERE tabla NOT IN (${faltantes.map(() => '?').join(', ')})
        ORDER BY actualizado LIMIT ?`,
      ...faltantes,
      LOTE
    );
    if (cola.length === 0) break;

    for (const tabla of TABLAS) {
      const deTabla = cola.filter((e) => e.tabla === tabla);
      if (deTabla.length === 0) continue;

      const altas = await filasParaSubir(db, tabla, deTabla.filter((e) => !e.borrado).map((e) => e.uuid), usuarioId);
      const bajas: FilaRemota[] = deTabla
        .filter((e) => e.borrado)
        .map((e) => ({ id: e.uuid, user_id: usuarioId, actualizado: e.actualizado, borrado: true }));

      try {
        if (altas.length) await remoto.subir(tabla, altas);
        if (bajas.length) await remoto.subir(tabla, bajas);
      } catch (e) {
        if (!(e instanceof TablaInexistente)) throw e;
        faltantes.push(tabla);
        continue;
      }

      // Se saca de la cola solo si no cambió mientras subía: si el usuario lo
      // editó en el medio, la entrada nueva tiene otra hora y queda para la próxima.
      for (const e of deTabla) {
        await db.runAsync(
          'DELETE FROM sync_cola WHERE tabla = ? AND uuid = ? AND actualizado = ?',
          e.tabla,
          e.uuid,
          e.actualizado
        );
      }
      subidos += deTabla.length;
    }
    if (cola.length < LOTE) break;
  }
  return subidos;
}

async function filasParaSubir(
  db: SQLiteDatabase,
  tabla: TablaSync,
  uuids: string[],
  usuarioId: string
): Promise<FilaRemota[]> {
  if (uuids.length === 0) return [];
  const cols = COLUMNAS[tabla];
  const marcas = uuids.map(() => '?').join(', ');
  const sql =
    tabla === 'transacciones'
      ? `SELECT ${cols.map((c) => `t.${c}`).join(', ')}, t.uuid, t.actualizado, r.uuid AS regla_id
           FROM transacciones t LEFT JOIN reglas_recurrentes r ON r.id = t.regla_recurrente_id
          WHERE t.uuid IN (${marcas})`
      : tabla === 'pagos'
        ? `SELECT ${cols.map((c) => `p.${c}`).join(', ')}, p.uuid, p.actualizado, t.uuid AS transaccion_id
             FROM pagos p JOIN transacciones t ON t.id = p.transaccion_id
            WHERE p.uuid IN (${marcas})`
        : `SELECT ${cols.join(', ')}, uuid, actualizado FROM ${tabla} WHERE uuid IN (${marcas})`;
  const filas = await db.getAllAsync<Record<string, unknown>>(sql, ...uuids);

  return filas.map((f) => {
    const { uuid, actualizado, ...datos } = f;
    return { ...datos, id: uuid as string, user_id: usuarioId, actualizado: actualizado as string, borrado: false };
  });
}

async function subirEventos(db: SQLiteDatabase, remoto: Remoto, usuarioId: string): Promise<void> {
  const dispositivo = await leerMeta(db, 'dispositivo_id');
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const evs = await db.getAllAsync<{ id: string; tipo: string; props: string | null; ocurrido: string }>(
      'SELECT id, tipo, props, ocurrido FROM eventos_cola ORDER BY ocurrido LIMIT ?',
      LOTE
    );
    if (evs.length === 0) return;
    await remoto.subirEventos(
      evs.map((e) => ({
        id: e.id,
        user_id: usuarioId,
        dispositivo_id: dispositivo,
        tipo: e.tipo,
        props: e.props ? JSON.parse(e.props) : null,
        ocurrido: e.ocurrido,
      }))
    );
    await db.runAsync(`DELETE FROM eventos_cola WHERE id IN (${evs.map(() => '?').join(', ')})`, ...evs.map((e) => e.id));
    if (evs.length < LOTE) return;
  }
}

/** Una vuelta completa: primero bajar (puede resolver conflictos), después subir. */
export async function sincronizar(db: SQLiteDatabase, remoto: Remoto, usuarioId: string): Promise<ResultadoSync> {
  const { aplicados, depurados } = await bajarCambios(db, remoto);
  const subidos = await subirCambios(db, remoto, usuarioId);
  await subirEventos(db, remoto, usuarioId);
  await escribirMeta(db, 'ultima_sync', new Date().toISOString());
  return { bajados: aplicados, subidos, depurados };
}

// ---------------------------------------------------------------------------
// Cuenta y dispositivo
// ---------------------------------------------------------------------------

/**
 * Primer ingreso con datos ya cargados en este dispositivo: el usuario eligió
 * sumarlos a su cuenta. Se anota todo para subir, con su hora original.
 */
export async function encolarTodo(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const tabla of TABLAS) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_cola (tabla, uuid, borrado, actualizado)
           SELECT ?, uuid, 0, actualizado FROM ${tabla} WHERE uuid IS NOT NULL`,
        tabla
      );
    }
  });
}

/**
 * Deja el dispositivo sin datos de nadie: al cerrar sesión, o al entrar con
 * otra cuenta. Lo borrado NO sube como baja: esos datos siguen en la cuenta.
 */
export async function vaciarLocal(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await sinAnotar(db, async () => {
      await db.runAsync('DELETE FROM pagos');
      await db.runAsync('DELETE FROM transacciones');
      await db.runAsync('DELETE FROM reglas_recurrentes');
      await db.runAsync('DELETE FROM precios');
    });
    await db.runAsync('DELETE FROM sync_cola');
    await db.runAsync('DELETE FROM eventos_cola');
    await db.runAsync(
      "DELETE FROM sync_meta WHERE clave LIKE 'cursor_%' OR clave IN ('usuario_id', 'ultima_sync')"
    );
  });
}

/** Postgres devuelve '2026-10-05T03:00:00.123+00:00'; acá se compara como texto ISO con Z. */
function normalizarHora(s: string): string {
  return new Date(s).toISOString();
}
