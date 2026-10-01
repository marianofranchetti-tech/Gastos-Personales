import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { etiquetaPeriodo, GRANULARIDADES } from '../lib/periodo';
import { usePeriodo } from '../lib/PeriodoProvider';
import { hoyISO } from '../lib/fechasRecurrentes';
import { T } from '../lib/theme';

/**
 * Año / Mes / Semana / Día, y flechas para moverse. Lo comparten todos los
 * gráficos de la app (ver PeriodoProvider).
 */
export function SelectorPeriodo() {
  const { g, ancla, setG, mover, irAHoy } = usePeriodo();
  const hoy = hoyISO();
  const etiqueta = etiquetaPeriodo(g, ancla, hoy);

  return (
    <View
      className="rounded-lg border p-2"
      style={{ backgroundColor: T.surface, borderColor: T.border, gap: 8 }}
    >
      <View className="flex-row rounded-md p-0.5" style={{ backgroundColor: T.surface2 }}>
        {GRANULARIDADES.map(({ id, nombre }) => {
          const on = g === id;
          return (
            <Pressable
              key={id}
              onPress={() => setG(id)}
              className="flex-1 py-1.5 rounded items-center"
              style={{ backgroundColor: on ? T.primary : 'transparent' }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={{ color: on ? '#fff' : T.muted, fontSize: 14, fontWeight: on ? '600' : '500' }}>
                {nombre}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => mover(-1)} className="p-1.5 rounded" accessibilityLabel="Período anterior">
          <ChevronLeft size={20} color={T.text} />
        </Pressable>
        <Pressable onPress={irAHoy} className="flex-1 items-center">
          <Text className="font-semibold" style={{ color: T.text, fontSize: 15 }}>
            {etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}
          </Text>
        </Pressable>
        <Pressable onPress={() => mover(1)} className="p-1.5 rounded" accessibilityLabel="Período siguiente">
          <ChevronRight size={20} color={T.text} />
        </Pressable>
      </View>
    </View>
  );
}
