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

/** '2026-10' -> 'oct 2026'. Para los encabezados de la proyección. */
export function mesLargo(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
}

/** '2026-10-05' -> '5 oct'. Para la fecha de vencimiento de una fila. */
export function diaCorto(iso: string): string {
  const d = fechaISO(iso);
  return d ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : iso;
}
