// Fechas en hora LOCAL del dispositivo. No usar toISOString(): convierte a UTC
// y en Argentina (UTC-3) desde las 21:00 devuelve el día (o el mes) siguiente.
const dos = (n: number) => String(n).padStart(2, '0');

/** Fecha y hora actuales. Función para que no quede congelada al cargar el módulo. */
export const hoy = () => new Date();
export const ym = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}`;
export const iso = (d: Date) => `${ym(d)}-${dos(d.getDate())}`;
/** Mes en curso como 'AAAA-MM', calculado en cada llamada. */
export const mesActual = () => ym(hoy());

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

/** Acepta DD/MM/AAAA (o D/M/AAAA, con / - o .) y AAAA-MM-DD. Devuelve ISO o null. */
export function aISO(txt: string): string | null {
  const t = txt.trim();
  let iso: string | null = null;
  if (RE_FECHA.test(t)) iso = t;
  else {
    const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (!iso) return null;
  const [a, mes, dia] = iso.split('-').map(Number);
  const f = new Date(a, mes - 1, dia);
  return f.getFullYear() === a && f.getMonth() === mes - 1 && f.getDate() === dia ? iso : null;
}
