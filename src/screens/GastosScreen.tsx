import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { CalendarioMovimientos } from '../components/CalendarioMovimientos';
import { Tablero } from '../components/Tablero';
import { SelectorMes } from '../components/SelectorMes';
import { usePeriodo } from '../lib/PeriodoProvider';
import { GraficoCategorias } from '../components/GraficoCategorias';
import { sugerenciasGastos } from '../lib/sugerencias';
import { T } from '../lib/theme';
import { useLayout } from '../lib/layout';
import { useResumenMes } from '../lib/useResumenMes';

export function GastosScreen() {
  const { contenido, pc } = useLayout();
  const { gastos, alternar, abrirEdicion, mover, estadisticas, fijosDelMes } = useData();
  const { ancla } = usePeriodo();
  // Mientras se arrastra una tarjeta, la pantalla no scrollea.
  const [arrastrando, setArrastrando] = useState(false);
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

  // Un solo filtro de mes arriba: manda sobre el gráfico, las categorías y el
  // calendario. Abajo, a todo el ancho, el calendario.
  return (
    <ScrollView className="flex-1" scrollEnabled={!arrastrando} contentContainerStyle={[contenido, { gap: 24 }]}>
      <SelectorMes />
      <View style={{ flexDirection: pc ? 'row' : 'column', gap: pc ? 24 : 20, alignItems: 'flex-start' }}>
        <View style={{ flex: pc ? 1 : undefined, width: pc ? undefined : '100%' }}>
          <Tablero
            titulo="Gastos por período"
            modo="egresos"
            selector={false}
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
        <CalendarioMovimientos
          items={gastos}
          tipo="gasto"
          mes={ancla.slice(0, 7)}
          onToggle={alternar}
          onEdit={abrirEdicion}
          onMover={(t, fecha) => mover(t.id, fecha)}
          onArrastrando={setArrastrando}
        />
      </View>
    </ScrollView>
  );
}
