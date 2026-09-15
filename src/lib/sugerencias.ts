/**
 * Sugerencias derivadas de los números, no frases de galletita.
 *
 * Reglas del contenido:
 * - Cada sugerencia dice un número concreto sacado de los datos del usuario.
 * - Si no hay datos suficientes, se dice eso y no se inventa un consejo.
 * - Para gastos, primero recortar; subir ingresos va después. Con un sueldo
 *   fijo, "ganá más" no es una palanca que la persona pueda mover este mes.
 *
 * Funciones puras: entran números, sale texto. Testeables sin base ni pantalla.
 */
import { MesBarra } from '../db/estadisticas';
import { fmt } from './format';

export type Sugerencia = {
  tono: 'bien' | 'aviso' | 'neutro';
  titulo: string;
  detalle: string;
};

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
const prom = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

const reales = (d: MesBarra[]) => d.filter((m) => m.real);
const pasados = (d: MesBarra[]) => d.filter((m) => m.real && !m.actual);
const futuros = (d: MesBarra[]) => d.filter((m) => !m.real);
const conMovimiento = (d: MesBarra[]) => d.filter((m) => m.ingresos > 0 || m.egresos > 0);

/** Tablero principal: la foto completa. */
export function sugerenciasBalance(datos: MesBarra[], moneda = 'ARS'): Sugerencia[] {
  const out: Sugerencia[] = [];
  const hist = conMovimiento(pasados(datos));

  if (conMovimiento(reales(datos)).length === 0) {
    return [
      {
        tono: 'neutro',
        titulo: 'Todavía no hay con qué comparar',
        detalle:
          'Cargá tus ingresos y gastos de este mes. Con dos meses cargados empiezan a aparecer tendencias; con cuatro, la proyección se vuelve confiable.',
      },
    ];
  }

  // 1) Meses futuros que cierran en rojo.
  const enRojo = futuros(datos).filter((m) => m.egresos > m.ingresos);
  if (enRojo.length > 0) {
    const peor = enRojo.reduce((a, b) => (b.egresos - b.ingresos > a.egresos - a.ingresos ? b : a));
    out.push({
      tono: 'aviso',
      titulo: `${enRojo.length} de los próximos ${futuros(datos).length} meses cierran en rojo`,
      detalle: `El peor es ${mesLegible(peor.mes)}, con ${fmt(peor.egresos - peor.ingresos, moneda)} de diferencia. Está a tiempo de cambiarse: son gastos que todavía no ocurrieron.`,
    });
  }

  // 2) Tasa de ahorro del mes en curso.
  const actual = datos.find((m) => m.actual);
  if (actual && actual.ingresos > 0) {
    const tasa = pct(actual.ingresos - actual.egresos, actual.ingresos);
    if (tasa >= 20) {
      out.push({
        tono: 'bien',
        titulo: `Estás ahorrando el ${tasa}% de lo que entra`,
        detalle: `Son ${fmt(actual.ingresos - actual.egresos, moneda)} este mes. Apartalos apenas cobres, no a fin de mes: lo que queda a la vista se gasta.`,
      });
    } else if (tasa > 0) {
      out.push({
        tono: 'neutro',
        titulo: `Te queda el ${tasa}% de lo que entra`,
        detalle: `Un margen así se lo come cualquier imprevisto. Mirá el tablero de Gastos para ver de dónde podrías sacar unos puntos más.`,
      });
    }
  }

  // 3) El gasto del mes contra el promedio de los meses cargados.
  if (hist.length >= 2 && actual) {
    const promedio = prom(hist.map((m) => m.egresos));
    const desvio = pct(actual.egresos - promedio, promedio);
    if (desvio >= 15) {
      out.push({
        tono: 'aviso',
        titulo: `Este mes venís gastando ${desvio}% más que tu promedio`,
        detalle: `Tu promedio de los últimos ${hist.length} meses cargados es ${fmt(promedio, moneda)} y vas ${fmt(actual.egresos, moneda)}.`,
      });
    } else if (desvio <= -15) {
      out.push({
        tono: 'bien',
        titulo: `Este mes gastaste ${Math.abs(desvio)}% menos que tu promedio`,
        detalle: `Si no es porque quedaron cosas sin cargar, la diferencia son ${fmt(promedio - actual.egresos, moneda)} que podés apartar.`,
      });
    }
  }

  return out;
}

