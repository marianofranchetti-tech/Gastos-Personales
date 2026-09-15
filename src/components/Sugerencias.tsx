import { Text, View } from 'react-native';
import { Sugerencia } from '../lib/sugerencias';
import { T } from '../lib/theme';

const COLOR = { bien: T.teal, aviso: T.warn, neutro: T.muted } as const;
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
          style={{ backgroundColor: T.surface, borderColor: T.border, borderLeftWidth: 3, borderLeftColor: COLOR[s.tono] }}
        >
          <Text className="font-semibold text-sm" style={{ color: T.text }}>
            <Text style={{ color: COLOR[s.tono] }}>{MARCA[s.tono]} </Text>
            {s.titulo}
          </Text>
          <Text className="text-sm mt-1" style={{ color: T.muted }}>
            {s.detalle}
          </Text>
        </View>
      ))}
    </View>
  );
}
