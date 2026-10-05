import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { CalendarioMovimientos } from '../components/CalendarioMovimientos';
import { GraficoCategorias } from '../components/GraficoCategorias';
import { SelectorMes } from '../components/SelectorMes';
import { Tablero } from '../components/Tablero';
import { sugerenciasIngresos } from '../lib/sugerencias';
import { usePeriodo } from '../lib/PeriodoProvider';
import { T } from '../lib/theme';
import { useLayout } from '../lib/layout';

/**
 * Misma estructura que Gastos: un filtro de mes arriba que manda sobre el
 * gráfico, las categorías y el calendario, y abajo el calendario con arrastre.
 */
export function IngresosScreen() {
  const { contenido, pc } = useLayout();
  const { ingresos, alternar, abrirEdicion, mover, estadisticas, fuentes, porPagar } = useData();
  const { ancla } = usePeriodo();
  // Mientras se arrastra una tarjeta, la pantalla no scrollea.
  const [arrastrando, setArrastrando] = useState(false);
  const porCobrar = useMemo(
    () => porPagar.filter((t) => t.tipo === 'ingreso').reduce((a, t) => a + t.monto, 0),
    [porPagar]
  );
  const sugerencias = useMemo(
    () => sugerenciasIngresos({ datos: estadisticas, fuentes, porCobrar }),
    [estadisticas, fuentes, porCobrar]
  );

  const categoriasBloque = (
    <View style={{ gap: 8 }}>
      <Text className="text-[16px] font-bold" style={{ color: T.text }}>
        Por categoría
      </Text>
      <GraficoCategorias tipo="ingreso" />
    </View>
  );

  return (
    <ScrollView className="flex-1" scrollEnabled={!arrastrando} contentContainerStyle={[contenido, { gap: 24 }]}>
      <SelectorMes />
      <View style={{ flexDirection: pc ? 'row' : 'column', gap: pc ? 24 : 20, alignItems: 'flex-start' }}>
        <View style={{ flex: pc ? 1 : undefined, width: pc ? undefined : '100%' }}>
          <Tablero
            titulo="Ingresos por período"
            modo="ingresos"
            selector={false}
            sugerencias={sugerencias}
            extra={pc ? undefined : categoriasBloque}
          />
        </View>
        {pc && <View style={{ flex: 1 }}>{categoriasBloque}</View>}
      </View>

      <View style={{ gap: 8 }}>
        <Text className="text-[16px] font-bold" style={{ color: T.text }}>
          Calendario de ingresos
        </Text>
        <CalendarioMovimientos
          items={ingresos}
          tipo="ingreso"
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
