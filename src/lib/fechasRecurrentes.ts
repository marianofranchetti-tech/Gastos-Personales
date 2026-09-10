/**
 * Cálculo puro de fechas de vencimiento para reglas recurrentes.
 *
 * Sin I/O, sin DB y sin "ahora" implícito: toda función que necesite una fecha
 * de referencia la recibe por parámetro. Eso las hace testeables y evita el
 * bug clásico de mezclar UTC con la hora local del dispositivo.
 *
 * Convención: todas las fechas son strings ISO `YYYY-MM-DD` en hora LOCAL.
 * Nunca usar `Date.prototype.toISOString()` sobre una fecha construida a
 * medianoche local: en Argentina (UTC-3) devuelve el día anterior.
 */
import { Periodo } from './categorias';

/** Ancla de repetición de una regla. Solo lo necesario para calcular fechas. */
export type AnclaRegla = {
  id: number;
  periodo: Periodo;
  dia_venc: number | null;   // 1-31, requerido en 'mensual' y 'anual'
  dia_semana: number | null; // 0 (domingo) - 6 (sábado), requerido en 'semanal'
  mes_anio: number | null;   // 1-12, requerido en 'anual'
  fecha_inicio: string;
  fecha_fin: string | null;
};

function partesISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function aISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Compara dos fechas ISO como strings: el formato YYYY-MM-DD ordena lexicográficamente. */
export function compararISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Último día del mes `m` (1-12) del año `y`, contemplando bisiestos. */
export function ultimoDiaDelMes(y: number, m: number): number {
  // Día 0 del mes siguiente = último día del mes actual (Date usa mes 0-indexado).
  return new Date(y, m, 0).getDate();
}

/** Recorta el día al último real del mes: 31 en febrero -> 28 o 29. */
function recortarDia(y: number, m: number, dia: number): number {
  return Math.min(dia, ultimoDiaDelMes(y, m));
}

function sumarMeses(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/** "Hoy" según el reloj local del dispositivo, en formato YYYY-MM-DD. */
export function hoyISO(): string {
  const n = new Date();
  return aISO(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** Suma (o resta, con `dias` negativo) días calendario a una fecha ISO. */
export function sumarDiasISO(iso: string, dias: number): string {
  const { y, m, d } = partesISO(iso);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return aISO(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/** Suma meses a una fecha ISO recortando el día al último válido del mes destino. */
export function sumarMesesISO(iso: string, meses: number): string {
  const { y, m, d } = partesISO(iso);
  const dest = sumarMeses(y, m, meses);
  return aISO(dest.y, dest.m, recortarDia(dest.y, dest.m, d));
}

/** Último día del mes al que pertenece la fecha, en ISO. */
export function finDeMesISO(iso: string): string {
  const { y, m } = partesISO(iso);
  return aISO(y, m, ultimoDiaDelMes(y, m));
}

/** Día de la semana de una fecha ISO: 0 = domingo ... 6 = sábado. */
export function diaSemanaISO(iso: string): number {
  const { y, m, d } = partesISO(iso);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Próximo vencimiento ESTRICTAMENTE posterior a `desdeISO`.
 * Nunca devuelve una fecha menor o igual a la referencia, así que se puede
 * llamar en bucle pasándole su propio resultado sin riesgo de loop infinito.
 */
export function proximaFecha(regla: AnclaRegla, desdeISO: string): string {
  switch (regla.periodo) {
    case 'diario':
      return sumarDiasISO(desdeISO, 1);

    case 'semanal': {
      if (regla.dia_semana == null) {
        throw new Error(`Regla ${regla.id}: periodo semanal requiere dia_semana`);
      }
      let salto = (regla.dia_semana - diaSemanaISO(desdeISO) + 7) % 7;
      if (salto === 0) salto = 7; // estrictamente posterior
      return sumarDiasISO(desdeISO, salto);
    }

    case 'mensual': {
      if (regla.dia_venc == null) {
        throw new Error(`Regla ${regla.id}: periodo mensual requiere dia_venc`);
      }
      const { y, m } = partesISO(desdeISO);
      let candidata = aISO(y, m, recortarDia(y, m, regla.dia_venc));
      if (compararISO(candidata, desdeISO) <= 0) {
        const sig = sumarMeses(y, m, 1);
        candidata = aISO(sig.y, sig.m, recortarDia(sig.y, sig.m, regla.dia_venc));
      }
      return candidata;
    }

    case 'anual': {
      if (regla.dia_venc == null || regla.mes_anio == null) {
        throw new Error(`Regla ${regla.id}: periodo anual requiere dia_venc y mes_anio`);
      }
      const { y } = partesISO(desdeISO);
      const mes = regla.mes_anio;
      let candidata = aISO(y, mes, recortarDia(y, mes, regla.dia_venc));
      if (compararISO(candidata, desdeISO) <= 0) {
        candidata = aISO(y + 1, mes, recortarDia(y + 1, mes, regla.dia_venc));
      }
      return candidata;
    }

    default: {
      const _exhaustivo: never = regla.periodo;
      throw new Error(`Periodo desconocido: ${_exhaustivo}`);
    }
  }
}

/**
 * Ocurrencias de una regla dentro de (desde, hasta], en orden cronológico.
 * `desde` es exclusivo: para incluir el propio día pasá `sumarDiasISO(hoy, -1)`.
 * Respeta fecha_inicio y fecha_fin de la regla.
 */
export function ocurrenciasEntre(
  regla: AnclaRegla,
  desdeISO: string,
  hastaISO: string,
  maxIteraciones = 2000
): string[] {
  const out: string[] = [];
  // Nunca generar antes del inicio de la regla.
  let cursor = compararISO(desdeISO, regla.fecha_inicio) < 0
    ? sumarDiasISO(regla.fecha_inicio, -1)
    : desdeISO;

  for (let i = 0; i < maxIteraciones; i++) {
    const siguiente = proximaFecha(regla, cursor);
    if (compararISO(siguiente, hastaISO) > 0) break;
    if (regla.fecha_fin != null && compararISO(siguiente, regla.fecha_fin) > 0) break;
    out.push(siguiente);
    cursor = siguiente;
  }
  return out;
}
