/**
 * Edición y baja de reglas recurrentes.
 *
 * Regla de negocio: los cambios se propagan solo a las transacciones
 * PENDIENTES de esa regla. Las pagadas son hechos históricos — si el alquiler
 * sube, los meses ya pagados siguieron costando lo que costaron.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type CambiosRegla = {
  nombre?: string;
  monto?: number;
  categoria_id?: string;
  moneda?: string;
  cuenta_id?: number | null;
  fecha_fin?: string | null;
};

const CAMPOS_PROPAGABLES = ['nombre', 'monto', 'categoria_id', 'moneda', 'cuenta_id'] as const;

export async function actualizarRegla(
  db: SQLiteDatabase,
  reglaId: number,
  cambios: CambiosRegla
): Promise<void> {
  const entradas = Object.entries(cambios).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE reglas_recurrentes SET ${entradas.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`,
      ...entradas.map(([, v]) => v as any),
      reglaId
    );

    const propagables = entradas.filter(([k]) =>
      (CAMPOS_PROPAGABLES as readonly string[]).includes(k)
    );
    if (propagables.length === 0) return;

    await db.runAsync(
      `UPDATE transacciones SET ${propagables.map(([k]) => `${k} = ?`).join(', ')}
        WHERE regla_recurrente_id = ? AND estado = 'pendiente'`,
      ...propagables.map(([, v]) => v as any),
      reglaId
    );
  });
}

/** Deja de generar ocurrencias nuevas. No toca las que ya existen. */
export async function desactivarRegla(db: SQLiteDatabase, reglaId: number): Promise<void> {
  await db.runAsync('UPDATE reglas_recurrentes SET activa = 0 WHERE id = ?', reglaId);
}

/**
 * "Eliminar" desde la UI. Si la regla ya generó transacciones, es baja lógica
 * (borrarla dejaría filas huérfanas apuntando a una regla inexistente).
 * Además limpia las pendientes futuras, que son proyecciones, no historia.
 */
export async function eliminarRegla(db: SQLiteDatabase, reglaId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM transacciones WHERE regla_recurrente_id = ? AND estado = 'pendiente'",
      reglaId
    );

    const quedaAlguna = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM transacciones WHERE regla_recurrente_id = ? LIMIT 1',
      reglaId
    );

    if (quedaAlguna) {
      await db.runAsync('UPDATE reglas_recurrentes SET activa = 0 WHERE id = ?', reglaId);
    } else {
      await db.runAsync('DELETE FROM reglas_recurrentes WHERE id = ?', reglaId);
    }
  });
}
