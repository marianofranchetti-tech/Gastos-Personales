import { Modal, Pressable, Text, View } from 'react-native';
import { T } from '../lib/theme';

export type Opcion = {
  id: string;
  label: string;
  /** Una línea explicando la consecuencia. Sin esto el usuario adivina. */
  detalle?: string;
  destructiva?: boolean;
};

/**
 * Hoja de opciones para decisiones que no se pueden deshacer.
 *
 * Existe en vez de `Alert.alert` porque Alert no renderiza en react-native-web
 * y esta app también corre en el navegador. De paso mantiene la estética.
 */
export function ModalOpciones({
  titulo,
  mensaje,
  opciones,
  onElegir,
  onCancelar,
}: {
  titulo: string;
  mensaje?: string;
  opciones: Opcion[];
  onElegir: (id: string) => void;
  onCancelar: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancelar}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: T.overlay }}
        onPress={onCancelar}
      >
        <Pressable
          className="rounded-t-2xl px-5 pt-5 pb-8 border-t"
          style={{ width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: T.bg, borderColor: T.border, gap: 10 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-[17px] font-bold" style={{ color: T.text }}>
            {titulo}
          </Text>
          {mensaje && (
            <Text className="text-[16px]" style={{ color: T.muted }}>
              {mensaje}
            </Text>
          )}

          <View style={{ gap: 8 }} className="mt-1">
            {opciones.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => onElegir(o.id)}
                className="rounded-lg px-4 py-3 border"
                style={{
                  backgroundColor: T.surface,
                  borderColor: o.destructiva ? T.danger : T.border,
                }}
              >
                <Text
                  className="font-semibold text-[16px]"
                  style={{ color: o.destructiva ? T.danger : T.text }}
                >
                  {o.label}
                </Text>
                {o.detalle && (
                  <Text className="text-[14px] mt-0.5" style={{ color: T.muted }}>
                    {o.detalle}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onCancelar} className="rounded-lg py-3 mt-1" style={{ backgroundColor: T.surface2 }}>
            <Text className="text-center font-semibold text-[16px]" style={{ color: T.text }}>
              Cancelar
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Las dos opciones de alcance sobre un movimiento que viene de una regla. */
export const OPCIONES_ALCANCE: Opcion[] = [
  { id: 'solo', label: 'Solo este movimiento', detalle: 'Los demás meses quedan como están' },
  { id: 'adelante', label: 'Este y los que vienen', detalle: 'Actualiza la regla; lo ya pagado no se toca' },
];
