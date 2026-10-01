/**
 * Período que filtran los gráficos: año, mes, semana o día, más una fecha
 * "ancla" que dice cuál (el año 2026, el mes de octubre, la semana del 28/9...).
 *
 * Funciones puras sobre strings ISO (YYYY-MM-DD): nada de Date en UTC, que en
 * Argentina corre el día después de las 21 hs.
 */
import type { MesProyectado } from '../db/proyeccion';
import {
  diaSemanaISO,
  finDeMesISO,
  sumarDiasISO,
  sumarMesesISO,
} from './fechasRecurrentes';

export type Granularidad = 'anio' | 'mes' | 'semana' | 'dia';

export const GRANULARIDADES: { id: Granularidad; nombre: string }[] = [
  { id: 'anio', nombre: 'Año' },
  { id: 'mes', nombre: 'Mes' },
  { id: 'semana', nombre: 'Semana' },
  { id: 'dia', nombre: 'Día' },
];

/** Columnas en vista Semana: la elegida y las doce anteriores. */
export const COLUMNAS = 13;
/** Vista Día: el elegido al centro y seis días por lado, para ver lo que vence. */
export const DIAS_LADO = 6;

export type Rango = { desde: string; hasta: string }; // ambos inclusive

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DIA_CORTO = ['dom','lun','mar','mié','jue','vie','sáb'];
const DIA_LETRA = ['D','L','M','X','J','V','S'];

const num = (iso: string, a: number, b: number) => Number(iso.slice(a, b));
const diaMes = (iso: string) => `${num(iso, 8, 10)} ${MES_CORTO[num(iso, 5, 7) - 1].toLowerCase()}`;

/** Lunes de la semana de la fecha (semana de lunes a domingo). */
export function lunesDe(iso: string): string {
  return sumarDiasISO(iso, -((diaSemanaISO(iso) + 6) % 7));
}

export function rangoPeriodo(g: Granularidad, ancla: string): Rango {
  switch (g) {
    case 'anio':
      return { desde: `${ancla.slice(0, 4)}-01-01`, hasta: `${ancla.slice(0, 4)}-12-31` };
    case 'mes':
      return { desde: `${ancla.slice(0, 7)}-01`, hasta: finDeMesISO(ancla) };
    case 'semana': {
      const l = lunesDe(ancla);
      return { desde: l, hasta: sumarDiasISO(l, 6) };
    }
    case 'dia':
      return { desde: ancla, hasta: ancla };
  }
}

/** Corre la ancla `delta` períodos (negativo = hacia atrás). */
export function moverAncla(g: Granularidad, ancla: string, delta: number): string {
  switch (g) {
    case 'anio':
      return sumarMesesISO(ancla, 12 * delta);
    case 'mes':
      return sumarMesesISO(ancla, delta);
    case 'semana':
      return sumarDiasISO(ancla, 7 * delta);
    case 'dia':
      return sumarDiasISO(ancla, delta);
  }
}

/** "2026", "octubre 2026", "28 sep – 4 oct", "Hoy" / "jue 1 oct". */
export function etiquetaPeriodo(g: Granularidad, ancla: string, hoy: string): string {
  switch (g) {
    case 'anio':
      return ancla.slice(0, 4);
    case 'mes':
      return `${MESES[num(ancla, 5, 7) - 1]} ${ancla.slice(0, 4)}`;
    case 'semana': {
      const r = rangoPeriodo('semana', ancla);
      const actual = r.desde <= hoy && hoy <= r.hasta;
      return actual ? 'Esta semana' : `${diaMes(r.desde)} – ${diaMes(r.hasta)}`;
    }
    case 'dia':
      if (ancla === hoy) return 'Hoy';
      if (ancla === sumarDiasISO(hoy, -1)) return 'Ayer';
      return `${DIA_CORTO[diaSemanaISO(ancla)]} ${diaMes(ancla)}`;
  }
}

// ---------------------------------------------------------------------------
// Serie de barras

export type Mov = {
  tipo: 'gasto' | 'ingreso';
  monto: number;
  moneda: string;
  fecha: string;
  estado?: string;
  categoria_id?: string;
};

export type Barra = {
  clave: string;
  etiqueta: string;
  /** Segunda línea opcional: el año en enero, la letra del día. */
  sub?: string;
  ingresos: number;
  egresos: number;
  /** false = proyección o vencimiento a futuro, todavía no ocurrió. */
  real: boolean;
  /** Contiene a hoy. */
  actual: boolean;
  /** Contiene a la ancla: el período que se está mirando. */
  elegido: boolean;
  /** Si viene, decide si la etiqueta se ve (vista Mes: 1, 5, 10, 15...). */
  marca?: boolean;
  /** Nombre completo para el detalle al tocar ("vie 3 oct", "28 sep – 4 oct"). */
  titulo?: string;
};

type Cubo = {
  clave: string;
  desde: string;
  hasta: string;
  etiqueta: string;
  sub?: string;
  esMes: boolean;
  marca?: boolean;
  titulo?: string;
};

function cubosMes(meses: string[]): Cubo[] {
  return meses.map((mes, i) => ({
    clave: mes,
    desde: `${mes}-01`,
    hasta: finDeMesISO(`${mes}-01`),
    etiqueta: MES_CORTO[num(mes, 5, 7) - 1],
    sub: i === 0 || mes.endsWith('-01') ? `'${mes.slice(2, 4)}` : undefined,
    esMes: true,
  }));
}

