/**
 * Salud financiera: cuatro indicadores con semáforo y un puntaje 0-100.
 *
 * Por qué estos cuatro y no otros: cada uno responde una pregunta distinta y
 * se calcula con lo que la app ya registra, sin pedirle nada nuevo al usuario.
 *
 * 1. ¿Gasto menos de lo que entra?        gastos / ingresos, últimos 3 meses cerrados
 * 2. ¿Lo que cobro cubre lo que debo?     por cobrar / por pagar, en la ventana
 * 3. ¿Cuánto de mi ingreso ya está atado? gastos fijos del mes / ingreso promedio
 * 4. ¿Es un mes malo o un patrón?         meses en positivo de los últimos 6
 *
 * Se mira sobre meses CERRADOS a propósito: el mes en curso a mitad de camino
 * siempre parece peor o mejor de lo que va a terminar.
 *
 * Funciones puras. Un indicador sin datos para calcularse no se inventa: se
 * omite y no cuenta para el puntaje.
 */
import type { MesBarra } from '../db/estadisticas';

export type Nivel = 'bien' | 'aviso' | 'mal';

export type Indicador = {
  id: 'gasto' | 'cobertura' | 'fijos' | 'racha';
  nombre: string;
  valor: string;
  /** 0 a 100, para la barra. */
  puntaje: number;
  nivel: Nivel;
  detalle: string;
};

export type Salud = {
  puntaje: number;
  nivel: Nivel;
  titulo: string;
  indicadores: Indicador[];
  /** Resultado (ingresos − gastos) de los últimos meses cerrados, para el mini gráfico. */
  meses: { mes: string; resultado: number }[];
};

/** 100 en `bueno`, 0 en `malo`, lineal entre medio. Sirve en ambos sentidos. */
const escala = (v: number, bueno: number, malo: number) =>
  Math.round(Math.max(0, Math.min(1, (v - malo) / (bueno - malo))) * 100);

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function saludFinanciera({
  datos,
  porPagar,
  porCobrar,
  fijosDelMes,
}: {
  datos: MesBarra[];
  porPagar: number;
  porCobrar: number;
  fijosDelMes: number;
}): Salud | null {
  const cerrados = datos.filter((m) => m.real && !m.actual);
  const conMov = cerrados.filter((m) => m.ingresos > 0 || m.egresos > 0);
  if (conMov.length === 0 && porPagar === 0 && porCobrar === 0) return null;

  const ult3 = conMov.slice(-3);
  const ing3 = ult3.reduce((a, m) => a + m.ingresos, 0);
  const gas3 = ult3.reduce((a, m) => a + m.egresos, 0);
  const ingProm = ult3.length ? ing3 / ult3.length : 0;

  const ind: Indicador[] = [];

  if (ult3.length > 0) {
    if (ing3 > 0) {
      const r = gas3 / ing3;
      ind.push({
        id: 'gasto',
        nombre: 'Gasto sobre ingreso',
        valor: pct(r),
        puntaje: escala(r, 0.7, 1.3),
        nivel: r <= 0.8 ? 'bien' : r <= 1 ? 'aviso' : 'mal',
        detalle:
          r <= 1
            ? `En los últimos ${ult3.length} meses te quedó el ${pct(1 - r)} de lo que entró. Sano es 20% o más.`
            : `En los últimos ${ult3.length} meses gastaste ${pct(r - 1)} más de lo que entró.`,
      });
    } else {
      ind.push({
        id: 'gasto',
        nombre: 'Gasto sobre ingreso',
        valor: 'sin ingresos',
        puntaje: 0,
        nivel: 'mal',
        detalle: `Hubo gastos y ningún ingreso registrado en los últimos ${ult3.length} meses.`,
      });
    }
  }

  if (porPagar > 0 || porCobrar > 0) {
    const c = porPagar > 0 ? porCobrar / porPagar : Infinity;
    ind.push({
      id: 'cobertura',
      nombre: 'Cobertura de pendientes',
      valor: porPagar > 0 ? `${c.toFixed(1).replace('.', ',')}x` : 'nada por pagar',
      puntaje: porPagar > 0 ? escala(c, 1.2, 0.5) : 100,
      nivel: c >= 1.1 ? 'bien' : c >= 1 ? 'aviso' : 'mal',
      detalle:
        porPagar === 0
          ? 'No tenés vencimientos pendientes en la ventana.'
          : c >= 1
            ? 'Lo que tenés por cobrar alcanza para lo que tenés por pagar.'
            : `Lo que tenés por cobrar cubre solo el ${pct(c)} de lo que debés pagar.`,
    });
  }

  if (ingProm > 0 && fijosDelMes > 0) {
    const f = fijosDelMes / ingProm;
    ind.push({
      id: 'fijos',
      nombre: 'Gastos fijos',
      valor: pct(f),
      puntaje: escala(f, 0.5, 0.9),
      nivel: f <= 0.5 ? 'bien' : f <= 0.7 ? 'aviso' : 'mal',
      detalle: `De tu ingreso promedio, ${pct(f)} ya está comprometido antes de empezar el mes. Hasta 50% deja margen.`,
    });
  }

  const ult6 = conMov.slice(-6);
  if (ult6.length >= 2) {
    const pos = ult6.filter((m) => m.ingresos >= m.egresos).length;
    const r = pos / ult6.length;
    ind.push({
      id: 'racha',
      nombre: 'Meses en positivo',
      valor: `${pos} de ${ult6.length}`,
      puntaje: Math.round(r * 100),
      nivel: r >= 0.8 ? 'bien' : r >= 0.5 ? 'aviso' : 'mal',
      detalle:
        pos === ult6.length
          ? 'Todos los meses cerraron con ingreso mayor al gasto.'
          : `${ult6.length - pos} de los últimos ${ult6.length} meses cerraron en rojo.`,
    });
  }

  if (ind.length === 0) return null;

  const puntaje = Math.round(ind.reduce((a, i) => a + i.puntaje, 0) / ind.length);
  const nivel: Nivel = puntaje >= 70 ? 'bien' : puntaje >= 40 ? 'aviso' : 'mal';
  return {
    puntaje,
    nivel,
    titulo: nivel === 'bien' ? 'Sólida' : nivel === 'aviso' ? 'Ajustada' : 'Frágil',
    indicadores: ind,
    meses: ult6.map((m) => ({ mes: m.mes, resultado: m.ingresos - m.egresos })),
  };
}
