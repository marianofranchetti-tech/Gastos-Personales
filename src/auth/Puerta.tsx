/**
 * Lo que hay entre abrir la app y ver tus datos.
 *
 * - Sin Supabase configurado: pasa directo (modo local, como siempre).
 * - Sin sesión: pantalla de ingreso.
 * - Volviendo de "olvidé mi contraseña": pide la nueva.
 * - Con sesión: se asegura de que los datos del dispositivo sean de esta
 *   cuenta antes de mostrar nada (ver VincularDispositivo).
 */
import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { Field, inputStyle } from '../components/Field';
import { ModalOpciones } from '../components/ModalOpciones';
import { T } from '../lib/theme';
import { cantidadLocal, encolarTodo, escribirMeta, leerMeta, vaciarLocal } from '../sync/motor';
import { registrarEvento } from '../sync/eventos';
import { mensajeDeError, useAuth } from './AuthProvider';
import { LoginScreen } from './LoginScreen';

export function Puerta({ children }: { children: ReactNode }) {
  const { habilitado, sesion, cargando, recuperando } = useAuth();

  if (!habilitado) return <>{children}</>;
  if (cargando) return <Cargando />;
  if (!sesion) return <LoginScreen />;
  if (recuperando) return <NuevaClave />;
  return (
    <VincularDispositivo usuarioId={sesion.user.id} key={sesion.user.id}>
      {children}
    </VincularDispositivo>
  );
}

function Cargando() {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: T.bg }}>
      <ActivityIndicator color={T.primaryLight} />
    </View>
  );
}

/**
 * Los datos de este dispositivo tienen que ser de la cuenta que entró:
 *
 * - Misma cuenta que la última vez: listo.
 * - Primera vez y sin datos: se vincula y baja todo de la nube.
 * - Primera vez con datos cargados (de antes de tener cuenta, o los de
 *   ejemplo): se pregunta si se suman a la cuenta o se descartan.
 * - Otra cuenta: los datos de la anterior ya están en su nube; se vacía.
 */
function VincularDispositivo({ usuarioId, children }: { usuarioId: string; children: ReactNode }) {
  const db = useSQLiteContext();
  const [estado, setEstado] = useState<'revisando' | 'preguntar' | 'listo'>('revisando');
  const [cantidad, setCantidad] = useState(0);

  useEffect(() => {
    (async () => {
      const dueño = await leerMeta(db, 'usuario_id');
      if (dueño === usuarioId) return setEstado('listo');
      if (dueño && dueño !== usuarioId) await vaciarLocal(db);
      const n = dueño ? 0 : await cantidadLocal(db);
      if (n > 0) {
        setCantidad(n);
        return setEstado('preguntar');
      }
      await vincular();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, usuarioId]);

  const vincular = async () => {
    await escribirMeta(db, 'usuario_id', usuarioId);
    await registrarEvento(db, 'ingreso_cuenta');
    setEstado('listo');
  };

  if (estado === 'listo') return <>{children}</>;
  if (estado === 'revisando') return <Cargando />;

  return (
    <View className="flex-1" style={{ backgroundColor: T.bg }}>
      <ModalOpciones
        titulo="Ya hay datos en este dispositivo"
        mensaje={`Tiene ${cantidad} registros cargados antes de entrar a tu cuenta (pueden ser los de ejemplo). ¿Qué hacemos con ellos?`}
        opciones={[
          { id: 'sumar', label: 'Sumarlos a mi cuenta', detalle: 'Suben a la nube junto con lo que ya tengas' },
          {
            id: 'descartar',
            label: 'Descartarlos',
            detalle: 'Quedan solo los datos de tu cuenta',
            destructiva: true,
          },
        ]}
        onElegir={async (id) => {
          setEstado('revisando');
          if (id === 'sumar') await encolarTodo(db);
          else await vaciarLocal(db);
          await vincular();
        }}
        // Sin decidir no se puede seguir: cancelar equivale a sumar, que no pierde nada.
        onCancelar={async () => {
          setEstado('revisando');
          await encolarTodo(db);
          await vincular();
        }}
      />
    </View>
  );
}

/** Después de tocar el link de "olvidé mi contraseña". */
function NuevaClave() {
  const { cambiarClave, salir } = useAuth();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const guardar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await cambiarClave(clave);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 justify-center p-4" style={{ backgroundColor: T.bg }}>
      <View
        className="rounded-2xl border p-5"
        style={{ width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: T.surface, borderColor: T.border, gap: 14 }}
      >
        <Text className="font-bold" style={{ color: T.text, fontSize: 19 }}>
          Elegí tu contraseña nueva
        </Text>
        <Field label="Contraseña nueva">
          <TextInput
            style={inputStyle}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={T.muted}
            value={clave}
            onChangeText={setClave}
            secureTextEntry
            autoComplete="new-password"
          />
        </Field>
        {error && <Text style={{ color: T.danger, fontSize: 15 }}>{error}</Text>}
        <Pressable
          onPress={guardar}
          disabled={ocupado || clave.length < 6}
          className="rounded-lg py-3 items-center"
          style={{ backgroundColor: T.primary, opacity: ocupado || clave.length < 6 ? 0.5 : 1 }}
        >
          <Text className="text-white font-semibold" style={{ fontSize: 16 }}>
            Guardar contraseña
          </Text>
        </Pressable>
        <Pressable onPress={salir} className="items-center">
          <Text style={{ color: T.muted, fontSize: 15 }}>Cancelar</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
