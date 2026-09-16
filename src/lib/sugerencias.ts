/**
 * Sugerencias derivadas de los números, no frases de galletita.
 *
 * Reglas del contenido:
 * - Cada sugerencia dice un número concreto sacado de los datos del usuario.
 * - La mayoría tiene que poder dispararse con UN SOLO mes cargado. La versión
 *   anterior exigía dos o tres meses de historia para casi todo, así que a un
 *   usuario nuevo el panel le quedaba mudo y parecía que no se actualizaba.
 *   Las reglas de tendencia, que sí necesitan historia, van al final y son
 *   agregado, no la base.
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

/** Lo que las sugerencias necesitan saber además de la serie de meses. */
export type Contexto = {
  datos: MesBarra[];
  moneda?: string;
  /** Gasto del mes comprometido por reglas fijas. */
  fijosDelMes?: number;
  /** Total pendiente de pago dentro de la ventana. */
  porPagar?: number;
  /** Total pendiente de cobro dentro de la ventana. */
  porCobrar?: number;
  /** Categorías del mes, de mayor a menor: [id, nombre, monto]. */
  porCategoria?: { nombre: string; monto: number }[];
  /** Conceptos de ingreso y cuánto aporta cada uno. */
  fuentes?: { nombre: string; monto: number }[];
};

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
const prom = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

const pasados = (d: MesBarra[]) => d.filter((m) => m.real && !m.actual);
const futuros = (d: MesBarra[]) => d.filter((m) => !m.real);
const conMovimiento = (d: MesBarra[]) => d.filter((m) => m.ingresos > 0 || m.egresos > 0);

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const mesLegible = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];

/** Compara mitades de la historia cargada. null si no alcanza para comparar. */
function tendencia(meses: MesBarra[], campo: 'ingresos' | 'egresos'): number | null {
  const hist = conMovimiento(meses);
  if (hist.length < 3) return null;
  const corte = Math.ceil(hist.length / 2);
  const a = prom(hist.slice(0, corte).map((m) => m[campo]));
  const b = prom(hist.slice(corte).map((m) => m[campo]));
  return a > 0 ? pct(b - a, a) : null;
}

// ---------------------------------------------------------------------------

