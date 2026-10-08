import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Repetido } from '../lib/calendario';
import { etiquetaPeriodo } from '../lib/periodo';
import { hoyISO } from '../lib/fechasRecurrentes';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';

/**
 * Conceptos con el mismo nombre más de una vez en un mismo mes ("EPEC · 2"):
 * casi siempre una deuda cargada en partes, de antes de que existieran los
 * pagos parciales. Solo los lista: unificarlos es una decisión del usuario.
 */
export function ModalRepetidos({ items, onClose }: { items: Repetido[]; onClose: () => void }) {
  const hoy = hoyISO();
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: T.overlay }} onPress={onClose}>
        <Pressable
          className="rounded-t-2xl px-5 pt-5 pb-8 max-h-[88%] border-t"
          style={{ width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: T.bg, borderColor: T.border, gap: 10 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-[17px] font-bold" style={{ color: T.text }}>
            Conceptos repetidos en un mismo mes
          </Text>
          <Text className="text-[15px]" style={{ color: T.muted }}>
            Mismo nombre, varias tarjetas en el mismo mes. Si son partes de una sola deuda, ahora se pueden cargar
            como un concepto con pagos parciales. No se cambió nada.
          </Text>
          <ScrollView>
            <View style={{ gap: 6 }}>
              {items.map((r) => (
                <View
                  key={`${r.tipo}|${r.nombre}|${r.mes}`}
                  className="flex-row items-center rounded-lg border px-3 py-2"
                  style={{ backgroundColor: T.surface, borderColor: T.border, gap: 10 }}
                >
                  <View className="flex-1">
                    <Text style={{ color: T.text, fontSize: 15 }} numberOfLines={1}>
                      {r.nombre} · {r.cantidad}
                    </Text>
                    <Text style={{ color: T.muted, fontSize: 13 }}>
                      {r.tipo === 'gasto' ? 'Gasto' : 'Ingreso'} · {etiquetaPeriodo('mes', `${r.mes}-01`, hoy)}
                    </Text>
                  </View>
                  <Text style={{ color: T.text, fontSize: 15, fontWeight: '600' }}>{fmt(r.total)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Pressable onPress={onClose} className="rounded-lg py-3" style={{ backgroundColor: T.surface2 }}>
            <Text className="text-center font-semibold text-[16px]" style={{ color: T.text }}>
              Cerrar
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
