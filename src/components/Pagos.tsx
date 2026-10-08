import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useData } from '../db/DataProvider';
import { PagoInvalido, PagoVista } from '../db/queries';
import { diaLargo, fechaMov } from '../lib/calendario';
import { hoyISO } from '../lib/fechasRecurrentes';
import { aISO, aMonto, fmt } from '../lib/format';
import { T } from '../lib/theme';
import { Field, inputStyle } from './Field';
import { ModalOpciones } from './ModalOpciones';

const CENTAVO = 0.005;
/** 1234.5 -> '1234,5': lo que se precarga en el campo de monto. */
const aTexto = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
/** '2026-10-08' -> '08/10/2026'. */
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Cuánto de un concepto ya se pagó, como barra. */
export function BarraPagado({
  pagado,
  monto,
  alto = 4,
  color,
}: {
  pagado: number;
  monto: number;
  alto?: number;
  color?: string;
}) {
  const pct = monto > 0 ? Math.max(0, Math.min(100, (pagado / monto) * 100)) : 0;
  return (
    <View style={{ height: alto, borderRadius: alto, backgroundColor: T.border, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: alto, backgroundColor: color ?? T.teal }} />
    </View>
  );
}

/** El concepto leído en vivo de lo cargado: después de cada pago se actualiza solo. */
function useConcepto(id: number) {
  const { gastos, ingresos } = useData();
  return useMemo(
    () => gastos.find((t) => t.id === id) ?? ingresos.find((t) => t.id === id) ?? null,
    [gastos, ingresos, id]
  );
}

/**
 * Pagos (o cobros) de un concepto: cuánto va pagado, registrar uno nuevo y el
 * historial, con borrar. El concepto no cambia de fecha ni se divide: lo que
 * falta queda pendiente en el mismo vencimiento.
 *
 * El monto se precarga con el saldo, que es lo más común (pagar lo que falta);
 * se puede bajar para un pago parcial, pero no subir por encima del saldo.
 */
