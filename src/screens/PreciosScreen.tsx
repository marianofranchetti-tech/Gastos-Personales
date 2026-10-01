import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Field, inputStyle } from '../components/Field';
import { ModalOpciones } from '../components/ModalOpciones';
import { CATS, MONEDA_DEFAULT } from '../lib/categorias';
import { CAT_ICONS } from '../lib/iconos';
import { diaCorto, fechaISO, fmt, hoy, iso } from '../lib/format';
import { T } from '../lib/theme';
import { NuevoPrecio, ResumenProducto } from '../db/precios';

/**
 * Registro de precios. No toca el balance: acá se anota cuánto salió algo y
 * dónde, para poder comparar después. Con inflación alta, la serie propia de
 * lo que pagaste vale más que cualquier índice.
 */
export function PreciosScreen() {
  const { precios, abrirPrecio } = useData();

  return (
    <ScrollView
      className="flex-1 px-4 mt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingBottom: 96 }}
    >
      <Text className="font-bold" style={{ color: T.text, fontSize: 16 }}>
        Precios registrados
      </Text>

      {precios.length === 0 ? (
        <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <Text style={{ color: T.muted, fontSize: 15 }}>
            Todavía no anotaste ningún precio. Tocá el + y cargá un producto con
            su comercio: con dos registros del mismo producto ya vas a ver cuánto
            varió y dónde conviene comprarlo.
          </Text>
        </View>
      ) : (
        precios.map((p) => <FilaPrecio key={p.producto} p={p} onEdit={abrirPrecio} />)
      )}
    </ScrollView>
  );
}

function FilaPrecio({ p, onEdit }: { p: ResumenProducto; onEdit: (p: ResumenProducto) => void }) {
  const cat = CATS.find((c) => c.id === p.categoria_id);
  const Icono = cat ? CAT_ICONS[cat.id] : null;
  const subio = p.variacion != null && p.variacion > 0;

  return (
    <Pressable
      onPress={() => onEdit(p)}
      className="rounded-lg px-4 py-3 border"
      style={{ backgroundColor: T.surface, borderColor: T.border, gap: 6 }}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-2">
          <Text className="font-medium" style={{ color: T.text, fontSize: 16 }} numberOfLines={2}>
            {p.producto}
          </Text>
        </View>
        <View className="items-end">
          <Text className="font-semibold" style={{ color: T.text, fontSize: 17 }}>
            {fmt(p.ultimo, p.moneda)}
          </Text>
          {p.variacion != null && (
            <Text style={{ color: subio ? T.danger : T.teal, fontSize: 14 }}>
              {subio ? '↑' : '↓'} {Math.abs(p.variacion)}%
            </Text>
          )}
        </View>
      </View>

      {/* Comercio, categoría y fecha: es el contexto que hace útil al precio. */}
      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <Dato texto={p.comercio} />
        {cat && <Dato texto={cat.nombre} Icono={Icono} color={cat.color} />}
        <Dato texto={diaCorto(p.fecha)} />
      </View>

      {p.registros > 1 && (
        <Text style={{ color: T.muted, fontSize: 13 }}>
          {p.registros} registros · más barato en {p.comercioMasBarato} a {fmt(p.minimo, p.moneda)}
        </Text>
      )}
    </Pressable>
  );
}

function Dato({ texto, Icono, color }: { texto: string; Icono?: any; color?: string }) {
  return (
    <View
      className="flex-row items-center rounded px-2 py-0.5"
      style={{ backgroundColor: T.surface2, gap: 4 }}
    >
      {Icono && <Icono size={13} strokeWidth={1.8} color={color ?? T.muted} />}
      <Text style={{ color: T.muted, fontSize: 13 }}>{texto}</Text>
    </View>
  );
}

