import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Home, Tag, TrendingDown, TrendingUp, LucideIcon } from 'lucide-react-native';
import { useData } from '../db/DataProvider';
import { hoy } from '../lib/format';
import { TipoTx } from '../lib/categorias';
import { APP_NAME, SOMBRA_FLOTANTE, T } from '../lib/theme';
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
  const { guardar, editando, cerrarEdicion, editar, eliminar, precioEditando, cerrarPrecio } = useData();
  const [tab, setTab] = useState<Tab>('inicio');
  const [form, setForm] = useState<TipoTx | null>(null);
  const [formPrecio, setFormPrecio] = useState(false);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: T.bgDeep }} edges={['top', 'bottom']}>
      <View className="flex-1" style={{ backgroundColor: T.bg }}>
        {/* Encabezado: solo identidad y mes. El balance es contenido del
            tablero de Inicio, no un cartel que acompana a las cuatro pestanas. */}
        <View className="px-5 pt-4 pb-4 border-b" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: T.primary }}>
                <Text className="font-bold text-white" style={{ fontSize: 18 }}>₲</Text>
              </View>
              <Text className="font-bold" style={{ color: T.text, fontSize: 20 }}>
                {APP_NAME}
              </Text>
            </View>
            <Text className="uppercase tracking-widest" style={{ color: T.muted, fontSize: 13 }}>
              {hoy.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
        </View>

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
              style={{ backgroundColor: T.primary, ...SOMBRA_FLOTANTE }}
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
                style={{ backgroundColor: T.tealD, ...SOMBRA_FLOTANTE }}
              >
                <Text className="text-white text-2xl">+</Text>
              </Pressable>
              <Pressable
                onPress={() => setForm('gasto')}
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: T.danger, ...SOMBRA_FLOTANTE }}
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
                <Text className="text-[14px] font-medium" style={{ color: activo ? T.primaryLight : T.muted }}>
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

      {precioEditando && <PrecioForm inicial={precioEditando} onClose={cerrarPrecio} />}

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
