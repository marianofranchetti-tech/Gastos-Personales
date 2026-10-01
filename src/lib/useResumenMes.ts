import { useMemo } from 'react';
import { useData } from '../db/DataProvider';
import { TransaccionVista } from '../db/queries';
import { TODAS_CATS } from './categorias';
import { mesActual } from './format';

// "cobrado" = pagado en gastos, cobrado en ingresos (mismo estado en DB)
export const cobrado = (t: TransaccionVista) => t.estado === 'pagado';

export function useResumenMes() {
  const { gastos, ingresos } = useData();
  const mes = mesActual();

  // Comparación por prefijo de string: no depende de que la fecha parsee bien
  const gMes = useMemo(
    () => gastos.filter((t) => t.fecha.slice(0, 7) === mes),
    [gastos, mes]
  );
  const iMes = useMemo(
    () => ingresos.filter((t) => t.fecha.slice(0, 7) === mes),
    [ingresos, mes]
  );

  // BALANCE REAL: sólo dinero efectivamente pagado / cobrado
  const totG = gMes.filter(cobrado).reduce((a, t) => a + t.monto, 0);
  const totI = iMes.filter(cobrado).reduce((a, t) => a + t.monto, 0);
  const pendCobro = iMes.filter((t) => !cobrado(t)).reduce((a, t) => a + t.monto, 0);
  const balance = totI - totG;
  const desequilibrio = balance < 0;
  const pctG = totI + totG > 0 ? (totG / (totI + totG)) * 100 : 50;

  const porCat = useMemo(() => {
    const m: Record<string, number> = {};
    gMes.filter(cobrado).forEach((t) => (m[t.categoria_id] = (m[t.categoria_id] || 0) + t.monto));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [gMes]);

  /**
   * Lo mismo pero con nombre y porcentaje sobre el total del mes. El porcentaje
   * es lo que hace comparable un mes con otro: $82.000 no dice nada solo, "el
   * 17% de lo que gastaste" sí.
   */
  const categorias = useMemo(
    () =>
      porCat.map(([id, monto]) => ({
        id,
        nombre: TODAS_CATS.find((c) => c.id === id)?.nombre ?? id,
        color: TODAS_CATS.find((c) => c.id === id)?.color,
        monto,
        porcentaje: totG > 0 ? Math.round((monto / totG) * 100) : 0,
      })),
    [porCat, totG]
  );

  // 'proximos' se fue de acá: los vencimientos ahora salen de porPagar, que
  // los lee materializados de la base y respeta la ventana configurable.

  return { gMes, iMes, totG, totI, pendCobro, balance, desequilibrio, pctG, porCat, categorias };
}
