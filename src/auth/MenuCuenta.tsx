import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useData } from '../db/DataProvider';
import { T } from '../lib/theme';
import { cantidadPendientes, vaciarLocal } from '../sync/motor';
import { registrarEvento } from '../sync/eventos';
import type { EstadoSync } from '../sync/useSincronizacion';
import { ModalOpciones } from '../components/ModalOpciones';
import { useAuth } from './AuthProvider';

const TEXTO_ESTADO: Record<EstadoSync, string> = {
  apagado: 'Sin sincronizar',
  sincronizando: 'Sincronizando…',
  al_dia: 'Sincronizado',
  sin_conexion: 'Sin conexión: se sube cuando vuelva',
  error: 'No se pudo sincronizar',
};

function colorEstado(e: EstadoSync, pendientes: number) {
  if (e === 'error') return T.danger;
  if (e === 'sin_conexion' || pendientes > 0) return T.warn;
  if (e === 'al_dia') return T.teal;
  return T.muted;
}

function haceCuanto(d: Date | null): string {
  if (!d) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  return `a las ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Botón de cuenta para el encabezado, con el menú que abre. Nada si no hay cuentas. */
export function MenuCuenta({ conTexto = false }: { conTexto?: boolean }) {
  const db = useSQLiteContext();
  const { habilitado, sesion, salir } = useAuth();
  const { sync } = useData();
  const [abierto, setAbierto] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState<number | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  if (!habilitado || !sesion) return null;

  const meta = sesion.user.user_metadata ?? {};
  const nombre: string = meta.full_name || meta.name || meta.nombre || sesion.user.email || 'Mi cuenta';
  const foto: string | undefined = meta.avatar_url || meta.picture;
  const inicial = nombre.trim().charAt(0).toUpperCase();
  const punto = colorEstado(sync.estado, sync.pendientes);

  const cerrarSesion = async (forzar = false) => {
    setSaliendo(true);
    try {
      await registrarEvento(db, 'salida_cuenta');
      // Se intenta subir todo antes de vaciar: lo que no suba, se pierde.
      await sync.sincronizarAhora();
      const quedan = await cantidadPendientes(db);
      if (quedan > 0 && !forzar) {
        setConfirmarSalida(quedan);
        return;
      }
      await vaciarLocal(db);
      await salir();
    } finally {
      setSaliendo(false);
    }
  };

  const Avatar = ({ tam }: { tam: number }) =>
    foto ? (
      <Image source={{ uri: foto }} style={{ width: tam, height: tam, borderRadius: tam / 2 }} />
    ) : (
      <View className="items-center justify-center" style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: T.primary }}>
        <Text className="text-white font-bold" style={{ fontSize: tam * 0.45 }}>
          {inicial}
        </Text>
      </View>
    );

  return (
    <>
      <Pressable
        onPress={() => setAbierto(true)}
        className="flex-row items-center"
        style={{ gap: 8 }}
        accessibilityLabel={`Cuenta de ${nombre}. ${TEXTO_ESTADO[sync.estado]}`}
      >
        <View>
          <Avatar tam={30} />
          <View
            className="absolute rounded-full border-2"
            style={{ width: 11, height: 11, right: -1, bottom: -1, backgroundColor: punto, borderColor: T.surface }}
          />
        </View>
        {conTexto && (
          <Text numberOfLines={1} style={{ color: T.text, fontSize: 14, maxWidth: 140 }}>
            {nombre}
          </Text>
        )}
      </Pressable>

      {abierto && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setAbierto(false)}>
          <Pressable className="flex-1 justify-end" style={{ backgroundColor: T.overlay }} onPress={() => setAbierto(false)}>
            <Pressable
              className="rounded-t-2xl px-5 pt-5 pb-8 border-t"
              style={{ width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: T.bg, borderColor: T.border, gap: 14 }}
              onPress={(e) => e.stopPropagation()}
            >
              <View className="flex-row items-center" style={{ gap: 12 }}>
                <Avatar tam={44} />
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-bold" style={{ color: T.text, fontSize: 17 }}>
                    {nombre}
                  </Text>
                  {sesion.user.email && sesion.user.email !== nombre && (
                    <Text numberOfLines={1} style={{ color: T.muted, fontSize: 14 }}>
                      {sesion.user.email}
                    </Text>
                  )}
                </View>
              </View>

              <View className="rounded-lg border px-4 py-3" style={{ backgroundColor: T.surface, borderColor: T.border, gap: 4 }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <View className="rounded-full" style={{ width: 9, height: 9, backgroundColor: punto }} />
                  <Text className="font-semibold" style={{ color: T.text, fontSize: 15 }}>
                    {TEXTO_ESTADO[sync.estado]}
                    {sync.estado === 'al_dia' && sync.ultima ? ` ${haceCuanto(sync.ultima)}` : ''}
                  </Text>
                </View>
                {sync.pendientes > 0 && (
                  <Text style={{ color: T.muted, fontSize: 14 }}>
                    {sync.pendientes === 1 ? '1 cambio sin subir' : `${sync.pendientes} cambios sin subir`}
                  </Text>
                )}
                {sync.estado === 'error' && sync.error && (
                  <Text style={{ color: T.muted, fontSize: 13 }}>{sync.error}</Text>
                )}
              </View>

              <Pressable
                onPress={() => sync.sincronizarAhora()}
                disabled={sync.estado === 'sincronizando'}
                className="rounded-lg py-3 items-center"
                style={{ backgroundColor: T.surface2, opacity: sync.estado === 'sincronizando' ? 0.6 : 1 }}
              >
                <Text className="font-semibold" style={{ color: T.text, fontSize: 16 }}>
                  Sincronizar ahora
                </Text>
              </Pressable>

              <Pressable
                onPress={() => cerrarSesion()}
                disabled={saliendo}
                className="rounded-lg py-3 items-center border"
                style={{ borderColor: T.danger }}
              >
                {saliendo ? (
                  <ActivityIndicator color={T.danger} />
                ) : (
                  <Text className="font-semibold" style={{ color: T.danger, fontSize: 16 }}>
                    Cerrar sesión
                  </Text>
                )}
              </Pressable>
              <Text style={{ color: T.muted, fontSize: 13 }}>
                Al cerrar sesión se borran los datos de este dispositivo. Siguen en tu cuenta.
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {confirmarSalida != null && (
        <ModalOpciones
          titulo="Hay cambios sin subir"
          mensaje={`${confirmarSalida === 1 ? 'Un cambio no pudo' : `${confirmarSalida} cambios no pudieron`} subir a la nube (¿sin conexión?). Si cerrás sesión ahora, se pierden.`}
          opciones={[{ id: 'salir', label: 'Cerrar sesión igual', detalle: 'Se pierden los cambios sin subir', destructiva: true }]}
          onElegir={() => {
            setConfirmarSalida(null);
            cerrarSesion(true);
          }}
          onCancelar={() => setConfirmarSalida(null)}
        />
      )}
    </>
  );
}
