/**
 * Registro de uso: qué hace cada perfil en la app (abrir, cargar, pagar...).
 *
 * Se guarda en SQLite y sube con la sincronización, así que funciona sin red.
 * Nunca rompe nada: si falla el registro, la acción del usuario sigue igual.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export type TipoEvento =
  | 'app_abierta'
  | 'ingreso_cuenta'
  | 'salida_cuenta'
  | 'movimiento_creado'
  | 'movimiento_editado'
  | 'movimiento_eliminado'
  | 'movimiento_pagado'
  | 'movimiento_estado'
  | 'movimiento_movido'
  | 'pago_registrado'
  | 'pago_eliminado'
  | 'precio_guardado'
  | 'precio_eliminado'
  | 'datos_limpiados'
  | 'datos_depurados';

export async function registrarEvento(
  db: SQLiteDatabase,
  tipo: TipoEvento,
  props?: Record<string, unknown>
): Promise<void> {
  try {
    await db.runAsync(
      `INSERT INTO eventos_cola (id, tipo, props, ocurrido)
       VALUES (lower(hex(randomblob(16))), ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      tipo,
      props ? JSON.stringify(props) : null
    );
  } catch (e) {
    console.warn('[eventos] no se pudo registrar', tipo, e);
  }
}
