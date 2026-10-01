import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Grupos } from '../components/Grupos';
import { Tablero } from '../components/Tablero';
import { GraficoCategorias } from '../components/GraficoCategorias';
import { sugerenciasGastos } from '../lib/sugerencias';
import { T } from '../lib/theme';
import { useLayout } from '../lib/layout';
import { useResumenMes } from '../lib/useResumenMes';

export function GastosScreen() {
  const { contenido, pc } = useLayout();
  const { gastos, alternar, abrirEdicion, estadisticas, fijosDelMes } = useData();
  const { categorias } = useResumenMes();
  const sugerencias = useMemo(
    () => sugerenciasGastos({ datos: estadisticas, fijosDelMes, porCategoria: categorias }),
    [estadisticas, fijosDelMes, categorias]
  );

  return (
    <ScrollView className="flex-1" contentContainerStyle={contenido}>
      <View style={{ flexDirection: pc ? 'row' : 'column', gap: pc ? 24 : 20, alignItems: 'flex-start' }}>
      <View style={{ flex: pc ? 1 : undefined, width: pc ? undefined : '100%' }}>
      <Tablero
        titulo="Gastos por período"
        modo="egresos"
        sugerencias={sugerencias}
        extra={
          <View style={{ gap: 8 }}>
            <Text className="text-[16px] font-bold" style={{ color: T.text }}>
              Por categoría
            </Text>
            <GraficoCategorias />
          </View>
        }
      />

      </View>

      <View style={{ flex: pc ? 1 : undefined, width: pc ? undefined : '100%' }}>
        <Text className="text-[16px] font-bold mb-2" style={{ color: T.text }}>
          Movimientos
        </Text>
        <Grupos items={gastos} tipo="gasto" onToggle={alternar} onEdit={abrirEdicion} />
      </View>
      </View>
    </ScrollView>
  );
}
