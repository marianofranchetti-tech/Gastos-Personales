import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { CalendarioMovimientos } from '../components/CalendarioMovimientos';
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

  const categoriasBloque = (
    <View style={{ gap: 8 }}>
      <Text className="text-[16px] font-bold" style={{ color: T.text }}>
        Por categoría
      </Text>
      <GraficoCategorias />
    </View>
  );

  // Arriba el análisis del período; abajo, a todo el ancho, el calendario.
  return (
    <ScrollView className="flex-1" contentContainerStyle={[contenido, { gap: 24 }]}>
      <View style={{ flexDirection: pc ? 'row' : 'column', gap: pc ? 24 : 20, alignItems: 'flex-start' }}>
        <View style={{ flex: pc ? 1 : undefined, width: pc ? undefined : '100%' }}>
          <Tablero
            titulo="Gastos por período"
            modo="egresos"
            sugerencias={sugerencias}
            extra={pc ? undefined : categoriasBloque}
          />
        </View>
        {pc && <View style={{ flex: 1 }}>{categoriasBloque}</View>}
      </View>

      <View style={{ gap: 8 }}>
        <Text className="text-[16px] font-bold" style={{ color: T.text }}>
          Calendario de gastos
        </Text>
        <CalendarioMovimientos items={gastos} tipo="gasto" onToggle={alternar} onEdit={abrirEdicion} />
      </View>
    </ScrollView>
  );
}
