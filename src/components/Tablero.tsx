import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { GraficoMeses, ModoGrafico } from './GraficoMeses';
import { SelectorPeriodo } from './SelectorPeriodo';
import { Sugerencias } from './Sugerencias';
import { Sugerencia } from '../lib/sugerencias';
import { useBarras } from '../lib/useBarras';
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
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <Text className="text-[16px] font-bold" style={{ color: T.text }}>
          {titulo}
        </Text>
        {selector && <SelectorPeriodo />}
        <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <GraficoMeses datos={barras} modo={modo} moneda={moneda} />
        </View>
      </View>

      <Sugerencias items={sugerencias} />
      {extra}
    </View>
  );
}
