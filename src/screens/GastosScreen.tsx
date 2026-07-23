import { ScrollView, Text } from 'react-native';
import { useData } from '../db/DataProvider';
import { Grupos } from '../components/Grupos';
import { T } from '../lib/theme';

export function GastosScreen() {
  const { gastos, alternar } = useData();
  return (
    <ScrollView className="flex-1 px-4 mt-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
      <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
        Gastos
      </Text>
      <Grupos items={gastos} tipo="gasto" onToggle={alternar} />
    </ScrollView>
  );
}