/** Alta y edición de un precio. Con `inicial` entra en modo edición. */
export function PrecioForm({
  inicial,
  onClose,
}: {
  inicial?: ResumenProducto;
  onClose: () => void;
}) {
  const { guardarPrecio, eliminarPrecio } = useData();
  const editando = !!inicial;

  const [producto, setProducto] = useState(inicial?.producto ?? '');
  const [precio, setPrecio] = useState(inicial ? String(inicial.ultimo) : '');
  const [comercio, setComercio] = useState(inicial?.comercio ?? '');
  const [cat, setCat] = useState<string | null>(inicial?.categoria_id ?? 'comida');
  const [fecha, setFecha] = useState(inicial?.fecha ?? iso(hoy()));
  const [confirmando, setConfirmando] = useState(false);

  const fechaOk = !!fechaISO(fecha);
  const ok = producto.trim().length > 0 && Number(precio) > 0 && comercio.trim().length > 0 && fechaOk;

  const guardar = async () => {
    const p: NuevoPrecio = {
      producto: producto.trim(),
      precio: Number(precio),
      moneda: inicial?.moneda ?? MONEDA_DEFAULT,
      comercio: comercio.trim(),
      categoria_id: cat,
      fecha,
    };
    await guardarPrecio(p, inicial?.id);
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
            <Text className="font-bold" style={{ color: T.text, fontSize: 20 }}>
              {editando ? 'Editar precio' : 'Anotar un precio'}
            </Text>
            <Pressable onPress={onClose}>
              <Text className="leading-none px-2" style={{ color: T.muted, fontSize: 26 }}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Field label="Producto o servicio">
              <TextInput
                style={inputStyle}
                placeholder="Ej: Aceite girasol 1.5L"
                placeholderTextColor={T.muted}
                value={producto}
                onChangeText={setProducto}
              />
            </Field>
            <Field label="Precio">
              <TextInput
                style={inputStyle}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={T.muted}
                value={precio}
                onChangeText={setPrecio}
              />
            </Field>
            <Field label="Comercio">
              <TextInput
                style={inputStyle}
                placeholder="Ej: Súper del barrio"
                placeholderTextColor={T.muted}
                value={comercio}
                onChangeText={setComercio}
              />
            </Field>
            <Field label="Categoría">
              <View className="flex-row flex-wrap gap-2">
                {CATS.map((c) => {
                  const activa = cat === c.id;
                  const Icono = CAT_ICONS[c.id];
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setCat(c.id)}
                      className="items-center rounded-lg py-2 border"
                      style={{
                        width: '31%',
                        backgroundColor: activa ? T.primary : T.surface2,
                        borderColor: activa ? T.primary : T.border,
                        gap: 2,
                      }}
                    >
                      {Icono && <Icono size={18} strokeWidth={1.8} color={activa ? '#fff' : c.color} />}
                      <Text style={{ color: activa ? '#fff' : T.muted, fontSize: 13 }} numberOfLines={1}>
                        {c.nombre.split(' ')[0]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
            <Field label="Fecha">
              <TextInput
                style={[inputStyle, !fechaOk && { borderColor: T.danger }]}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={T.muted}
                value={fecha}
                onChangeText={setFecha}
              />
            </Field>

            <Pressable
              disabled={!ok}
              onPress={guardar}
              className="rounded-lg py-3 mt-2"
              style={{ backgroundColor: ok ? T.primary : T.border }}
            >
              <Text className="text-white font-semibold text-center" style={{ fontSize: 16 }}>
                {editando ? 'Guardar cambios' : 'Guardar precio'}
              </Text>
            </Pressable>

            {editando && (
              <Pressable onPress={() => setConfirmando(true)} className="py-3 mt-1">
                <Text className="text-center font-semibold" style={{ color: T.danger, fontSize: 15 }}>
                  Eliminar este registro
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>

      {confirmando && inicial && (
        <ModalOpciones
          titulo="Eliminar el registro"
          mensaje={`Se borra el precio de "${inicial.producto}" del ${diaCorto(inicial.fecha)}. Los otros registros del mismo producto quedan.`}
          opciones={[{ id: 'ok', label: 'Eliminar', destructiva: true }]}
          onElegir={async () => {
            setConfirmando(false);
            await eliminarPrecio(inicial.id);
            onClose();
          }}
          onCancelar={() => setConfirmando(false)}
        />
      )}
    </Modal>
  );
}
