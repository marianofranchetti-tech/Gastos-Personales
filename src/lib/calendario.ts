/**
 * Calendario de movimientos: funciones puras sobre strings ISO, sin Date.
 *
 * Cada movimiento cae en el día de su vencimiento (o de su fecha, si no tiene
 * vencimiento). Es la fecha que importa para planificar: cuándo sale o entra
 * la plata, no cuándo se cargó.
 */
import { diaSemanaISO, finDeMesISO, sumarDiasISO } from './fechasRecurrentes';
import { lunesDe } from './periodo';

export type EstadoVista = 'pagado' | 'vencido' | 'pendiente';
export type FiltroEstado = 'todos' | EstadoVista;

export type MovCal = {
  id: number;
  nombre: string;
  monto: number;
  moneda: string;
  fecha: string;
  venc: string | null;
  estado: string;
};

export const fechaMov = (t: Pick<MovCal, 'fecha' | 'venc'>) => t.venc ?? t.fecha;

export function estadoVista(t: MovCal, hoy: string): EstadoVista {
  if (t.estado === 'pagado') return 'pagado';
  return fechaMov(t) < hoy ? 'vencido' : 'pendiente';
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

export function totales<T extends MovCal>(items: T[], hoy: string): Totales {
  const r: Totales = { pagado: 0, vencido: 0, pendiente: 0, todos: 0 };
  for (const t of items) {
    r[estadoVista(t, hoy)] += t.monto;
    r.todos += t.monto;
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
    if (estado !== 'todos' && estadoVista(t, hoy) !== estado) return false;
    return true;
  });
}

/** Agrupa por día, ordenado: primero lo pendiente, después por monto. */
export function porDia<T extends MovCal>(items: T[]): Record<string, T[]> {
  const r: Record<string, T[]> = {};
  for (const t of items) (r[fechaMov(t)] ??= []).push(t);
  for (const k of Object.keys(r)) {
    r[k].sort((a, b) => Number(a.estado === 'pagado') - Number(b.estado === 'pagado') || b.monto - a.monto);
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
