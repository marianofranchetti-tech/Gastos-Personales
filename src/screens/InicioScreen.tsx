import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Tablero } from '../components/Tablero';
import { BalanceMes } from '../components/BalanceMes';
import { ModalOpciones } from '../components/ModalOpciones';
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
  const { estadisticas, limpiar, porPagar } = useData();
  const { totG, totI, pendCobro, categorias } = useResumenMes();

  const totales = useMemo(
    () => ({
      aPagar: porPagar.filter((t) => t.tipo === 'gasto').reduce((a, t) => a + t.monto, 0),
      aCobrar: porPagar.filter((t) => t.tipo === 'ingreso').reduce((a, t) => a + t.monto, 0),
    }),
    [porPagar]
  );
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  const sugerencias = useMemo(
    () =>
      sugerenciasBalance({
        datos: estadisticas,
        porPagar: totales.aPagar,
        porCobrar: totales.aCobrar,
      }),
    [estadisticas, totales]
  );

  return (
    <ScrollView
      className="flex-1 px-4 mt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 20, paddingBottom: 96 }}
    >
      <View>
        <Text className="font-bold mb-2" style={{ color: T.text, fontSize: 16 }}>
          Balance de este mes
        </Text>
        <BalanceMes ingresos={totI} egresos={totG} pendienteCobro={pendCobro} />
      </View>

      <Tablero
        titulo="Ingresos contra gastos, mes a mes"
        datos={estadisticas}
        modo="ambos"
        sugerencias={sugerencias}
      />

      <View>
        <Text className="text-[16px] font-bold mb-2" style={{ color: T.text }}>
          En qué se fue este mes
        </Text>
        <View
          className="rounded-lg p-4 border"
          style={{ backgroundColor: T.surface, borderColor: T.border, gap: 12 }}
        >
          {categorias.map((c) => {
            const Icono = CAT_ICONS[c.id];
            return (
              <View key={c.id}>
                <View className="flex-row justify-between items-center mb-1">
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    {Icono && <Icono size={16} strokeWidth={1.8} color={c.color} />}
                    <Text style={{ color: T.text, fontSize: 15 }}>{c.nombre}</Text>
                  </View>
                  <View className="flex-row items-baseline" style={{ gap: 6 }}>
                    <Text style={{ color: T.muted, fontSize: 14 }}>{c.porcentaje}%</Text>
                    <Text className="font-semibold" style={{ color: T.text, fontSize: 15 }}>
                      {fmt(c.monto)}
                    </Text>
                  </View>
                </View>
                <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
                  <View
                    className="h-2 rounded-full"
                    style={{ width: `${c.porcentaje}%`, backgroundColor: c.color }}
                  />
                </View>
              </View>
            );
          })}
          {categorias.length === 0 && (
            <Text className="text-[16px]" style={{ color: T.muted }}>
              Todavía no registraste pagos este mes.
            </Text>
          )}
        </View>
      </View>

      {/* Los datos de ejemplo vienen de fábrica y no son tuyos. */}
      <Pressable onPress={() => setConfirmandoBorrado(true)} className="py-3">
        <Text className="text-[14px] text-center" style={{ color: T.muted }}>
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
