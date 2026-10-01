import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { CalendarioMovimientos } from '../components/CalendarioMovimientos';
import { Tablero } from '../components/Tablero';
import { sugerenciasIngresos } from '../lib/sugerencias';
import { T } from '../lib/theme';
import { useLayout } from '../lib/layout';

export function IngresosScreen() {
  const { contenido, pc } = useLayout();
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
    <ScrollView className="flex-1" contentContainerStyle={[contenido, { gap: 24 }]}>
      <Tablero titulo="Ingresos por período" modo="ingresos" sugerencias={sugerencias} />

      <View style={{ gap: 8 }}>
        <Text className="text-[16px] font-bold" style={{ color: T.text }}>
          Calendario de ingresos
        </Text>
        <CalendarioMovimientos items={ingresos} tipo="ingreso" onToggle={alternar} onEdit={abrirEdicion} />
      </View>
    </ScrollView>
  );
}
