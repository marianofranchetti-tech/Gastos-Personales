/**
 * Adaptador de `node:sqlite` con la superficie de `SQLiteDatabase` de expo-sqlite.
 *
 * Los tests corren contra SQLite de verdad, no contra un mock: si una query
 * tiene un error de sintaxis o una constraint mal puesta, acá revienta igual
 * que en el teléfono. Lo que NO cubre es el runtime de Expo (WAL, permisos,
 * el binding nativo), así que un test verde acá no reemplaza probar la app.
 *
 * Solo implementa los métodos que usa el código de producción.
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

type Params = unknown[];

/** expo-sqlite acepta `(sql, ...params)` y también `(sql, paramsArray)`. */
function normalizar(params: Params): unknown[] {
  if (params.length === 1 && Array.isArray(params[0])) return params[0] as unknown[];
  return params;
}

/** node:sqlite no acepta undefined ni boolean como binding. */
function saneado(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export type DbFake = SQLiteDatabase & { __raw: DatabaseSync; cerrar: () => void };

export function crearDbFake(): DbFake {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');

  let enTransaccion = false;

  const api = {
    __raw: raw,
    cerrar: () => raw.close(),

    async execAsync(sql: string) {
      raw.exec(sql);
    },

    async runAsync(sql: string, ...params: Params) {
      const r = raw.prepare(sql).run(...(saneado(normalizar(params)) as never[]));
      return {
        lastInsertRowId: Number(r.lastInsertRowid),
        changes: Number(r.changes),
      };
    },

    async getAllAsync<T>(sql: string, ...params: Params): Promise<T[]> {
      return raw.prepare(sql).all(...(saneado(normalizar(params)) as never[])) as T[];
    },

    async getFirstAsync<T>(sql: string, ...params: Params): Promise<T | null> {
      const row = raw.prepare(sql).get(...(saneado(normalizar(params)) as never[]));
      return (row as T) ?? null;
    },

    /**
     * SQLite no anida transacciones. Igual que expo-sqlite, si ya hay una
     * abierta el callback corre dentro de esa en vez de fallar.
     */
    async withTransactionAsync(fn: () => Promise<void>) {
      if (enTransaccion) {
        await fn();
        return;
      }
      enTransaccion = true;
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        enTransaccion = false;
      }
    },
  };

  return api as unknown as DbFake;
}