function cubos(g: Granularidad, ancla: string): Cubo[] {
  if (g === 'anio') {
    const y = ancla.slice(0, 4);
    return cubosMes(Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)).map(
      (c) => ({ ...c, sub: undefined })
    );
  }
  if (g === 'mes') {
    // Un día por columna: el mes elegido por dentro. La comparación entre
    // meses ya la da la vista Año.
    const primero = `${ancla.slice(0, 7)}-01`;
    const dias = num(finDeMesISO(primero), 8, 10);
    return Array.from({ length: dias }, (_, i) => {
      const d = sumarDiasISO(primero, i);
      const n = i + 1;
      return {
        clave: d,
        desde: d,
        hasta: d,
        etiqueta: String(n),
        sub: DIA_LETRA[diaSemanaISO(d)],
        esMes: false,
        marca: n === 1 || n % 5 === 0,
        titulo: `${DIA_CORTO[diaSemanaISO(d)]} ${diaMes(d)}`,
      };
    });
  }
  if (g === 'semana') {
    const ultimo = lunesDe(ancla);
    return Array.from({ length: COLUMNAS }, (_, i) => {
      const desde = sumarDiasISO(ultimo, -7 * (COLUMNAS - 1 - i));
      return {
        clave: desde,
        desde,
        hasta: sumarDiasISO(desde, 6),
        etiqueta: `${num(desde, 8, 10)}/${num(desde, 5, 7)}`,
        esMes: false,
        titulo: `${diaMes(desde)} – ${diaMes(sumarDiasISO(desde, 6))}`,
      };
    });
  }
  return Array.from({ length: 2 * DIAS_LADO + 1 }, (_, i) => {
    const d = sumarDiasISO(ancla, i - DIAS_LADO);
    return {
      clave: d,
      desde: d,
      hasta: d,
      etiqueta: String(num(d, 8, 10)),
      sub: DIA_LETRA[diaSemanaISO(d)],
      esMes: false,
      titulo: `${DIA_CORTO[diaSemanaISO(d)]} ${diaMes(d)}`,
    };
  });
}

/**
 * Ingresos y gastos por columna.
 *
 * Misma regla que el gráfico de 9 meses de antes, para que los números no
 * cambien según la vista:
 * - Año (columnas = meses): hasta el mes actual inclusive, todo lo registrado,
 *   pagado o no (un vencimiento impago igual es plata que se debe). Meses
 *   posteriores: la proyección de las reglas recurrentes.
 * - Mes (columnas = días del mes), Semana y Día: lo registrado. Los días
 *   futuros solo tienen los vencimientos cargados, y se dibujan como no-reales.
 */
export function serieBarras({
  g,
  ancla,
  hoy,
  movs,
  proyeccion = [],
  moneda = 'ARS',
}: {
  g: Granularidad;
  ancla: string;
  hoy: string;
  movs: Mov[];
  proyeccion?: MesProyectado[];
  moneda?: string;
}): Barra[] {
  const cs = cubos(g, ancla);
  const mesHoy = hoy.slice(0, 7);
  const proy = Object.fromEntries(proyeccion.map((m) => [m.mes, m]));
  const elegido = rangoPeriodo(g, ancla);

  const acc = cs.map(() => ({ ingresos: 0, egresos: 0 }));
  const primero = cs[0].desde;
  const ultimo = cs[cs.length - 1].hasta;
  for (const t of movs) {
    if (t.moneda !== moneda || t.fecha < primero || t.fecha > ultimo) continue;
    const i = cs.findIndex((c) => c.desde <= t.fecha && t.fecha <= c.hasta);
    if (i < 0) continue;
    if (cs[i].esMes && cs[i].clave > mesHoy) continue; // eso lo pone la proyección
    if (t.tipo === 'ingreso') acc[i].ingresos += t.monto;
    else acc[i].egresos += t.monto;
  }

  return cs.map((c, i) => {
    let { ingresos, egresos } = acc[i];
    if (c.esMes && c.clave > mesHoy) {
      ingresos = proy[c.clave]?.ingresos ?? 0;
      egresos = proy[c.clave]?.egresos ?? 0;
    }
    return {
      clave: c.clave,
      etiqueta: c.etiqueta,
      sub: c.sub,
      ingresos,
      egresos,
      real: c.esMes ? c.clave <= mesHoy : c.desde <= hoy,
      actual: c.desde <= hoy && hoy <= c.hasta,
      elegido: g !== 'anio' && g !== 'mes' && c.desde <= elegido.desde && elegido.hasta <= c.hasta,
      marca: c.marca,
      titulo: c.titulo,
    };
  });
}

// ---------------------------------------------------------------------------
// Gastos por categoría

export type TotalCategoria = { id: string; monto: number; porcentaje: number };

/**
 * Gasto PAGADO por categoría dentro del rango, de mayor a menor. Lo pendiente
 * se devuelve aparte: es plata que se debe, no plata que se fue.
 */
export function gastosPorCategoria(
  movs: Mov[],
  r: Rango,
  moneda = 'ARS'
): { categorias: TotalCategoria[]; total: number; pendiente: number } {
  const m: Record<string, number> = {};
  let total = 0;
  let pendiente = 0;
  for (const t of movs) {
    if (t.tipo !== 'gasto' || t.moneda !== moneda || t.fecha < r.desde || t.fecha > r.hasta) continue;
    if (t.estado !== 'pagado') {
      pendiente += t.monto;
      continue;
    }
    const id = t.categoria_id ?? 'otros';
    m[id] = (m[id] ?? 0) + t.monto;
    total += t.monto;
  }
  const categorias = Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([id, monto]) => ({ id, monto, porcentaje: total > 0 ? (monto / total) * 100 : 0 }));
  return { categorias, total, pendiente };
}
