import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Tablero } from '../components/Tablero';
import { ModalOpciones } from '../components/ModalOpciones';
import { CATS } from '../lib/categorias';
import { CAT_ICONS } from '../lib/iconos';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';
import { useResumenMes } from '../lib/useResumenMes';
import { sugerenciasBalance } from '../lib/sugerencias';

/**
 * Inicio es solo tablero: el gráfico de ingresos contra gastos, las
 * sugerencias y en qué se fue la plata este mes. Las listas de movimientos
 * viven en Gastos e Ingresos, que es donde se las busca.
 */
export function InicioScreen() {
  const { estadisticas, limpiar } = useData();
  const { totG, porCat } = useResumenMes();
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  const sugerencias = useMemo(() => sugerenciasBalance(estadisticas), [estadisticas]);

  return (
    <ScrollView
      className="flex-1 px-4 mt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 20, paddingBottom: 96 }}
    >
      <Tablero
        titulo="Ingresos contra gastos"
        datos={estadisticas}
        modo="ambos"
        sugerencias={sugerencias}
      />

      <View>
        <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
          En qué se fue este mes
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

      {/* Los datos de ejemplo vienen de fábrica y no son tuyos. */}
      <Pressable onPress={() => setConfirmandoBorrado(true)} className="py-3">
        <Text className="text-xs text-center" style={{ color: T.muted }}>
          Borrar todos los movimientos y empezar de cero
        </Text>
      </Pressable>

      {confirmandoBorrado && (
        <ModalOpciones
          titulo="Borrar todos los movimientos"
          mensaje="Se van todos los gastos, ingresos y reglas recurrentes, incluidos los datos de ejemplo. Las categorías y los precios quedan. No se puede deshacer."
          opciones={[{ id: 'ok', label: 'Borrar todo', detalle: 'Empezar de cero con tus números', destructiva: true }]}
          onElegir={async () => {
            setConfirmandoBorrado(false);
            await limpiar();
          }}
          onCancelar={() => setConfirmandoBorrado(false)}
        />
      )}
    </ScrollView>
  );
}