/** Tablero de gastos. `fijos` es lo comprometido por reglas recurrentes. */
export function sugerenciasGastos(
  datos: MesBarra[],
  fijosDelMes: number,
  moneda = 'ARS'
): Sugerencia[] {
  const out: Sugerencia[] = [];
  const actual = datos.find((m) => m.actual);
  const hist = conMovimiento(pasados(datos));

  if (!actual || conMovimiento(reales(datos)).length === 0) {
    return [
      {
        tono: 'neutro',
        titulo: 'Cargá tus gastos para ver de qué se trata',
        detalle:
          'Con un mes cargado ya podés ver en qué se te va la plata. Con tres, si eso está subiendo o bajando.',
      },
    ];
  }

  // 1) Cuánto de lo que gastás es realmente recortable.
  if (actual.egresos > 0) {
    const variable = Math.max(0, actual.egresos - fijosDelMes);
    const pctFijo = pct(fijosDelMes, actual.egresos);
    out.push({
      tono: pctFijo >= 75 ? 'aviso' : 'neutro',
      titulo: `${pctFijo}% de tus gastos son fijos`,
      detalle:
        pctFijo >= 75
          ? `Solo ${fmt(variable, moneda)} son variables, así que recortar sobre la marcha casi no mueve la aguja. Para bajar el total hay que tocar un gasto fijo: renegociar, cambiar de plan o dar de baja algo.`
          : `Tenés ${fmt(variable, moneda)} de gasto variable: ahí está el margen que podés mover este mes sin renegociar nada.`,
    });
  }

  // 2) El mes más caro de la ventana.
  const conGasto = datos.filter((m) => m.egresos > 0);
  if (conGasto.length >= 3) {
    const peor = conGasto.reduce((a, b) => (b.egresos > a.egresos ? b : a));
    if (!peor.actual) {
      out.push({
        tono: 'neutro',
        titulo: `Tu mes más caro es ${mesLegible(peor.mes)}`,
        detalle: `${fmt(peor.egresos, moneda)}. Si se repite todos los años, conviene empezar a apartar plata unos meses antes en vez de absorberlo de golpe.`,
      });
    }
  }

  // 3) Tendencia.
  if (hist.length >= 3) {
    const primeros = prom(hist.slice(0, Math.ceil(hist.length / 2)).map((m) => m.egresos));
    const ultimos = prom(hist.slice(Math.ceil(hist.length / 2)).map((m) => m.egresos));
    const cambio = pct(ultimos - primeros, primeros);
    if (cambio >= 10) {
      out.push({
        tono: 'aviso',
        titulo: `Tus gastos vienen subiendo ${cambio}%`,
        detalle: `Comparando la primera mitad de los meses cargados contra la segunda. Si es inflación, el sueldo tendría que estar subiendo parecido: fijate en el tablero de Ingresos.`,
      });
    }
  }

  return out;
}

/** Tablero de ingresos. `fuentes` es cuántos conceptos distintos aportan. */
export function sugerenciasIngresos(
  datos: MesBarra[],
  fuentes: { nombre: string; monto: number }[],
  moneda = 'ARS'
): Sugerencia[] {
  const out: Sugerencia[] = [];
  const hist = conMovimiento(pasados(datos));

  if (conMovimiento(reales(datos)).length === 0) {
    return [
      {
        tono: 'neutro',
        titulo: 'Cargá tus ingresos',
        detalle: 'Con el sueldo cargado como recurrente, la proyección de los próximos meses se arma sola.',
      },
    ];
  }

  // 1) Concentración: de dónde viene la plata.
  const total = fuentes.reduce((a, f) => a + f.monto, 0);
  if (total > 0 && fuentes.length > 0) {
    const principal = fuentes.reduce((a, b) => (b.monto > a.monto ? b : a));
    const share = pct(principal.monto, total);
    if (share >= 90) {
      out.push({
        tono: 'aviso',
        titulo: `El ${share}% de tus ingresos viene de una sola fuente`,
        detalle: `Todo depende de "${principal.nombre}". No es un problema hoy, pero es tu mayor riesgo: si eso se corta, se corta todo. Cualquier segundo ingreso, aunque sea chico, cambia esa foto.`,
      });
    } else {
      out.push({
        tono: 'bien',
        titulo: `Tenés ${fuentes.length} fuentes de ingreso`,
        detalle: `La principal es "${principal.nombre}" con el ${share}%. Estar repartido te da margen si una falla.`,
      });
    }
  }

  // 2) ¿Los ingresos siguen al costo de vida?
  if (hist.length >= 3) {
    const primeros = prom(hist.slice(0, Math.ceil(hist.length / 2)).map((m) => m.ingresos));
    const ultimos = prom(hist.slice(Math.ceil(hist.length / 2)).map((m) => m.ingresos));
    const cambio = pct(ultimos - primeros, primeros);
    if (cambio <= 0) {
      out.push({
        tono: 'aviso',
        titulo: 'Tus ingresos están planchados',
        detalle: `No subieron entre la primera y la segunda mitad de los meses cargados. Si tus gastos sí subieron, la diferencia te la está comiendo la inflación y el ajuste tiene que salir del gasto.`,
      });
    } else if (cambio >= 10) {
      out.push({
        tono: 'bien',
        titulo: `Tus ingresos subieron ${cambio}%`,
        detalle: `Comparando la primera mitad de los meses cargados contra la segunda. Si el aumento ya llegó, es el mejor momento para subir lo que ahorrás antes de acostumbrarte al nuevo número.`,
      });
    }
  }

  return out;
}

function mesLegible(mes: string): string {
  const nombres = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return nombres[Number(mes.slice(5, 7)) - 1];
}
