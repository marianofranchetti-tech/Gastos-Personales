/**
 * Serie de 9 meses para los gráficos de barras: el mes en curso, cuatro hacia
 * atrás y cuatro hacia adelante.
 *
 * Ventana móvil, no año calendario: así siempre tiene la misma forma y el mes
 * actual queda al centro. Nueve columnas entran sin scroll en un teléfono y
 * dejan aire entre barras; doce obligaban a adelgazarlas hasta lo ilegible.
 *
 * Los meses ya vividos salen de lo efectivamente registrado; los que faltan,
 * de la proyección. La frontera importa y el gráfico la marca: un mes pasado
 * es un hecho, uno futuro es una estimación, y mezclarlos sin avisar convierte
 * un gráfico en una promesa.
 *
 * No se suman monedas entre sí: la serie es de una moneda por vez.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { MONEDA_DEFAULT } from '../lib/categorias';
import { hoyISO, sumarMesesISO } from '../lib/fechasRecurrentes';
import { calcularProyeccion } from './proyeccion';

export const MESES_ATRAS = 4;
export const MESES_ADELANTE = 4;

export type MesBarra = {
  mes: string; // 'YYYY-MM'
  ingresos: number;
  egresos: number;
  /** false = proyección, todavía no ocurrió. */
  real: boolean;
  /** El mes en curso: ni pasado cerrado ni proyección pura. */
  actual: boolean;
};

const CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** '2026-09' -> 'Sep'. */
export const cortoDeMes = (mes: string) => CORTO[Number(mes.slice(5, 7)) - 1];
/** '2026-09' -> "Sep '26", para cuando hace falta desambiguar el año. */
export const cortoConAnio = (mes: string) => `${cortoDeMes(mes)} '${mes.slice(2, 4)}`;

/** Los 9 meses de la ventana, en orden cronológico. */
export function ventanaMeses(mesActual: string): string[] {
  const primero = sumarMesesISO(`${mesActual}-01`, -MESES_ATRAS).slice(0, 7);
  return Array.from({ length: MESES_ATRAS + 1 + MESES_ADELANTE }, (_, i) =>
    sumarMesesISO(`${primero}-01`, i).slice(0, 7)
  );
}

/**
 * Hasta el mes en curso inclusive se lee lo registrado en `transacciones`, sin
 * importar el estado: un vencimiento impago igual es plata que se debe. De ahí
 * en adelante manda la proyección, que ya sabe no contar dos veces lo que una
 * regla generó como pendiente.
 */
export async function estadisticasVentana(
  db: SQLiteDatabase,
  moneda: string = MONEDA_DEFAULT
): Promise<MesBarra[]> {
  const mesActual = hoyISO().slice(0, 7);
  const meses = ventanaMeses(mesActual);

  const acc: Record<string, { ingresos: number; egresos: number }> = {};
  for (const m of meses) acc[m] = { ingresos: 0, egresos: 0 };

  // (a) Lo registrado, desde el primer mes de la ventana hasta el actual.
  const filas = await db.getAllAsync<{ mes: string; tipo: string; total: number }>(
    `SELECT substr(fecha, 1, 7) AS mes, tipo, SUM(monto) AS total
       FROM transacciones
      WHERE moneda = ? AND substr(fecha, 1, 7) BETWEEN ? AND ?
      GROUP BY mes, tipo`,
    moneda,
    meses[0],
    mesActual
  );
  for (const f of filas) {
    if (!acc[f.mes]) continue;
    if (f.tipo === 'ingreso') acc[f.mes].ingresos += f.total;
    else acc[f.mes].egresos += f.total;
  }

  // (b) Lo proyectado. calcularProyeccion arranca en el mes siguiente al
  // actual, justo donde termina (a): no se pisan ni queda un hueco.
  const proy = await calcularProyeccion(db, MESES_ADELANTE);
  for (const m of proy[moneda] ?? []) {
    if (!acc[m.mes]) continue;
    acc[m.mes].ingresos += m.ingresos;
    acc[m.mes].egresos += m.egresos;
  }

  return meses.map((mes) => ({
    mes,
    ingresos: acc[mes].ingresos,
    egresos: acc[mes].egresos,
    real: mes <= mesActual,
    actual: mes === mesActual,
  }));
}

/** Monedas que aparecen en la base, para no graficar una sola a ciegas. */
export async function monedasUsadas(db: SQLiteDatabase): Promise<string[]> {
  const filas = await db.getAllAsync<{ moneda: string }>(
    'SELECT DISTINCT moneda FROM transacciones ORDER BY moneda'
  );
  return filas.map((f) => f.moneda);
}

/**
 * Gasto comprometido del mes en curso: lo que viene de una regla recurrente
 * marcada como fija. Es el numerador de "cuánto de lo que gasto no puedo
 * recortar sin renegociar algo".
 */
export async function gastosFijosDelMes(
  db: SQLiteDatabase,
  moneda: string = MONEDA_DEFAULT
): Promise<number> {
  const mes = hoyISO().slice(0, 7);
  const r = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(t.monto) AS total
       FROM transacciones t
       JOIN reglas_recurrentes g ON g.id = t.regla_recurrente_id
      WHERE t.tipo = 'gasto' AND t.moneda = ?
        AND substr(t.fecha, 1, 7) = ? AND g.fijo = 1`,
    moneda,
    mes
  );
  return r?.total ?? 0;
}

/**
 * De dónde viene la plata en la ventana de meses reales, agrupado por concepto.
 * Sirve para medir concentración: un solo nombre con el 95% es un riesgo,
 * aunque el monto total esté bien.
 */
export async function fuentesDeIngreso(
  db: SQLiteDatabase,
  moneda: string = MONEDA_DEFAULT
): Promise<{ nombre: string; monto: number }[]> {
  const mesActual = hoyISO().slice(0, 7);
  const desde = ventanaMeses(mesActual)[0];
  return db.getAllAsync<{ nombre: string; monto: number }>(
    `SELECT nombre, SUM(monto) AS monto
       FROM transacciones
      WHERE tipo = 'ingreso' AND moneda = ?
        AND substr(fecha, 1, 7) BETWEEN ? AND ?
      GROUP BY nombre
      ORDER BY monto DESC`,
    moneda,
    desde,
    mesActual
  );
}
