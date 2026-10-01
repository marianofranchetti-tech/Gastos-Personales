import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { RE_FECHA } from '../lib/format';
import { T } from '../lib/theme';
import { Field, inputStyle } from './Field';

/**
 * Borra los movimientos que caen fuera de un rango de fechas. Sirve para
 * limpiar una importación que trajo años de más hacia atrás o hacia adelante.
 *
 * Muestra cuántos se van antes de confirmar: "No se puede deshacer" sin un
 * número es una advertencia que nadie lee.
 */
export function ModalDepurar({ onClose }: { onClose: () => void }) {
  const { contarFuera, depurar } = useData();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [conteo, setConteo] = useState<{ antes: number; despues: number } | null>(null);
  const [hecho, setHecho] = useState<number | null>(null);

  const validas = RE_FECHA.test(desde) && RE_FECHA.test(hasta) && desde <= hasta;

  useEffect(() => {
    let vivo = true;
    setConteo(null);
    if (validas) contarFuera(desde, hasta).then((c) => vivo && setConteo(c));
    return () => {
      vivo = false;
    };
  }, [desde, hasta, validas, contarFuera]);

  const total = (conteo?.antes ?? 0) + (conteo?.despues ?? 0);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: T.overlay }} onPress={onClose}>
        <Pressable
          className="rounded-t-2xl px-5 pt-5 pb-8 border-t"
          style={{ width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: T.bg, borderColor: T.border, gap: 10 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-[17px] font-bold" style={{ color: T.text }}>
            Conservar solo un rango de fechas
          </Text>
          {hecho === null ? (
            <>
              <Text className="text-[15px]" style={{ color: T.muted }}>
                Se borran los gastos e ingresos que vencen antes de "Desde" o después de "Hasta". Las reglas
                recurrentes quedan. No se puede deshacer.
              </Text>
              <View className="flex-row" style={{ gap: 10 }}>
                <View className="flex-1">
                  <Field label="Desde">
                    <TextInput value={desde} onChangeText={setDesde} placeholder="AAAA-MM-DD" placeholderTextColor={T.muted} style={inputStyle} />
                  </Field>
                </View>
                <View className="flex-1">
                  <Field label="Hasta">
                    <TextInput value={hasta} onChangeText={setHasta} placeholder="AAAA-MM-DD" placeholderTextColor={T.muted} style={inputStyle} />
                  </Field>
                </View>
              </View>
              {conteo && (
                <Text className="text-[15px]" style={{ color: total > 0 ? T.danger : T.muted }}>
                  {total > 0
                    ? `Se borran ${total} movimientos: ${conteo.antes} anteriores y ${conteo.despues} posteriores.`
                    : 'No hay movimientos fuera de ese rango.'}
                </Text>
              )}
              <Pressable
                disabled={!validas || total === 0}
                onPress={async () => setHecho(await depurar(desde, hasta))}
                className="rounded-lg py-3 border"
                style={{ borderColor: T.danger, backgroundColor: T.surface, opacity: validas && total > 0 ? 1 : 0.4 }}
              >
                <Text className="text-center font-semibold text-[16px]" style={{ color: T.danger }}>
                  {total > 0 ? `Borrar ${total} movimientos` : 'Borrar'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text className="text-[15px]" style={{ color: T.text }}>
              Listo: se borraron {hecho} movimientos.
            </Text>
          )}
          <Pressable onPress={onClose} className="rounded-lg py-3" style={{ backgroundColor: T.surface2 }}>
            <Text className="text-center font-semibold text-[16px]" style={{ color: T.text }}>
              {hecho === null ? 'Cancelar' : 'Cerrar'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
