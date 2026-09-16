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

export const inputStyle = {
  backgroundColor: T.surface2,
  borderColor: T.border,
  borderWidth: 1,
  color: T.text,
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 17,
} as const;
