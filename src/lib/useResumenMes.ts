import { useMemo } from 'react';
import { useData } from '../db/DataProvider';
import { TransaccionVista } from '../db/queries';
import { mesActual } from './format';

// "cobrado" = pagado en gastos, cobrado en ingresos (mismo estado en DB)
export const cobrado = (t: TransaccionVista) => t.estado === 'pagado';

export function useResumenMes() {
  const { gastos, ingresos } = useData();

  // Comparación por prefijo de string: no depende de que la fecha parsee bien
  const gMes = useMemo(
    () => gastos.filter((t) => t.fecha.slice(0, 7) === mesActual),
    [gastos]
  );
  const iMes = useMemo(
    () => ingresos.filter((t) => t.fecha.slice(0, 7) === mesActual),
    [ingresos]
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

  const proximos = useMemo(
    () =>
      gastos
        .filter((t) => t.estado === 'pendiente')
        .sort((a, b) => (a.venc ?? '').localeCompare(b.venc ?? ''))
        .slice(0, 3),
    [gastos]
  );

  return { gMes, iMes, totG, totI, pendCobro, balance, desequilibrio, pctG, porCat, proximos };
}