/** Tablero principal. */
export function sugerenciasBalance(ctx: Contexto): Sugerencia[] {
  const { datos, moneda = 'ARS', porPagar = 0, porCobrar = 0 } = ctx;
  const out: Sugerencia[] = [];
  const actual = datos.find((m) => m.actual);

  if (!actual || (actual.ingresos === 0 && actual.egresos === 0)) {
    return [
      {
        tono: 'neutro',
        titulo: 'Empezá cargando este mes',
        detalle:
          'Con tu sueldo y tus gastos fijos cargados, la app ya te dice cómo cierra el mes y cómo vienen los próximos. Las tendencias aparecen solas a partir del segundo mes.',
      },
    ];
  }

  // 1) Qué proporción de lo que entra se está yendo. Un solo mes alcanza.
  //
  // OJO: esto cuenta TODO lo registrado del mes, pagado o no, mientras que la
  // tarjeta de balance de arriba cuenta solo lo que ya se movió. Las dos son
  // ciertas y pueden dar distinto; por eso el texto dice sobre qué se calcula.
  if (actual.ingresos > 0) {
    const consumido = pct(actual.egresos, actual.ingresos);
    const sobra = actual.ingresos - actual.egresos;
    if (consumido <= 80) {
      out.push({
        tono: 'bien',
        titulo: `Se te va el ${consumido}% de lo que entra`,
        detalle: `Contando todo lo del mes, pagado o no, te quedan ${fmt(sobra, moneda)}. Apartalos apenas cobres, no a fin de mes: lo que queda a la vista se gasta.`,
      });
    } else if (consumido <= 100) {
      out.push({
        tono: 'neutro',
        titulo: `Se te va el ${consumido}% de lo que entra`,
        detalle: `Contando todo lo del mes, pagado o no, te quedan ${fmt(sobra, moneda)}: un margen que se lo come cualquier imprevisto. Mirá el tablero de Gastos para ver de dónde sacar unos puntos.`,
      });
    } else {
      out.push({
        tono: 'aviso',
        titulo: `Estás gastando el ${consumido}% de lo que entra`,
        detalle: `Son ${fmt(-sobra, moneda)} de más, contando también lo que todavía no pagaste. La salida corta es recortar gasto: subir el ingreso rara vez depende de vos este mes.`,
      });
    }
  } else if (actual.egresos > 0) {
    out.push({
      tono: 'aviso',
      titulo: 'Cargaste gastos pero ningún ingreso',
      detalle: `Llevás ${fmt(actual.egresos, moneda)} este mes y nada del otro lado. Sin el ingreso cargado, el balance y la proyección no significan nada.`,
    });
  }

  // 2) Lo que falta pagar contra lo que falta cobrar. Tampoco necesita historia.
  if (porPagar > 0) {
    const alcanza = porCobrar >= porPagar;
    out.push({
      tono: alcanza ? 'bien' : 'aviso',
      titulo: `Te quedan ${fmt(porPagar, moneda)} por pagar`,
      detalle: alcanza
        ? `Y ${fmt(porCobrar, moneda)} por cobrar en el mismo plazo: alcanza. Ojo con el orden de las fechas, que el dinero esté no significa que esté a tiempo.`
        : porCobrar > 0
          ? `Contra ${fmt(porCobrar, moneda)} por cobrar: faltan ${fmt(porPagar - porCobrar, moneda)}. O sale de lo que ya tenés, o hay que correr algún vencimiento.`
          : `Y no hay nada por cobrar en ese plazo. Tiene que salir de lo que ya tenés.`,
    });
  }

  // 3) Meses futuros que cierran en rojo.
  const enRojo = futuros(datos).filter((m) => m.egresos > m.ingresos);
  if (enRojo.length > 0) {
    const peor = enRojo.reduce((a, b) => (b.egresos - b.ingresos > a.egresos - a.ingresos ? b : a));
    out.push({
      tono: 'aviso',
      titulo: `${enRojo.length} de los próximos ${futuros(datos).length} meses cierran en rojo`,
      detalle: `El peor es ${mesLegible(peor.mes)}, con ${fmt(peor.egresos - peor.ingresos, moneda)} de diferencia. Está a tiempo de cambiarse: son gastos que todavía no ocurrieron.`,
    });
  }

  // 4) Tendencia, solo si hay con qué.
  const t = tendencia(pasados(datos), 'egresos');
  if (t != null && Math.abs(t) >= 15) {
    out.push({
      tono: t > 0 ? 'aviso' : 'bien',
      titulo: `Tus gastos vienen ${t > 0 ? 'subiendo' : 'bajando'} ${Math.abs(t)}%`,
      detalle: 'Comparando la primera mitad de los meses cargados contra la segunda.',
    });
  }

  return out;
}

