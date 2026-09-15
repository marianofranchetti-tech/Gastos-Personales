import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Home, Tag, TrendingDown, TrendingUp, LucideIcon } from 'lucide-react-native';
import { useData } from '../db/DataProvider';
import { useResumenMes } from '../lib/useResumenMes';
import { fmt, hoy } from '../lib/format';
import { TipoTx } from '../lib/categorias';
import { APP_NAME, T } from '../lib/theme';
import { InicioScreen } from './InicioScreen';
import { GastosScreen } from './GastosScreen';
import { IngresosScreen } from './IngresosScreen';
import { PreciosScreen, PrecioForm } from './PreciosScreen';
import { TransactionForm } from '../components/TransactionForm';

type Tab = 'inicio' | 'gastos' | 'ingresos' | 'precios';

const TABS: { id: Tab; Icono: LucideIcon; nombre: string }[] = [
  { id: 'inicio', Icono: Home, nombre: 'Inicio' },
  { id: 'gastos', Icono: TrendingDown, nombre: 'Gastos' },
  { id: 'ingresos', Icono: TrendingUp, nombre: 'Ingresos' },
  { id: 'precios', Icono: Tag, nombre: 'Precios' },
];

export function HomeShell() {
  const { guardar, editando, cerrarEdicion, editar, eliminar } = useData();
  const { totG, totI, pendCobro, balance, desequilibrio, pctG } = useResumenMes();
  const [tab, setTab] = useState<Tab>('inicio');
  const [form, setForm] = useState<TipoTx | null>(null);
  const [formPrecio, setFormPrecio] = useState(false);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: T.bgDeep }} edges={['top', 'bottom']}>
      <View className="flex-1" style={{ backgroundColor: T.bg }}>
        {/* Header balanza — balance REAL */}
        <View className="px-5 pt-4 pb-5 border-b" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
            <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: T.primary }}>
              <Text className="font-bold text-lg text-white">₲</Text>
            </View>
            <Text className="text-lg font-bold" style={{ color: T.text }}>
              {APP_NAME}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-widest" style={{ color: T.muted }}>
              {hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
            </Text>
            <View className="px-2 py-0.5 rounded" style={{ backgroundColor: T.primaryBadgeBg }}>
              <Text className="text-[10px] font-bold uppercase" style={{ color: T.primaryLight }}>
                Balance real
              </Text>
            </View>
          </View>
          <Text className="text-3xl font-bold mt-1" style={{ color: T.text }}>
            {balance >= 0 ? '' : '−'}
            {fmt(Math.abs(balance))}
          </Text>
          <Text className="text-sm mb-3" style={{ color: T.muted }}>
            Sobre dinero pagado y cobrado
          </Text>
          <View className="h-3 rounded-full overflow-hidden flex-row" style={{ backgroundColor: T.bgDeep }}>
            <View style={{ width: `${100 - pctG}%`, backgroundColor: T.teal }} />
            <View style={{ width: `${pctG}%`, backgroundColor: T.danger }} />
          </View>
          <View className="flex-row justify-between mt-1.5">
            <Text className="text-xs" style={{ color: T.teal }}>
              ↑ Cobrado {fmt(totI)}
            </Text>
            <Text className="text-xs" style={{ color: T.danger }}>
              ↓ Pagado {fmt(totG)}
            </Text>
          </View>
          {pendCobro > 0 && (
            <Text className="text-[11px] mt-2" style={{ color: T.muted }}>
              Tenés {fmt(pendCobro)} pendiente de cobro este mes → mirá Ingresos
            </Text>
          )}
        </View>

        {tab === 'inicio' && balance !== 0 && (
          <View
            className="mx-4 mt-3 rounded-lg p-4 border"
            style={{ backgroundColor: T.surface, borderColor: desequilibrio ? T.danger : T.teal }}
          >
            {desequilibrio ? (
              <>
                <Text className="font-semibold text-sm" style={{ color: T.danger }}>
                  ⚠ Este mes pagaste más de lo que cobraste
                </Text>
                <Text className="text-sm mt-1" style={{ color: T.text }}>
                  Te faltan {fmt(-balance)}. El camino más corto es recortar gastos:
                  es un {totG > 0 ? Math.round((-balance / totG) * 100) : 0}% de lo que
                  gastaste este mes.
                </Text>
                <Text className="text-xs mt-1.5" style={{ color: T.muted }}>
                  Si ahí no hay margen, la otra salida es sumar {fmt(-balance)} de ingresos
                  ({totI > 0 ? Math.round((-balance / totI) * 100) : 0}% más) — aunque con
                  un sueldo fijo eso rara vez está en tus manos.
                </Text>
              </>
            ) : (
              <>
                <Text className="font-semibold text-sm" style={{ color: T.teal }}>
                  ✓ Este mes cobraste más de lo que pagaste
                </Text>
                <Text className="text-sm mt-1" style={{ color: T.text }}>
                  Te sobran {fmt(balance)}. Apartalos ahora, antes de que se diluyan en
                  el mes que viene.
                </Text>
              </>
            )}
          </View>
        )}

        <View className="flex-1">
          {tab === 'inicio' && <InicioScreen />}
          {tab === 'gastos' && <GastosScreen />}
          {tab === 'ingresos' && <IngresosScreen />}
          {tab === 'precios' && <PreciosScreen />}
        </View>

        <View className="absolute right-4 bottom-20 items-end" style={{ gap: 8 }}>
          {tab === 'precios' ? (
            <Pressable
              onPress={() => setFormPrecio(true)}
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: T.primary, elevation: 6 }}
            >
              <Text className="text-white text-2xl">+</Text>
            </Pressable>
          ) : (
            <>
              {/* Mismo tamaño los dos: ninguna de las dos acciones es "la
                  principal". Verde suma, rojo resta — el mismo código de color
                  que usan los gráficos. */}
              <Pressable
                onPress={() => setForm('ingreso')}
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: T.tealD, elevation: 6 }}
              >
                <Text className="text-white text-2xl">+</Text>
              </Pressable>
              <Pressable
                onPress={() => setForm('gasto')}
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: T.danger, elevation: 6 }}
              >
                <Text className="text-white text-2xl">−</Text>
              </Pressable>
            </>
          )}
        </View>

        <View className="flex-row border-t" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          {TABS.map(({ id, Icono, nombre }) => {
            const activo = tab === id;
            return (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                className="flex-1 py-2.5 items-center"
                style={{ borderTopWidth: 2, borderTopColor: activo ? T.primary : 'transparent', gap: 2 }}
              >
                <Icono size={18} strokeWidth={1.8} color={activo ? T.primaryLight : T.muted} />
                <Text className="text-xs font-medium" style={{ color: activo ? T.primaryLight : T.muted }}>
                  {nombre}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {form && (
        <TransactionForm tipo={form} onSave={(t) => guardar(t)} onClose={() => setForm(null)} />
      )}

      {formPrecio && <PrecioForm onClose={() => setFormPrecio(false)} />}

      {editando && (
        <TransactionForm
          tipo={editando.tipo}
          inicial={editando}
          onSave={(t, alcance) => editar(editando.id, t, alcance)}
          onDelete={(alcance) => eliminar(editando.id, alcance)}
          onClose={cerrarEdicion}
        />
      )}
    </SafeAreaView>
  );
}
