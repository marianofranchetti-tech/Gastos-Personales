import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { GraficoMeses, ModoGrafico } from './GraficoMeses';
import { SelectorPeriodo } from './SelectorPeriodo';
import { Sugerencias } from './Sugerencias';
import { Sugerencia } from '../lib/sugerencias';
import { useBarras } from '../lib/useBarras';
import { usePeriodo } from '../lib/PeriodoProvider';
import { etiquetaPeriodo } from '../lib/periodo';
import { hoyISO } from '../lib/fechasRecurrentes';
import { T } from '../lib/theme';

/**
 * El bloque de estadísticas que comparten los tres tableros: mismo gráfico con
 * distinta configuración, el selector de período (compartido entre pantallas)
 * y las sugerencias propias de cada uno.
 */
export function Tablero({
  titulo,
  modo,
  sugerencias,
  moneda = 'ARS',
  selector = true,
  extra,
}: {
  titulo: string;
  modo: ModoGrafico;
  sugerencias: Sugerencia[];
  moneda?: string;
  /** false cuando la pantalla ya muestra el selector en otro lado. */
  selector?: boolean;
  extra?: ReactNode;
}) {
  const barras = useBarras(moneda);
  const { g, ancla } = usePeriodo();
  // En vista Mes las columnas son días: arriba va el total del mes, no un día suelto.
  const resumen =
    g === 'mes'
      ? {
          etiqueta: (() => {
            const e = etiquetaPeriodo('mes', ancla, hoyISO());
            return e.charAt(0).toUpperCase() + e.slice(1);
          })(),
          ingresos: barras.reduce((a, b) => a + b.ingresos, 0),
          egresos: barras.reduce((a, b) => a + b.egresos, 0),
          real: true,
        }
      : undefined;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <Text className="text-[16px] font-bold" style={{ color: T.text }}>
          {titulo}
        </Text>
        {selector && <SelectorPeriodo />}
        <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <GraficoMeses datos={barras} modo={modo} moneda={moneda} resumen={resumen} />
        </View>
      </View>

      <Sugerencias items={sugerencias} />
      {extra}
    </View>
  );
}
