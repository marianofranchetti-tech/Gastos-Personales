/**
 * Materialización de reglas recurrentes en transacciones pendientes.
 *
 * Se corre una vez al abrir la app. Es idempotente: correrlo N veces no
 * duplica filas, porque antes de insertar consulta si ya existe una
 * transacción de esa regla con ese vencimiento.
 *
 * Ancla deliberada: la generación arranca el día 1 del mes en curso, no hoy.
 *
 * Arrancar en "hoy" tenía un costo escondido: quien instalaba la app un día 15
 * no veía el alquiler que vencía el 5, y su mes en curso aparecía vacío. Y
 * arrancar en fecha_inicio es peor todavía: si no abrís la app en tres meses te
 * aparecen tres meses de cuotas vencidas de golpe.
 *
 * El día 1 del mes es el punto medio: el mes en curso siempre queda completo y
 * el relleno hacia atrás nunca supera los 30 días.
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
  const inicioDeMes = `${hoy.slice(0, 7)}-01`;
  const horizonte = sumarDiasISO(hoy, ventana);
  const reglas = await getReglasActivas(db);
  if (reglas.length === 0) return 0;

  let insertadas = 0;

  await db.withTransactionAsync(async () => {
    for (const regla of reglas) {
      // `desde` exclusivo: restamos un día al 1 del mes para que una ocurrencia
      // que cae justo el día 1 también entre.
      const fechas = ocurrenciasEntre(regla, sumarDiasISO(inicioDeMes, -1), horizonte);

      for (const venc of fechas) {
        const existente = await db.getFirstAsync<{ id: number }>(
          // La ocurrencia se identifica por el vencimiento que le asignó la regla
          // (venc_regla si el usuario la movió de día, si no venc). Comparar
          // contra el venc actual haría que una cuota movida a la fecha de otra
          // cuota de la misma regla "ocupe" ese lugar y la otra nunca se genere.
          'SELECT id FROM transacciones WHERE regla_recurrente_id = ? AND COALESCE(venc_regla, venc) = ? LIMIT 1',
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
