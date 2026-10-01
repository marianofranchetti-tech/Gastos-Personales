import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { T } from '../lib/theme';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="mb-3">
      <Text className="font-semibold uppercase tracking-wide mb-1" style={{ color: T.muted, fontSize: 14 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

// Getters, no valores: así toma el color del tema activo en cada render.
export const inputStyle = {
  get backgroundColor() {
    return T.surface2;
  },
  get borderColor() {
    return T.border;
  },
  borderWidth: 1,
  get color() {
    return T.text;
  },
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 17,
};
