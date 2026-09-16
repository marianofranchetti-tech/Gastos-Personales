import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Grupos } from '../components/Grupos';
import { Tablero } from '../components/Tablero';
import { sugerenciasIngresos } from '../lib/sugerencias';
import { T } from '../lib/theme';

export function IngresosScreen() {
  const { ingresos, alternar, abrirEdicion, estadisticas, fuentes, porPagar } = useData();
  const porCobrar = useMemo(
    () => porPagar.filter((t) => t.tipo === 'ingreso').reduce((a, t) => a + t.monto, 0),
    [porPagar]
  );
  const sugerencias = useMemo(
    () => sugerenciasIngresos({ datos: estadisticas, fuentes, porCobrar }),
    [estadisticas, fuentes, porCobrar]
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
        <Text className="text-[16px] font-bold mb-2" style={{ color: T.text }}>
          Movimientos
        </Text>
        <Grupos items={ingresos} tipo="ingreso" onToggle={alternar} onEdit={abrirEdicion} />
      </View>
    </ScrollView>
  );
}
