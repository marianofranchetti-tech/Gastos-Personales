import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Grupos } from '../components/Grupos';
import { Tablero } from '../components/Tablero';
import { sugerenciasGastos } from '../lib/sugerencias';
import { T } from '../lib/theme';
import { useResumenMes } from '../lib/useResumenMes';

export function GastosScreen() {
  const { gastos, alternar, abrirEdicion, estadisticas, fijosDelMes } = useData();
  const { categorias } = useResumenMes();
  const sugerencias = useMemo(
    () => sugerenciasGastos({ datos: estadisticas, fijosDelMes, porCategoria: categorias }),
    [estadisticas, fijosDelMes, categorias]
  );

  return (
    <ScrollView
      className="flex-1 px-4 mt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 20, paddingBottom: 96 }}
    >
      <Tablero
        titulo="Gastos mes a mes"
        datos={estadisticas}
        modo="egresos"
        sugerencias={sugerencias}
      />

      <View>
        <Text className="text-[16px] font-bold mb-2" style={{ color: T.text }}>
          Movimientos
        </Text>
        <Grupos items={gastos} tipo="gasto" onToggle={alternar} onEdit={abrirEdicion} />
      </View>
    </ScrollView>
  );
}
