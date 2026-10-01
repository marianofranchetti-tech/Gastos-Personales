import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Grupos } from '../components/Grupos';
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
    <ScrollView className="flex-1" contentContainerStyle={contenido}>
      <View style={{ flexDirection: pc ? 'row' : 'column', gap: pc ? 24 : 20, alignItems: 'flex-start' }}>
      <View style={{ flex: pc ? 1 : undefined, width: pc ? undefined : '100%' }}>
      <Tablero
        titulo="Ingresos por período"
        modo="ingresos"
        sugerencias={sugerencias}
      />

      </View>

      <View style={{ flex: pc ? 1 : undefined, width: pc ? undefined : '100%' }}>
        <Text className="text-[16px] font-bold mb-2" style={{ color: T.text }}>
          Movimientos
        </Text>
        <Grupos items={ingresos} tipo="ingreso" onToggle={alternar} onEdit={abrirEdicion} />
      </View>
      </View>
    </ScrollView>
  );
}
