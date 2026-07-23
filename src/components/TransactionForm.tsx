import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Chip } from './Chip';
import { Field, inputStyle } from './Field';
import { CATS, CATS_ING, PERIODOS, Periodo, TipoTx } from '../lib/categorias';
import { CAT_ICONS } from '../lib/iconos';
import { fechaISO, hoy, iso } from '../lib/format';
import { T } from '../lib/theme';
import { Estado } from '../db/types';
import { NuevaTransaccion } from '../db/queries';

export function TransactionForm({
  tipo,
  onSave,
  onClose,
}: {
  tipo: TipoTx;
  onSave: (t: NuevaTransaccion) => void;
  onClose: () => void;
}) {
  const esG = tipo === 'gasto';
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const [cat, setCat] = useState(esG ? 'comida' : 'salario');
  const [fecha, setFecha] = useState(iso(hoy));
  const [rec, setRec] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('mensual');
  const [fijo, setFijo] = useState(true);
  const [estado, setEstado] = useState<Estado>('pendiente');
  const [venc, setVenc] = useState(iso(hoy));

  const cats = esG ? CATS : CATS_ING;
  const fechaValida = !!fechaISO(fecha);
  const pideVenc = esG || rec;
  const vencValido = !pideVenc || !!fechaISO(venc);
  const ok = nombre.trim().length > 0 && Number(monto) > 0 && fechaValida && vencValido;

  const guardar = () => {
    onSave({
      tipo,
      nombre: nombre.trim(),
      monto: Number(monto),
      categoria_id: cat,
      fecha,
      rec,
      periodo: rec ? periodo : undefined,
      fijo: esG ? fijo : undefined,
      estado,
      venc: esG || rec ? venc : undefined,
    });
    onClose();
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,.6)' }} onPress={onClose}>
        <Pressable
          className="rounded-t-2xl px-5 pt-5 pb-8 max-h-[88%] border-t"
          style={{ backgroundColor: T.bg, borderColor: T.border }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-bold" style={{ color: T.text }}>
              {esG ? 'Nuevo gasto' : 'Nuevo ingreso'}
            </Text>
            <Pressable onPress={onClose}>
              <Text className="text-2xl leading-none px-2" style={{ color: T.muted }}>
                ×
              </Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Field label="Nombre del concepto">
              <TextInput
                style={inputStyle}
                placeholder={esG ? 'Ej: Supermercado' : 'Ej: Sueldo'}
                placeholderTextColor={T.muted}
                value={nombre}
                onChangeText={setNombre}
              />
            </Field>
            <Field label="Monto">
              <TextInput
                style={inputStyle}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={T.muted}
                value={monto}
                onChangeText={setMonto}
              />
            </Field>
            <Field label="Categoría">
              <View className="flex-row flex-wrap gap-2">
                {cats.map((c) => {
                  const activa = cat === c.id;
                  const Icono = CAT_ICONS[c.id];
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCat(c.id)}
                      className="items-center rounded-lg py-2 border"
                      style={{
                        width: '18%',
                        backgroundColor: activa ? T.primary : T.surface2,
                        borderColor: activa ? T.primary : T.border,
                        gap: 2,
                      }}
                    >
                      {Icono && <Icono size={18} strokeWidth={1.8} color={activa ? '#fff' : c.color} />}
                      <Text className="text-[10px] leading-tight" style={{ color: activa ? '#fff' : T.muted }}>
                        {c.nombre.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            <Field label={esG ? 'Fecha del gasto' : 'Fecha del ingreso'}>
              <TextInput
                style={[inputStyle, !fechaValida && { borderColor: T.danger }]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={T.muted}
                value={fecha}
                onChangeText={setFecha}
              />
            </Field>
            <Field label="Clasificación">
              <View className="flex-row gap-2">
                <Chip on={!rec} onPress={() => setRec(false)}>
                  Eventual
                </Chip>
                <Chip on={rec} onPress={() => setRec(true)}>
                  Recurrente
                </Chip>
              </View>
            </Field>
            {rec && (
              <>
                <Field label="Período">
                  <View className="flex-row flex-wrap gap-2">
                    {PERIODOS.map((p) => (
                      <Chip key={p.id} on={periodo === p.id} onPress={() => setPeriodo(p.id)}>
                        {p.nombre}
                      </Chip>
                    ))}
                  </View>
                </Field>
                {esG && (
                  <Field label="Tipo de monto">
                    <View className="flex-row gap-2">
                      <Chip on={fijo} onPress={() => setFijo(true)}>
                        Fijo
                      </Chip>
                      <Chip on={!fijo} onPress={() => setFijo(false)}>
                        Variable
                      </Chip>
                    </View>
                  </Field>
                )}
              </>
            )}
            {esG && (
              <>
                <Field label="Fecha de vencimiento del pago">
                  <TextInput
                    style={[inputStyle, !vencValido && { borderColor: T.danger }]}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={T.muted}
                    value={venc}
                    onChangeText={setVenc}
                  />
                </Field>
                <Field label="Estado del pago">
                  <View className="flex-row gap-2">
                    <Chip on={estado === 'pendiente'} onPress={() => setEstado('pendiente')}>
                      Pendiente
                    </Chip>
                    <Chip on={estado === 'pagado'} onPress={() => setEstado('pagado')}>
                      Pagado
                    </Chip>
                  </View>
                </Field>
              </>
            )}
            {!esG && (
              <>
                {rec && (
                  <Field label="Fecha esperada del ingreso">
                    <TextInput
                      style={[inputStyle, !vencValido && { borderColor: T.danger }]}
                      placeholder="AAAA-MM-DD"
                      placeholderTextColor={T.muted}
                      value={venc}
                      onChangeText={setVenc}
                    />
                  </Field>
                )}
                <Field label="Estado del cobro">
                  <View className="flex-row gap-2">
                    <Chip on={estado === 'pendiente'} onPress={() => setEstado('pendiente')}>
                      Pendiente
                    </Chip>
                    <Chip on={estado === 'pagado'} onPress={() => setEstado('pagado')}>
                      Cobrado
                    </Chip>
                  </View>
                </Field>
              </>
            )}

            <Pressable
              disabled={!ok}
              onPress={guardar}
              className="rounded-lg py-3 mt-2"
              style={{ backgroundColor: ok ? T.primary : T.border }}
            >
              <Text className="text-white font-semibold text-center">Guardar {esG ? 'gasto' : 'ingreso'}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
