/**
 * Materialización de reglas recurrentes en transacciones pendientes.
 *
 * Se corre una vez al abrir la app. Es idempotente: correrlo N veces no
 * duplica filas, porque antes de insertar consulta si ya existe una
 * transacción de esa regla con ese vencimiento.
 *
 * Ancla deliberada: nunca se materializa hacia atrás. Si el usuario no abrió
 * la app durante tres meses no aparecen tres meses de cuotas vencidas de la
 * nada; la generación arranca en el día de hoy.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { AnclaRegla, hoyISO, ocurrenciasEntre, sumarDiasISO } from '../lib/fechasRecurrentes';
import { getVentanaPendientes } from './config';
import { TipoTx } from '../lib/categorias';

type ReglaCompleta = AnclaRegla & {
  tipo: TipoTx;
  nombre: string;
  categoria_id: string;
  cuenta_id: number | null;
  monto: number;
  moneda: string;
};

const SELECT_REGLAS_ACTIVAS = `
  SELECT id, tipo, nombre, categoria_id, cuenta_id, monto, moneda, periodo,
         dia_venc, dia_semana, mes_anio, fecha_inicio, fecha_fin
    FROM reglas_recurrentes
   WHERE activa = 1
`;

export async function getReglasActivas(db: SQLiteDatabase): Promise<ReglaCompleta[]> {
  return db.getAllAsync<ReglaCompleta>(SELECT_REGLAS_ACTIVAS);
}

/**
 * Genera las transacciones pendientes de las reglas activas dentro de la
 * ventana configurada. Devuelve cuántas filas insertó (0 = nada que hacer).
 */
export async function materializarRecurrentes(db: SQLiteDatabase): Promise<number> {
  const ventana = await getVentanaPendientes(db);
  const hoy = hoyISO();
  const horizonte = sumarDiasISO(hoy, ventana);
  const reglas = await getReglasActivas(db);
  if (reglas.length === 0) return 0;

  let insertadas = 0;

  await db.withTransactionAsync(async () => {
    for (const regla of reglas) {
      // `desde` exclusivo: restamos un día para que una ocurrencia que cae
      // justo hoy también se materialice.
      const fechas = ocurrenciasEntre(regla, sumarDiasISO(hoy, -1), horizonte);

      for (const venc of fechas) {
        const existente = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM transacciones WHERE regla_recurrente_id = ? AND venc = ? LIMIT 1',
          regla.id,
          venc
        );
        if (existente) continue;

        await db.runAsync(
          `INSERT INTO transacciones
             (tipo, nombre, categoria_id, cuenta_id, monto, moneda, fecha, venc, estado, regla_recurrente_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
          regla.tipo,
          regla.nombre,
          regla.categoria_id,
          regla.cuenta_id ?? null,
          regla.monto,
          regla.moneda,
          venc,
          venc,
          regla.id
        );
        insertadas += 1;
      }
    }
  });

  return insertadas;
}
