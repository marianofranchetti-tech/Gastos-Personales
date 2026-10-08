import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Home, Moon, Sun, Tag, TrendingDown, TrendingUp, LucideIcon } from 'lucide-react-native';
import { useData } from '../db/DataProvider';
import { hoy } from '../lib/format';
import { TipoTx } from '../lib/categorias';
import { APP_NAME, SOMBRA_FLOTANTE, T } from '../lib/theme';
import { useTema } from '../lib/TemaProvider';
import { useLayout } from '../lib/layout';
import { InicioScreen } from './InicioScreen';
import { GastosScreen } from './GastosScreen';
import { IngresosScreen } from './IngresosScreen';
import { PreciosScreen, PrecioForm } from './PreciosScreen';
import { TransactionForm } from '../components/TransactionForm';
import { MenuCuenta } from '../auth/MenuCuenta';

type Tab = 'inicio' | 'gastos' | 'ingresos' | 'precios';

const TABS: { id: Tab; Icono: LucideIcon; nombre: string }[] = [
  { id: 'inicio', Icono: Home, nombre: 'Inicio' },
  { id: 'gastos', Icono: TrendingDown, nombre: 'Gastos' },
  { id: 'ingresos', Icono: TrendingUp, nombre: 'Ingresos' },
  { id: 'precios', Icono: Tag, nombre: 'Precios' },
];

export function HomeShell() {
  const { guardar, editando, cerrarEdicion, editar, eliminar, precioEditando, cerrarPrecio } = useData();
  // Leer el tema acá hace que todo el árbol se vuelva a renderizar al cambiarlo.
  const { modo, alternar } = useTema();
  const { pc } = useLayout();
  const [tab, setTab] = useState<Tab>('inicio');
  const [form, setForm] = useState<TipoTx | null>(null);
  const [formPrecio, setFormPrecio] = useState(false);

  const mes = hoy().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const Logo = (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: T.primary }}>
        <Text className="font-bold text-white" style={{ fontSize: 18 }}>₲</Text>
      </View>
      <Text className="font-bold" style={{ color: T.text, fontSize: 20 }}>
        {APP_NAME}
      </Text>
    </View>
  );

  const BotonTema = (
    <Pressable
      onPress={alternar}
      className="flex-row items-center rounded-md px-2.5 py-1.5"
      style={{ gap: 6, backgroundColor: T.surface2 }}
      accessibilityLabel={modo === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      {modo === 'oscuro' ? <Sun size={16} color={T.text} /> : <Moon size={16} color={T.text} />}
      {pc && (
        <Text style={{ color: T.text, fontSize: 14 }}>{modo === 'oscuro' ? 'Tema claro' : 'Tema oscuro'}</Text>
      )}
    </Pressable>
  );

  const pantalla = (
    <View className="flex-1">
      {tab === 'inicio' && <InicioScreen />}
      {tab === 'gastos' && <GastosScreen />}
      {tab === 'ingresos' && <IngresosScreen />}
      {tab === 'precios' && <PreciosScreen />}
    </View>
  );

  const flotantes = (
    <View className="absolute items-end" style={{ gap: 8, bottom: 80, right: 16 }}>
      {tab === 'precios' ? (
        <Pressable
          onPress={() => setFormPrecio(true)}
          className="w-14 h-14 rounded-full items-center justify-center"
          style={{ backgroundColor: T.primary, ...SOMBRA_FLOTANTE }}
          accessibilityLabel="Nuevo precio"
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
            accessibilityLabel="Nuevo ingreso"
          >
            <Text className="text-white text-2xl">+</Text>
          </Pressable>
          <Pressable
            onPress={() => setForm('gasto')}
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{ backgroundColor: T.danger, ...SOMBRA_FLOTANTE }}
            accessibilityLabel="Nuevo gasto"
          >
            <Text className="text-white text-2xl">−</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: T.bgDeep }} edges={['top', 'bottom']}>
      <StatusBar style={modo === 'oscuro' ? 'light' : 'dark'} />
      {pc ? (
        // PC: menú lateral fijo y el contenido a la derecha con su propio scroll.
        <View className="flex-1 flex-row" style={{ backgroundColor: T.bg }}>
          <View
            className="border-r px-3 py-5"
            style={{ width: 220, backgroundColor: T.surface, borderColor: T.border, gap: 24 }}
          >
            <View className="px-2">{Logo}</View>
            <View style={{ gap: 4 }}>
              {TABS.map(({ id, Icono, nombre }) => {
                const activo = tab === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setTab(id)}
                    className="flex-row items-center rounded-md px-3 py-2.5"
                    style={{ gap: 10, backgroundColor: activo ? T.primaryBadgeBg : 'transparent' }}
                  >
                    <Icono size={18} strokeWidth={1.8} color={activo ? T.primaryLight : T.muted} />
                    <Text style={{ color: activo ? T.primaryLight : T.text, fontSize: 15, fontWeight: activo ? '600' : '400' }}>
                      {nombre}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* En la PC las acciones van en el menú: flotando taparían números. */}
            <View style={{ gap: 8 }}>
              {tab === 'precios' ? (
                <BotonAccion color={T.primary} texto="+ Nuevo precio" onPress={() => setFormPrecio(true)} />
              ) : (
                <>
                  <BotonAccion color={T.tealD} texto="+ Ingreso" onPress={() => setForm('ingreso')} />
                  <BotonAccion color={T.danger} texto="− Gasto" onPress={() => setForm('gasto')} />
                </>
              )}
            </View>
            <View className="flex-1" />
            <View className="px-1" style={{ gap: 10 }}>
              <MenuCuenta conTexto />
              <Text className="uppercase tracking-widest" style={{ color: T.muted, fontSize: 12 }}>
                {mes}
              </Text>
              {BotonTema}
            </View>
          </View>
          <View className="flex-1">{pantalla}</View>
        </View>
      ) : (
        <View className="flex-1" style={{ backgroundColor: T.bg }}>
          {/* Encabezado: identidad, mes y tema. El balance es contenido del
              tablero de Inicio, no un cartel que acompaña a las cuatro pestañas. */}
          <View className="px-5 pt-4 pb-4 border-b" style={{ backgroundColor: T.surface, borderColor: T.border }}>
            <View className="flex-row items-center justify-between">
              {Logo}
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <Text className="uppercase tracking-widest" style={{ color: T.muted, fontSize: 13 }}>
                  {mes}
                </Text>
                {BotonTema}
                <MenuCuenta />
              </View>
            </View>
          </View>

          {pantalla}
          {flotantes}

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
      )}

      {form && <TransactionForm tipo={form} onSave={(t) => guardar(t)} onClose={() => setForm(null)} />}

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

function BotonAccion({ color, texto, onPress }: { color: string; texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="rounded-md py-2.5 items-center" style={{ backgroundColor: color }}>
      <Text className="text-white font-semibold" style={{ fontSize: 15 }}>
        {texto}
      </Text>
    </Pressable>
  );
}
