import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Chip } from '../components/Chip';
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
  const { precios } = useData();

  return (
    <ScrollView
      className="flex-1 px-4 mt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingBottom: 96 }}
    >
      <Text className="text-sm font-bold" style={{ color: T.text }}>
        Precios registrados
      </Text>

      {precios.length === 0 ? (
        <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <Text className="text-sm" style={{ color: T.muted }}>
            Todavía no anotaste ningún precio. Tocá el + y cargá un producto con
            su comercio: con dos registros del mismo producto ya vas a ver cuánto
            varió y dónde conviene comprarlo.
          </Text>
        </View>
      ) : (
        precios.map((p) => <FilaPrecio key={p.producto} p={p} />)
      )}
    </ScrollView>
  );
}

function FilaPrecio({ p }: { p: ResumenProducto }) {
  const subio = p.variacion != null && p.variacion > 0;

  return (
    <View className="rounded-lg px-4 py-3 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-2">
          <Text className="font-medium" style={{ color: T.text }} numberOfLines={1}>
            {p.producto}
          </Text>
          <Text className="text-xs mt-0.5" style={{ color: T.muted }}>
            {p.comercio} · {diaCorto(p.fecha)}
          </Text>
        </View>
        <View className="items-end">
          <Text className="font-semibold" style={{ color: T.text }}>
            {fmt(p.ultimo, p.moneda)}
          </Text>
          {p.variacion != null && (
            <Text className="text-[11px]" style={{ color: subio ? T.danger : T.teal }}>
              {subio ? '↑' : '↓'} {Math.abs(p.variacion)}%
            </Text>
          )}
        </View>
      </View>

      {p.registros > 1 && (
        <Text className="text-[11px] mt-1.5" style={{ color: T.muted }}>
          {p.registros} registros · más barato en {p.comercioMasBarato} a {fmt(p.minimo, p.moneda)}
        </Text>
      )}
    </View>
  );
}

/** Alta de un precio. Producto, precio, comercio, categoría y fecha. */
export function PrecioForm({ onClose }: { onClose: () => void }) {
  const { guardarPrecio } = useData();
  const [producto, setProducto] = useState('');
  const [precio, setPrecio] = useState('');
  const [comercio, setComercio] = useState('');
  const [cat, setCat] = useState<string | null>('comida');
  const [fecha, setFecha] = useState(iso(hoy));

  const fechaOk = !!fechaISO(fecha);
  const ok =
    producto.trim().length > 0 && Number(precio) > 0 && comercio.trim().length > 0 && fechaOk;

  const guardar = async () => {
    const p: NuevoPrecio = {
      producto: producto.trim(),
      precio: Number(precio),
      moneda: MONEDA_DEFAULT,
      comercio: comercio.trim(),
      categoria_id: cat,
      fecha,
    };
    await guardarPrecio(p);
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
              Anotar un precio
            </Text>
            <Pressable onPress={onClose}>
              <Text className="text-2xl leading-none px-2" style={{ color: T.muted }}>×</Text>
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
              <Text className="text-white font-semibold text-center">Guardar precio</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
