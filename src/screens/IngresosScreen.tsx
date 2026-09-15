import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Grupos } from '../components/Grupos';
import { Tablero } from '../components/Tablero';
import { sugerenciasIngresos } from '../lib/sugerencias';
import { T } from '../lib/theme';

export function IngresosScreen() {
  const { ingresos, alternar, abrirEdicion, estadisticas, fuentes } = useData();
  const sugerencias = useMemo(
    () => sugerenciasIngresos(estadisticas, fuentes),
    [estadisticas, fuentes]
  );

  return (
    <ScrollView
      className="flex-1 px-4 mt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 20, paddingBottom: 96 }}
    >
      <Tablero
        titulo="Ingresos mes a mes"
        datos={estadisticas}
        modo="ingresos"
        sugerencias={sugerencias}
      />

      <View>
        <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
          Movimientos
        </Text>
        <Grupos items={ingresos} tipo="ingreso" onToggle={alternar} onEdit={abrirEdicion} />
      </View>
    </ScrollView>
  );
}
