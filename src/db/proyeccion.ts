/**
 * Proyección de saldo a futuro. Solo lectura: nunca escribe en la base.
 *
 * Combina dos fuentes, cuidando de no contar nada dos veces:
 *   (a) ocurrencias futuras de las reglas activas, calculadas en memoria;
 *   (b) transacciones pendientes SIN regla (cargadas a mano) que caen dentro
 *       del horizonte.
 * Las pendientes que sí tienen regla no se suman en (b) porque ya están
 * contempladas en (a) — sumarlas duplicaría los primeros 45 días.
 *
 * Se agrupa por moneda y NO se convierte entre monedas: sin cotización real,
 * un total mezclado sería un número inventado.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { TipoTx } from '../lib/categorias';
import {
  AnclaRegla,
  compararISO,
  hoyISO,
  ocurrenciasEntre,
  sumarMesesISO,
} from '../lib/fechasRecurrentes';
import { getReglasActivas } from './materializar';

export type MesProyectado = {
  mes: string; // 'YYYY-MM'
  ingresos: number;
  egresos: number;
  diferencia: number;
  acumulado: number;
};

/** moneda -> meses en orden cronológico. */
export type ProyeccionPorMoneda = Record<string, MesProyectado[]>;

const mesDe = (iso: string) => iso.slice(0, 7);

export async function calcularProyeccion(
  db: SQLiteDatabase,
  horizonteMeses: number
): Promise<ProyeccionPorMoneda> {
  const hoy = hoyISO();
  const horizonte = sumarMesesISO(hoy, horizonteMeses);

  // moneda -> mes -> acumuladores
  const acc: Record<string, Record<string, { ingresos: number; egresos: number }>> = {};

  const sumar = (moneda: string, mes: string, tipo: TipoTx, monto: number) => {
    const porMoneda = (acc[moneda] ??= {});
    const bucket = (porMoneda[mes] ??= { ingresos: 0, egresos: 0 });
    if (tipo === 'ingreso') bucket.ingresos += monto;
    else bucket.egresos += monto;
  };

  // (a) Reglas activas repetidas hacia adelante. `desde` es exclusivo: la
  // proyección mira estrictamente después de hoy. Lo que vence hoy ya lo
  // muestra "Por pagar" en Home, y contarlo acá lo duplicaría a la vista.
  const reglas = await getReglasActivas(db);
  for (const regla of reglas) {
    const ancla: AnclaRegla = regla;
    for (const fecha of ocurrenciasEntre(ancla, hoy, horizonte)) {
      sumar(regla.moneda, mesDe(fecha), regla.tipo, regla.monto);
    }
  }

  // (b) Pendientes cargadas a mano (sin regla) dentro del horizonte.
  const manuales = await db.getAllAsync<{
    tipo: TipoTx;
    monto: number;
    moneda: string;
    venc: string;
  }>(
    `SELECT tipo, monto, moneda, venc FROM transacciones
      WHERE estado = 'pendiente' AND regla_recurrente_id IS NULL
        AND venc IS NOT NULL AND venc > ? AND venc <= ?
      ORDER BY venc ASC`,
    hoy,
    horizonte
  );
  for (const m of manuales) {
    sumar(m.moneda, mesDe(m.venc), m.tipo, m.monto);
  }

  const salida: ProyeccionPorMoneda = {};
  for (const moneda of Object.keys(acc)) {
    const meses = Object.keys(acc[moneda]).sort(compararISO);
    let acumulado = 0;
    salida[moneda] = meses.map((mes) => {
      const { ingresos, egresos } = acc[moneda][mes];
      const diferencia = ingresos - egresos;
      acumulado += diferencia;
      return { mes, ingresos, egresos, diferencia, acumulado };
    });
  }
  return salida;
}
