import { Text, View } from 'react-native';
import { Sugerencia } from '../lib/sugerencias';
import { T } from '../lib/theme';

const color = (tono: Sugerencia['tono']) => ({ bien: T.teal, aviso: T.warn, neutro: T.muted })[tono];
const MARCA = { bien: '✓', aviso: '!', neutro: '·' } as const;

/** Las sugerencias de un tablero. Sin datos suficientes, una sola que lo diga. */
export function Sugerencias({ items }: { items: Sugerencia[] }) {
  if (items.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {items.map((s, i) => (
        <View
          key={i}
          className="rounded-lg p-4 border"
          style={{ backgroundColor: T.surface, borderColor: T.border, borderLeftWidth: 3, borderLeftColor: color(s.tono) }}
        >
          <Text className="font-semibold text-[16px]" style={{ color: T.text }}>
            <Text style={{ color: color(s.tono) }}>{MARCA[s.tono]} </Text>
            {s.titulo}
          </Text>
          <Text className="text-[16px] mt-1" style={{ color: T.muted }}>
            {s.detalle}
          </Text>
        </View>
      ))}
    </View>
  );
}