/** Tablero de gastos. */
export function sugerenciasGastos(ctx: Contexto): Sugerencia[] {
  const { datos, moneda = 'ARS', fijosDelMes = 0, porCategoria = [] } = ctx;
  const out: Sugerencia[] = [];
  const actual = datos.find((m) => m.actual);

  if (!actual || actual.egresos === 0) {
    return [
      {
        tono: 'neutro',
        titulo: 'Cargá tus gastos para ver de qué se trata',
        detalle:
          'Con un mes cargado ya ves en qué se te va la plata y cuánto de eso es fijo. Con tres, si eso viene subiendo.',
      },
    ];
  }

  // 1) Cuánto de lo que gastás es realmente recortable.
  const variable = Math.max(0, actual.egresos - fijosDelMes);
  const pctFijo = pct(fijosDelMes, actual.egresos);
  out.push({
    tono: pctFijo >= 75 ? 'aviso' : 'neutro',
    titulo: `${pctFijo}% de tus gastos son fijos`,
    detalle:
      pctFijo >= 75
        ? `Solo ${fmt(variable, moneda)} son variables, así que apretarse el cinturón casi no mueve la aguja. Para bajar el total hay que tocar un gasto fijo: renegociar, cambiar de plan o dar de baja algo.`
        : `Tenés ${fmt(variable, moneda)} de gasto variable: ahí está el margen que podés mover este mes sin renegociar nada.`,
  });

  // 2) La categoría que más pesa. Accionable con un solo mes cargado.
  if (porCategoria.length > 0) {
    const top = porCategoria[0];
    const share = pct(top.monto, actual.egresos);
    if (share >= 25) {
      out.push({
        tono: 'neutro',
        titulo: `${top.nombre} se lleva el ${share}% de tus gastos`,
        detalle: `Son ${fmt(top.monto, moneda)}. Cuando una sola categoría pesa tanto, es el único lugar donde un recorte se nota de verdad.`,
      });
    }
  }

  // 3) El mes más caro de la ventana.
  const conGasto = datos.filter((m) => m.egresos > 0);
  if (conGasto.length >= 3) {
    const peor = conGasto.reduce((a, b) => (b.egresos > a.egresos ? b : a));
    if (!peor.actual) {
      out.push({
        tono: 'neutro',
        titulo: `Tu mes más caro es ${mesLegible(peor.mes)}`,
        detalle: `${fmt(peor.egresos, moneda)}. Si se repite todos los años, conviene apartar plata unos meses antes en vez de absorberlo de golpe.`,
      });
    }
  }

  // 4) Tendencia.
  const t = tendencia(pasados(datos), 'egresos');
  if (t != null && t >= 10) {
    out.push({
      tono: 'aviso',
      titulo: `Tus gastos vienen subiendo ${t}%`,
      detalle:
        'Si es inflación, el sueldo tendría que estar subiendo parecido: fijate en el tablero de Ingresos.',
    });
  }

  return out;
}

/** Tablero de ingresos. */
export function sugerenciasIngresos(ctx: Contexto): Sugerencia[] {
  const { datos, moneda = 'ARS', fuentes = [], porCobrar = 0 } = ctx;
  const out: Sugerencia[] = [];
  const actual = datos.find((m) => m.actual);

  if (!actual || (actual.ingresos === 0 && fuentes.length === 0)) {
    return [
      {
        tono: 'neutro',
        titulo: 'Cargá tus ingresos',
        detalle:
          'Con el sueldo cargado como recurrente, la proyección de los próximos meses se arma sola y no tenés que volver a tocarla.',
      },
    ];
  }

  // 1) Concentración: de dónde viene la plata. Un mes alcanza.
  const total = fuentes.reduce((a, f) => a + f.monto, 0);
  if (total > 0) {
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

  // 2) Lo que todavía no entró.
  if (porCobrar > 0) {
    out.push({
      tono: 'neutro',
      titulo: `Tenés ${fmt(porCobrar, moneda)} por cobrar`,
      detalle:
        'Hasta que no esté acreditado no es tuyo. Si tenés vencimientos antes de esa fecha, conviene no contar con esa plata todavía.',
    });
  }

  // 3) ¿Los ingresos siguen al costo de vida?
  const ti = tendencia(pasados(datos), 'ingresos');
  const tg = tendencia(pasados(datos), 'egresos');
  if (ti != null) {
    if (ti <= 0 && tg != null && tg > 0) {
      out.push({
        tono: 'aviso',
        titulo: 'Tus gastos suben y tus ingresos no',
        detalle: `Los gastos vienen ${tg}% arriba y los ingresos ${ti === 0 ? 'planchados' : `${Math.abs(ti)}% abajo`}. Esa diferencia la estás pagando de tu bolsillo, y el ajuste tiene que salir del gasto.`,
      });
    } else if (ti >= 10) {
      out.push({
        tono: 'bien',
        titulo: `Tus ingresos subieron ${ti}%`,
        detalle:
          'Es el mejor momento para subir lo que ahorrás: antes de acostumbrarte al número nuevo.',
      });
    }
  }

  return out;
}