export function PanelPagos({ id }: { id: number }) {
  const { pagos, registrarPago, eliminarPago, despagar } = useData();
  const t = useConcepto(id);
  const historial = useMemo(() => pagos.filter((p) => p.transaccion_id === id), [pagos, id]);
  const saldo = t?.saldo ?? 0;

  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(() => ddmmaaaa(hoyISO()));
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<PagoVista | 'todos' | null>(null);

  // Cada vez que cambia el saldo (se registró o se borró un pago), el monto
  // vuelve a proponer lo que falta.
  useEffect(() => {
    setMonto(saldo > CENTAVO ? aTexto(saldo) : '');
    setError(null);
  }, [saldo]);

  if (!t) return null;

  const esG = t.tipo === 'gasto';
  const pago = esG ? 'pago' : 'cobro';
  const m = aMonto(monto);
  const f = aISO(fecha);
  const invalido = !(m > 0)
    ? 'Ingresá un monto mayor que cero.'
    : m > saldo + CENTAVO
      ? `No puede superar el saldo (${fmt(saldo, t.moneda)}).`
      : !f
        ? 'La fecha no es válida (DD/MM/AAAA).'
        : null;
  const aviso = error ?? (monto.trim() !== '' || fecha.trim().length >= 8 ? invalido : null);

  const registrar = async () => {
    if (invalido || !f || guardando) return;
    setGuardando(true);
    try {
      await registrarPago(id, { monto: m, fecha: f, nota });
      setNota('');
    } catch (e) {
      setError(e instanceof PagoInvalido ? e.message : `No se pudo registrar el ${pago}.`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {/* Progreso */}
      <View style={{ gap: 6 }}>
        <View className="flex-row justify-between items-baseline" style={{ gap: 8 }}>
          <Text style={{ color: T.text, fontSize: 15 }}>
            {esG ? 'Pagado' : 'Cobrado'} <Text style={{ fontWeight: '700' }}>{fmt(t.pagado, t.moneda)}</Text> de{' '}
            {fmt(t.monto, t.moneda)}
          </Text>
          <Text style={{ color: saldo > 0 ? T.warn : T.teal, fontSize: 14, fontWeight: '600' }}>
            {saldo > 0 ? `Falta ${fmt(saldo, t.moneda)}` : esG ? '✓ Pagado' : '✓ Cobrado'}
          </Text>
        </View>
        <BarraPagado pagado={t.pagado} monto={t.monto} alto={6} />
      </View>

      {/* Registrar */}
      {saldo > 0 && (
        <View>
          <View className="flex-row" style={{ gap: 10 }}>
            <View className="flex-1">
              <Field label="Monto">
                <TextInput
                  style={[inputStyle, aviso && invalido?.startsWith('No puede') ? { borderColor: T.danger } : null]}
                  keyboardType="decimal-pad"
                  value={monto}
                  onChangeText={(v) => {
                    setMonto(v);
                    setError(null);
                  }}
                  accessibilityLabel={`Monto del ${pago}`}
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label={esG ? 'Fecha de pago' : 'Fecha de cobro'}>
                <TextInput
                  style={inputStyle}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={T.muted}
                  value={fecha}
                  onChangeText={(v) => {
                    setFecha(v);
                    setError(null);
                  }}
                />
              </Field>
            </View>
          </View>
          <Field label="Nota (opcional)">
            <TextInput
              style={inputStyle}
              placeholder={esG ? 'Ej: transferencia, primera parte' : 'Ej: seña'}
              placeholderTextColor={T.muted}
              value={nota}
              onChangeText={setNota}
            />
          </Field>
          {aviso && (
            <Text className="mb-2" style={{ color: T.danger, fontSize: 14 }}>
              {aviso}
            </Text>
          )}
          <Pressable
            disabled={!!invalido || guardando}
            onPress={registrar}
            className="rounded-lg py-3"
            style={{ backgroundColor: invalido ? T.border : T.tealD, opacity: guardando ? 0.6 : 1 }}
            accessibilityRole="button"
          >
            <Text className="text-white font-semibold text-center" style={{ fontSize: 16 }}>
              {esG ? 'Registrar pago' : 'Registrar cobro'}
              {!invalido && m < saldo - CENTAVO ? ' parcial' : ''}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Historial */}
      <View style={{ gap: 6 }}>
        <Text className="font-semibold uppercase tracking-wide" style={{ color: T.muted, fontSize: 13 }}>
          {esG ? 'Pagos registrados' : 'Cobros registrados'}
        </Text>
        {historial.length === 0 && (
          <Text style={{ color: T.muted, fontSize: 14 }}>Todavía no hay {esG ? 'pagos' : 'cobros'}.</Text>
        )}
        {historial.map((p) => (
          <View
            key={p.id}
            className="flex-row items-center rounded-lg border px-3 py-2"
            style={{ backgroundColor: T.surface, borderColor: T.border, gap: 10 }}
          >
            <View className="flex-1">
              <Text style={{ color: T.text, fontSize: 15 }}>{diaLargo(p.fecha)}</Text>
              {(p.nota || p.legado === 1) && (
                <Text numberOfLines={2} style={{ color: T.muted, fontSize: 13 }}>
                  {p.legado === 1 ? `Marcado como ${esG ? 'pagado' : 'cobrado'}, sin detalle` : p.nota}
                </Text>
              )}
            </View>
            <Text style={{ color: T.text, fontSize: 15, fontWeight: '600' }}>{fmt(p.monto, t.moneda)}</Text>
            <Pressable
              onPress={() => setBorrando(p)}
              hitSlop={8}
              className="p-1.5 rounded"
              accessibilityLabel={`Borrar el ${pago} del ${diaLargo(p.fecha)}`}
            >
              <Trash2 size={16} color={T.danger} />
            </Pressable>
          </View>
        ))}
        {saldo === 0 && historial.length > 1 && (
          <Pressable onPress={() => setBorrando('todos')} className="py-2">
            <Text className="text-center" style={{ color: T.danger, fontSize: 14, fontWeight: '600' }}>
              Volver a pendiente (borra los {historial.length} {esG ? 'pagos' : 'cobros'})
            </Text>
          </Pressable>
        )}
      </View>

      {borrando && (
        <ModalOpciones
          titulo={borrando === 'todos' ? 'Volver a pendiente' : `Borrar este ${pago}`}
          mensaje={
            borrando === 'todos'
              ? `Se borran todos los ${esG ? 'pagos' : 'cobros'} de ${t.nombre}: queda pendiente por ${fmt(t.monto, t.moneda)}.`
              : `${fmt(borrando.monto, t.moneda)} del ${diaLargo(borrando.fecha)}. Vuelve a quedar en el saldo de ${t.nombre}, en el mismo vencimiento.`
          }
          opciones={[{ id: 'si', label: borrando === 'todos' ? 'Volver a pendiente' : `Borrar ${pago}`, destructiva: true }]}
          onElegir={async () => {
            const b = borrando;
            setBorrando(null);
            // El pago implícito de una versión vieja no existe como fila: se despaga el concepto.
            if (b === 'todos' || b.legado === 1) await despagar(id);
            else await eliminarPago(b.id);
          }}
          onCancelar={() => setBorrando(null)}
        />
      )}
    </View>
  );
}

/** Hoja con los pagos de un concepto: se abre desde el ✓ de la tarjeta o la fila. */
export function ModalPagos({ id, onClose }: { id: number; onClose: () => void }) {
  const t = useConcepto(id);
  if (!t) return null;
  const esG = t.tipo === 'gasto';
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: T.overlay }} onPress={onClose}>
        <Pressable
          className="rounded-t-2xl px-5 pt-5 pb-8 max-h-[88%] border-t"
          style={{ width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: T.bg, borderColor: T.border }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row justify-between items-start mb-3" style={{ gap: 8 }}>
            <View className="flex-1">
              <Text className="text-[18px] font-bold" style={{ color: T.text }} numberOfLines={2}>
                {t.nombre}
              </Text>
              <Text style={{ color: T.muted, fontSize: 14 }}>
                {esG ? 'Vence' : 'Esperado'} {diaLargo(fechaMov(t))} · Total {fmt(t.monto, t.moneda)}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Cerrar">
              <Text className="text-2xl leading-none px-2" style={{ color: T.muted }}>
                ×
              </Text>
            </Pressable>
          </View>
          <ScrollView>
            <PanelPagos id={id} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
