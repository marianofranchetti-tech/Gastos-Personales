/**
 * Calendario de movimientos: funciones puras sobre strings ISO, sin Date.
 *
 * Cada movimiento cae en el día de su vencimiento (o de su fecha, si no tiene
 * vencimiento). Es la fecha que importa para planificar: cuándo sale o entra
 * la plata, no cuándo se cargó.
 */
import { diaSemanaISO, finDeMesISO, sumarDiasISO } from './fechasRecurrentes';
import { lunesDe } from './periodo';

/**
 * Estado derivado de lo pagado y la fecha:
 * - pagado:    sin saldo.
 * - vencido:   con saldo y la fecha ya pasó (aunque tenga pagos parciales).
 * - parcial:   con algún pago y saldo, todavía en fecha.
 * - pendiente: sin pagos, todavía en fecha.
 */
export type EstadoVista = 'pagado' | 'parcial' | 'vencido' | 'pendiente';
export type FiltroEstado = 'todos' | EstadoVista;

export type MovCal = {
  id: number;
  nombre: string;
  monto: number;
  moneda: string;
  fecha: string;
  venc: string | null;
  estado: string;
  /** Suma de pagos. Si falta, se deduce de `estado` (todo o nada). */
  pagado?: number;
};

/** Medio centavo: los montos son REAL y una resta puede dejar 0,0000001. */
const CENTAVO = 0.005;

export const fechaMov = (t: Pick<MovCal, 'fecha' | 'venc'>) => t.venc ?? t.fecha;

export const pagadoDe = (t: Pick<MovCal, 'monto' | 'estado' | 'pagado'>) =>
  t.pagado ?? (t.estado === 'pagado' ? t.monto : 0);

export const saldoDe = (t: Pick<MovCal, 'monto' | 'estado' | 'pagado'>) => {
  const s = t.monto - pagadoDe(t);
  return s > CENTAVO ? s : 0;
};

export function estadoVista(t: MovCal, hoy: string): EstadoVista {
  if (saldoDe(t) === 0) return 'pagado';
  if (fechaMov(t) < hoy) return 'vencido';
  return pagadoDe(t) > CENTAVO ? 'parcial' : 'pendiente';
}

/**
 * Si un movimiento aparece bajo un filtro. Cada filtro muestra los que aportan
 * a su total, así lo que se ve y lo que se suma coinciden:
 * - Pendientes / Vencidos: los que tienen saldo, según su fecha.
 * - Pagados: los que tienen algo pagado, incluidos los parciales.
 * - Parciales: algo pagado y algo de saldo.
 */
export function enFiltro(t: MovCal, filtro: FiltroEstado, hoy: string): boolean {
  const pagado = pagadoDe(t) > CENTAVO;
  const saldo = saldoDe(t) > 0;
  switch (filtro) {
    case 'todos':
      return true;
    case 'pagado':
      return pagado;
    case 'parcial':
      return pagado && saldo;
    case 'pendiente':
      return saldo && fechaMov(t) >= hoy;
    case 'vencido':
      return saldo && fechaMov(t) < hoy;
  }
}

export type Semana = { desde: string; hasta: string; dias: string[] };

/** Semanas de lunes a domingo que tocan el mes ('YYYY-MM'). */
export function semanasDelMes(mes: string): Semana[] {
  const primero = `${mes}-01`;
  const ultimo = finDeMesISO(primero);
  const semanas: Semana[] = [];
  for (let l = lunesDe(primero); l <= ultimo; l = sumarDiasISO(l, 7)) {
    const dias = Array.from({ length: 7 }, (_, i) => sumarDiasISO(l, i));
    semanas.push({ desde: l, hasta: dias[6], dias });
  }
  return semanas;
}

export function sumarMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export type Totales = Record<EstadoVista, number> & { todos: number };

/**
 * Totales del mes. Pendientes y Vencidos suman SALDO; Pagados, lo efectivamente
 * pagado (parciales incluidos). Así Todos = Pendientes + Vencidos + Pagados.
 * Parciales es un corte aparte: el saldo que les falta a los pagados a medias.
 */
export function totales<T extends MovCal>(items: T[], hoy: string): Totales {
  const r: Totales = { pagado: 0, parcial: 0, vencido: 0, pendiente: 0, todos: 0 };
  for (const t of items) {
    const saldo = saldoDe(t);
    const pagado = t.monto - saldo;
    r.todos += t.monto;
    r.pagado += pagado;
    if (saldo > 0) r[fechaMov(t) < hoy ? 'vencido' : 'pendiente'] += saldo;
    if (saldo > 0 && pagado > CENTAVO) r.parcial += saldo;
  }
  return r;
}

/** Conceptos (por nombre) con su total, de mayor a menor. */
export function conceptos<T extends MovCal>(items: T[]): { nombre: string; total: number; cantidad: number }[] {
  const m = new Map<string, { nombre: string; total: number; cantidad: number }>();
  for (const t of items) {
    const c = m.get(t.nombre) ?? { nombre: t.nombre, total: 0, cantidad: 0 };
    c.total += t.monto;
    c.cantidad += 1;
    m.set(t.nombre, c);
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

export function filtrarMovs<T extends MovCal>(
  items: T[],
  { desde, hasta, estado, concepto, hoy }: { desde: string; hasta: string; estado: FiltroEstado; concepto: string | null; hoy: string }
): T[] {
  return items.filter((t) => {
    const f = fechaMov(t);
    if (f < desde || f > hasta) return false;
    if (concepto && t.nombre !== concepto) return false;
    return enFiltro(t, estado, hoy);
  });
}

export type Repetido = { tipo: string; nombre: string; mes: string; cantidad: number; total: number };

/**
 * Conceptos que aparecen más de una vez con el mismo nombre en un mismo mes
 * (por fecha de vencimiento): típicamente una deuda cargada en partes
 * ("EPEC · 2"). Solo lectura: no decide si son duplicados ni los toca.
 *
 * Las ocurrencias de reglas semanales o diarias no cuentan: que se repitan en
 * el mes es justamente lo que tienen que hacer.
 */
export function conceptosRepetidos<T extends MovCal & { tipo: string; periodo?: string | null }>(
  items: T[]
): Repetido[] {
  const m = new Map<string, Repetido>();
  for (const t of items) {
    if (t.periodo === 'semanal' || t.periodo === 'diario') continue;
    const mes = fechaMov(t).slice(0, 7);
    const clave = `${t.tipo}|${t.nombre}|${mes}`;
    const r = m.get(clave) ?? { tipo: t.tipo, nombre: t.nombre, mes, cantidad: 0, total: 0 };
    r.cantidad += 1;
    r.total += t.monto;
    m.set(clave, r);
  }
  return [...m.values()]
    .filter((r) => r.cantidad > 1)
    .sort((a, b) => b.mes.localeCompare(a.mes) || a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre));
}

/** Agrupa por día, ordenado: primero lo que tiene saldo, después por monto. */
export function porDia<T extends MovCal>(items: T[]): Record<string, T[]> {
  const r: Record<string, T[]> = {};
  for (const t of items) (r[fechaMov(t)] ??= []).push(t);
  const saldado = (t: T) => Number(saldoDe(t) === 0);
  for (const k of Object.keys(r)) {
    r[k].sort((a, b) => saldado(a) - saldado(b) || b.monto - a.monto);
  }
  return r;
}

const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-10-03' -> 'vie 3 oct'. */
export function diaLargo(iso: string): string {
  return `${DIA[diaSemanaISO(iso)]} ${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]}`;
}

/** '2026-10-03' -> '3 oct'. */
export function diaMesCorto(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]}`;
}
