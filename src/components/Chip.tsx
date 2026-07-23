import { Pressable, Text } from 'react-native';
import { T } from '../lib/theme';

export function Chip({
  on,
  onPress,
  children,
}: {
  on: boolean;
  onPress: () => void;
  children: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="px-3 py-1.5 rounded border"
      style={{
        backgroundColor: on ? T.primary : T.surface2,
        borderColor: on ? T.primary : T.border,
      }}
    >
      <Text className="text-sm font-medium" style={{ color: on ? '#fff' : T.muted }}>
        {children}
      </Text>
    </Pressable>
  );
}
