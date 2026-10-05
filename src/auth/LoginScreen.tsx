import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useSQLiteContext } from 'expo-sqlite';
import { Check } from 'lucide-react-native';
import { Field, inputStyle } from '../components/Field';
import { APP_NAME, T } from '../lib/theme';
import { useTema } from '../lib/TemaProvider';
import { escribirMeta } from '../sync/motor';
import { mensajeDeError, useAuth } from './AuthProvider';

type Modo = 'entrar' | 'crear' | 'recuperar';

/**
 * Pantalla de ingreso. Se entra con Google o con mail y contraseña; desde acá
 * también se crea la cuenta y se pide el link para recuperar la contraseña.
 */
export function LoginScreen() {
  const db = useSQLiteContext();
  const { modo: tema } = useTema();
  const { entrarConGoogle, entrarConMail, crearCuenta, recuperarClave } = useAuth();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [nombre, setNombre] = useState('');
  const [acepto, setAcepto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const mailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  /** Corre una acción mostrando la ruedita y traduciendo el error. */
  const intentar = async (fn: () => Promise<void>) => {
    setError(null);
    setAviso(null);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  };

  /** El consentimiento se guarda local y sube al perfil en la primera sincronización. */
  const guardarAceptacion = () => escribirMeta(db, 'acepto_terminos_en', new Date().toISOString());

  const pedirAceptacion = () => {
    if (acepto) return true;
    setError('Para seguir tenés que aceptar cómo se usan tus datos.');
    return false;
  };

  const google = () => {
    if (!pedirAceptacion()) return;
    intentar(async () => {
      await guardarAceptacion();
      await entrarConGoogle();
    });
  };

  const conMail = () => {
    if (modo === 'recuperar') {
      intentar(async () => {
        await recuperarClave(email);
        setAviso('Si hay una cuenta con ese mail, te llegó un link para elegir una contraseña nueva.');
      });
      return;
    }
    if (!pedirAceptacion()) return;
    intentar(async () => {
      await guardarAceptacion();
      if (modo === 'entrar') {
        await entrarConMail(email, clave);
      } else {
        const lista = await crearCuenta(email, clave, nombre);
        if (!lista) {
          setAviso('Te mandamos un mail para confirmar la cuenta. Tocá el link y volvé a entrar.');
          setModo('entrar');
        }
      }
    });
  };

  const puedeEnviar =
    !ocupado && mailOk && (modo === 'recuperar' || clave.length >= 6) && (modo !== 'crear' || nombre.trim().length > 0);

  const titulo = modo === 'entrar' ? 'Entrá a tu cuenta' : modo === 'crear' ? 'Creá tu cuenta' : 'Recuperá tu contraseña';
  const textoBoton = modo === 'entrar' ? 'Entrar' : modo === 'crear' ? 'Crear cuenta' : 'Mandame el link';

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: T.bg }} edges={['top', 'bottom']}>
      <StatusBar style={tema === 'oscuro' ? 'light' : 'dark'} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: 20 }}>
            <View className="items-center" style={{ gap: 10 }}>
              <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: T.primary }}>
                <Text className="font-bold text-white" style={{ fontSize: 30 }}>₲</Text>
              </View>
              <Text className="font-bold" style={{ color: T.text, fontSize: 26 }}>
                {APP_NAME}
              </Text>
              <Text className="text-center" style={{ color: T.muted, fontSize: 16 }}>
                Tus gastos en el teléfono y en la compu, siempre iguales.
              </Text>
            </View>

            <View className="rounded-2xl border p-5" style={{ backgroundColor: T.surface, borderColor: T.border, gap: 14 }}>
              <Text className="font-bold" style={{ color: T.text, fontSize: 19 }}>
                {titulo}
              </Text>

              {modo !== 'recuperar' && (
                <>
                  <Pressable
                    onPress={google}
                    disabled={ocupado}
                    className="flex-row items-center justify-center rounded-lg border py-3"
                    style={{ gap: 10, backgroundColor: T.surface2, borderColor: T.border, opacity: ocupado ? 0.6 : 1 }}
                    accessibilityRole="button"
                  >
                    <Text className="font-bold" style={{ color: '#4285F4', fontSize: 18 }}>G</Text>
                    <Text className="font-semibold" style={{ color: T.text, fontSize: 16 }}>
                      Continuar con Google
                    </Text>
                  </Pressable>

                  <View className="flex-row items-center" style={{ gap: 10 }}>
                    <View className="flex-1" style={{ height: 1, backgroundColor: T.border }} />
                    <Text style={{ color: T.muted, fontSize: 14 }}>o con tu mail</Text>
                    <View className="flex-1" style={{ height: 1, backgroundColor: T.border }} />
                  </View>
                </>
              )}

              <View>
                {modo === 'crear' && (
                  <Field label="Nombre">
                    <TextInput
                      style={inputStyle}
                      placeholder="Cómo te llamamos"
                      placeholderTextColor={T.muted}
                      value={nombre}
                      onChangeText={setNombre}
                      autoComplete="name"
                    />
                  </Field>
                )}
                <Field label="Mail">
                  <TextInput
                    style={inputStyle}
                    placeholder="vos@mail.com"
                    placeholderTextColor={T.muted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                  />
                </Field>
                {modo !== 'recuperar' && (
                  <Field label="Contraseña">
                    <TextInput
                      style={inputStyle}
                      placeholder={modo === 'crear' ? 'Mínimo 6 caracteres' : '••••••'}
                      placeholderTextColor={T.muted}
                      value={clave}
                      onChangeText={setClave}
                      secureTextEntry
                      autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
                      textContentType={modo === 'crear' ? 'newPassword' : 'password'}
                      onSubmitEditing={() => puedeEnviar && conMail()}
                    />
                  </Field>
                )}
              </View>

              {modo !== 'recuperar' && (
                <Pressable
                  onPress={() => setAcepto((a) => !a)}
                  className="flex-row items-start"
                  style={{ gap: 10 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acepto }}
                >
                  <View
                    className="w-5 h-5 rounded items-center justify-center border mt-0.5"
                    style={{ borderColor: acepto ? T.primary : T.border, backgroundColor: acepto ? T.primary : 'transparent' }}
                  >
                    {acepto && <Check size={14} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text className="flex-1" style={{ color: T.muted, fontSize: 14, lineHeight: 20 }}>
                    Acepto que {APP_NAME} guarde mis movimientos en la nube para sincronizarlos entre mis
                    dispositivos, y que use datos de uso y estadísticas de mis finanzas para mejorar la app.
                  </Text>
                </Pressable>
              )}

              {error && (
                <Text className="rounded-lg px-3 py-2" style={{ color: T.danger, backgroundColor: T.dangerBg, fontSize: 15 }}>
                  {error}
                </Text>
              )}
              {aviso && (
                <Text className="rounded-lg px-3 py-2" style={{ color: T.teal, backgroundColor: T.tealBg, fontSize: 15 }}>
                  {aviso}
                </Text>
              )}

              <Pressable
                onPress={conMail}
                disabled={!puedeEnviar}
                className="rounded-lg py-3 items-center"
                style={{ backgroundColor: T.primary, opacity: puedeEnviar ? 1 : 0.5 }}
                accessibilityRole="button"
              >
                {ocupado ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold" style={{ fontSize: 16 }}>
                    {textoBoton}
                  </Text>
                )}
              </Pressable>

              <View style={{ gap: 8 }} className="items-center">
                {modo === 'entrar' && (
                  <>
                    <Enlace onPress={() => setModo('crear')}>¿No tenés cuenta? Creá una</Enlace>
                    <Enlace onPress={() => setModo('recuperar')}>Olvidé mi contraseña</Enlace>
                  </>
                )}
                {modo !== 'entrar' && <Enlace onPress={() => setModo('entrar')}>Ya tengo cuenta: entrar</Enlace>}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Enlace({ onPress, children }: { onPress: () => void; children: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link">
      <Text style={{ color: T.primaryLight, fontSize: 15, fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}
