import { TransaccionVista } from '../db/queries';

export type PendienteAgrupado = {
  fila: TransaccionVista;
  /** Ocurrencias adicionales de la misma regla dentro de la ventana. */
  mas: number;
};

/**
 * Colapsa las ocurrencias de una misma regla en una sola fila.
 *
 * Sin esto, una regla semanal genera 7 filas en una ventana de 45 días y
 * sepulta al resto de la lista. Se muestra la más próxima —que es la que se
 * paga— y se indica cuántas vienen atrás. Las transacciones sueltas (sin
 * regla) nunca se agrupan: cada una es un hecho distinto.
 *
 * Asume la entrada ordenada por vencimiento ascendente, como la devuelve
 * getPorPagar.
 */
export function agruparPendientes(filas: TransaccionVista[]): PendienteAgrupado[] {
  const out: PendienteAgrupado[] = [];
  const indicePorRegla = new Map<number, number>();

  for (const fila of filas) {
    const regla = fila.regla_recurrente_id;
    if (regla == null) {
      out.push({ fila, mas: 0 });
      continue;
    }
    const yaVisto = indicePorRegla.get(regla);
    if (yaVisto === undefined) {
      indicePorRegla.set(regla, out.length);
      out.push({ fila, mas: 0 });
    } else {
      out[yaVisto].mas += 1;
    }
  }

  return out;
}

/** Lo que falta pagar: el saldo, no el total (un parcial ya pagó una parte). */
export const sumar = (filas: TransaccionVista[]) => filas.reduce((a, t) => a + (t.saldo ?? t.monto), 0);
