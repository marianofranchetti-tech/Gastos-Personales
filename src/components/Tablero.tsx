import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { GraficoMeses, ModoGrafico } from './GraficoMeses';
import { Sugerencias } from './Sugerencias';
import { MesBarra } from '../db/estadisticas';
import { Sugerencia } from '../lib/sugerencias';
import { T } from '../lib/theme';

/**
 * El bloque de estadísticas que comparten los tres tableros: mismo gráfico de
 * 9 meses con distinta configuración, y las sugerencias propias de cada uno.
 */
export function Tablero({
  titulo,
  datos,
  modo,
  sugerencias,
  moneda = 'ARS',
  extra,
}: {
  titulo: string;
  datos: MesBarra[];
  modo: ModoGrafico;
  sugerencias: Sugerencia[];
  moneda?: string;
  extra?: ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text className="text-[16px] font-bold mb-2" style={{ color: T.text }}>
          {titulo}
        </Text>
        <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <GraficoMeses datos={datos} modo={modo} moneda={moneda} />
        </View>
      </View>

      <Sugerencias items={sugerencias} />
      {extra}
    </View>
  );
}
