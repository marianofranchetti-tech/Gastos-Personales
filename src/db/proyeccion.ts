/**
 * Proyección de saldo a futuro. Solo lectura: nunca escribe en la base.
 *
 * Arranca en el PRIMER DÍA DEL MES SIGUIENTE y devuelve solo meses calendario
 * completos. El mes en curso queda afuera a propósito: a mitad de mes ya tiene
 * sueldo cobrado y cuotas pagadas, así que proyectar solo lo que le falta lo
 * mostraría en rojo profundo sin serlo. Lo del mes en curso se mira en Home,
 * que sí distingue lo ya movido de lo pendiente.
 *
 * Combina dos fuentes, cuidando de no contar nada dos veces:
 *   (a) ocurrencias futuras de las reglas activas, calculadas en memoria;
 *   (b) transacciones pendientes SIN regla (cargadas a mano) que caen dentro
 *       del horizonte.
 * Las pendientes que sí tienen regla no se suman en (b) porque ya están
 * contempladas en (a) — sumarlas duplicaría los primeros meses.
 *
 * Se agrupa por moneda y NO se convierte entre monedas: sin cotización real,
 * un total mezclado sería un número inventado.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { TipoTx } from '../lib/categorias';
import {
  AnclaRegla,
  compararISO,
  finDeMesISO,
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
  // `desde` exclusivo = último día del mes en curso, así la primera ocurrencia
  // posible es el día 1 del mes siguiente. `hasta` = fin del último mes pedido,
  // para que ningún mes de la serie quede cortado por la mitad.
  const desde = finDeMesISO(hoyISO());
  const horizonte = finDeMesISO(sumarMesesISO(desde, horizonteMeses));

  // moneda -> mes -> acumuladores
  const acc: Record<string, Record<string, { ingresos: number; egresos: number }>> = {};

  const sumar = (moneda: string, mes: string, tipo: TipoTx, monto: number) => {
    const porMoneda = (acc[moneda] ??= {});
    const bucket = (porMoneda[mes] ??= { ingresos: 0, egresos: 0 });
    if (tipo === 'ingreso') bucket.ingresos += monto;
    else bucket.egresos += monto;
  };

  // (a) Reglas activas repetidas hacia adelante.
  const reglas = await getReglasActivas(db);
  for (const regla of reglas) {
    const ancla: AnclaRegla = regla;
    for (const fecha of ocurrenciasEntre(ancla, desde, horizonte)) {
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
    // Lo que ya tiene pagos parciales proyecta solo su saldo.
    `SELECT tipo, monto - COALESCE((SELECT SUM(p.monto) FROM pagos p WHERE p.transaccion_id = transacciones.id), 0) AS monto,
            moneda, venc FROM transacciones
      WHERE estado = 'pendiente' AND regla_recurrente_id IS NULL
        AND venc IS NOT NULL AND venc > ? AND venc <= ?
      ORDER BY venc ASC`,
    desde,
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
