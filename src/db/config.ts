import type { SQLiteDatabase } from 'expo-sqlite';

export const VENTANA_PENDIENTES_DEFAULT = 45;

/** Días hacia adelante que se materializan y se muestran en "Por pagar". */
export async function getVentanaPendientes(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM config WHERE clave = 'ventana_pendientes_dias'"
  );
  const n = row ? parseInt(row.valor, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : VENTANA_PENDIENTES_DEFAULT;
}

export async function setVentanaPendientes(db: SQLiteDatabase, dias: number): Promise<void> {
  await db.runAsync(
    "INSERT INTO config (clave, valor) VALUES ('ventana_pendientes_dias', ?) " +
      'ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
    String(dias)
  );
}
