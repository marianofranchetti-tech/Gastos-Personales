import { useMemo } from 'react';
import { useData } from '../db/DataProvider';
import { MONEDA_DEFAULT } from './categorias';
import { hoyISO } from './fechasRecurrentes';
import { gastosPorCategoria, rangoPeriodo, serieBarras } from './periodo';
import { usePeriodo } from './PeriodoProvider';

/** Barras del período elegido, armadas en memoria con lo que ya cargó DataProvider. */
export function useBarras(moneda: string = MONEDA_DEFAULT) {
  const { gastos, ingresos, proyeccionGraficos } = useData();
  const { g, ancla } = usePeriodo();
  return useMemo(
    () =>
      serieBarras({
        g,
        ancla,
        hoy: hoyISO(),
        movs: [...gastos, ...ingresos],
        proyeccion: proyeccionGraficos[moneda] ?? [],
        moneda,
      }),
    [g, ancla, gastos, ingresos, proyeccionGraficos, moneda]
  );
}

/** Gasto pagado por categoría en el período elegido. */
export function useCategoriasPeriodo(moneda: string = MONEDA_DEFAULT) {
  const { gastos } = useData();
  const { g, ancla } = usePeriodo();
  return useMemo(() => gastosPorCategoria(gastos, rangoPeriodo(g, ancla), moneda), [g, ancla, gastos, moneda]);
}
