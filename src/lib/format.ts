import { Periodo } from './categorias';

export const hoy = new Date();
export const ym = (d: Date) => d.toISOString().slice(0, 7);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const mesActual = ym(hoy);

export const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Parseo seguro: null si el string no es una fecha AAAA-MM-DD válida
export function fechaISO(s?: string | null): Date | null {
  if (!s || !RE_FECHA.test(s)) return null;
  const d = new Date(`${s}T12:00`);
  return isNaN(d.getTime()) ? null : d;
}

const SIMBOLOS: Record<string, string> = { ARS: '$', USD: 'US$', EUR: '€' };

export function fmt(n: number, moneda: string = 'ARS') {
  const simbolo = SIMBOLOS[moneda] ?? moneda + ' ';
  return simbolo + Math.round(n).toLocaleString('es-AR');
}

const DIAS_POR_PERIODO: Record<Periodo, number> = {
  diario: 1,
  semanal: 7,
  mensual: 30,
  anual: 365,
};

export function proxVenc(t: { rec: boolean; venc?: string | null; fecha: string; periodo?: Periodo }) {
  if (!t.rec || !t.periodo) return null;
  const base = fechaISO(t.venc) ?? fechaISO(t.fecha);
  if (!base) return null;
  const nx = new Date(base);
  while (nx <= hoy) {
    if (t.periodo === 'mensual') nx.setMonth(nx.getMonth() + 1);
    else if (t.periodo === 'anual') nx.setFullYear(nx.getFullYear() + 1);
    else nx.setDate(nx.getDate() + DIAS_POR_PERIODO[t.periodo]);
  }
  return nx;
}
