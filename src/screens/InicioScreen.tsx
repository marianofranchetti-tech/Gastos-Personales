import { ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Fila } from '../components/Fila';
import { CATS } from '../lib/categorias';
import { CAT_ICONS } from '../lib/iconos';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';
import { useResumenMes } from '../lib/useResumenMes';

export function InicioScreen() {
  const { alternar } = useData();
  const { totG, porCat, proximos } = useResumenMes();

  return (
    <ScrollView className="flex-1 px-4 mt-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingBottom: 16 }}>
      {proximos.length > 0 && (
        <View>
          <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
            Próximos vencimientos
          </Text>
          <View style={{ gap: 8 }}>
            {proximos.map((t) => (
              <Fila key={t.id} t={t} onToggle={alternar} />
            ))}
          </View>
        </View>
      )}

      <View>
        <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
          Top categorías del mes
        </Text>
        <View
          className="rounded-lg p-4 border"
          style={{ backgroundColor: T.surface, borderColor: T.border, gap: 12 }}
        >
          {porCat.map(([cid, monto]) => {
            const c = CATS.find((c) => c.id === cid);
            const Icono = CAT_ICONS[cid];
            return (
              <View key={cid}>
                <View className="flex-row justify-between items-center mb-1">
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    {Icono && <Icono size={14} strokeWidth={1.8} color={c?.color} />}
                    <Text className="text-sm" style={{ color: T.text }}>
                      {c?.nombre}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold" style={{ color: T.text }}>
                    {fmt(monto)}
                  </Text>
                </View>
                <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
                  <View
                    className="h-1.5 rounded-full"
                    style={{ width: `${(monto / totG) * 100}%`, backgroundColor: c?.color }}
                  />
                </View>
              </View>
            );
          })}
          {porCat.length === 0 && (
            <Text className="text-sm" style={{ color: T.muted }}>
              Todavía no registraste pagos este mes.
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
