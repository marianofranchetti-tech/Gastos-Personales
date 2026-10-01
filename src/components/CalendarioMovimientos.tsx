import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { TransaccionVista } from '../db/queries';
import { TipoTx } from '../lib/categorias';
import {
  conceptos,
  diaLargo,
  diaMesCorto,
  EstadoVista,
  estadoVista,
  FiltroEstado,
  filtrarMovs,
  porDia,
  semanasDelMes,
  sumarMes,
  totales,
} from '../lib/calendario';
import { etiquetaPeriodo } from '../lib/periodo';
import { finDeMesISO, hoyISO } from '../lib/fechasRecurrentes';
import { fmt } from '../lib/format';
import { useLayout } from '../lib/layout';
import { T } from '../lib/theme';
import { Fila } from './Fila';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Movimientos en un calendario mensual, semana por semana.
 *
 * - Cada movimiento cae en su día de vencimiento (o su fecha si no vence).
 * - Las flechas recorren meses hacia atrás y hacia adelante: lo ya pagado de
 *   meses anteriores se ve igual que lo que viene.
 * - Los totales del mes son también el filtro por estado.
 * - Los chips de conceptos filtran un gasto puntual; el filtro se mantiene al
 *   cambiar de mes, para seguir "el alquiler" mes a mes.
 *
 * En la PC es una grilla de 7 columnas; en el teléfono, una lista por semana
 * (siete columnas en 360 px no dejan leer nada).
 */
export function CalendarioMovimientos({
  items,
  tipo,
  onToggle,
  onEdit,
}: {
  items: TransaccionVista[];
  tipo: TipoTx;
  onToggle: (id: number) => void;
  onEdit?: (t: TransaccionVista) => void;
}) {
  const { pc } = useLayout();
  const hoy = hoyISO();
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [concepto, setConcepto] = useState<string | null>(null);

  const desde = `${mes}-01`;
  const hasta = finDeMesISO(desde);

  const delMes = useMemo(
    () => filtrarMovs(items, { desde, hasta, estado: 'todos', concepto: null, hoy }),
    [items, desde, hasta, hoy]
  );
  // Los totales respetan el concepto elegido; los chips de concepto, el estado.
  const tot = useMemo(
    () => totales(concepto ? delMes.filter((t) => t.nombre === concepto) : delMes, hoy),
    [delMes, concepto, hoy]
  );
  const listaConceptos = useMemo(
    () => conceptos(estado === 'todos' ? delMes : delMes.filter((t) => estadoVista(t, hoy) === estado)),
    [delMes, estado, hoy]
  );
  const visibles = useMemo(
    () => filtrarMovs(delMes, { desde, hasta, estado, concepto, hoy }),
    [delMes, desde, hasta, estado, concepto, hoy]
  );
  const dias = useMemo(() => porDia(visibles), [visibles]);
  const semanas = useMemo(() => semanasDelMes(mes), [mes]);

  const etiquetaMes = etiquetaPeriodo('mes', desde, hoy);
  const nombres = {
    pagado: tipo === 'gasto' ? 'Pagados' : 'Cobrados',
    pendiente: 'Pendientes',
    vencido: tipo === 'gasto' ? 'Vencidos' : 'Atrasados',
  };
  const colorEstado: Record<EstadoVista, string> = { pagado: T.teal, pendiente: T.warn, vencido: T.danger };

  return (
    <View style={{ gap: 10 }}>
      {/* Mes */}
      <View
        className="flex-row items-center justify-between rounded-lg border p-2"
        style={{ backgroundColor: T.surface, borderColor: T.border }}
      >
        <Pressable onPress={() => setMes((m) => sumarMes(m, -1))} className="p-1.5 rounded" accessibilityLabel="Mes anterior">
          <ChevronLeft size={20} color={T.text} />
        </Pressable>
        <Pressable onPress={() => setMes(hoy.slice(0, 7))} className="flex-1 items-center">
          <Text className="font-semibold" style={{ color: T.text, fontSize: 15 }}>
            {etiquetaMes.charAt(0).toUpperCase() + etiquetaMes.slice(1)}
          </Text>
          {mes !== hoy.slice(0, 7) && (
            <Text style={{ color: T.muted, fontSize: 12 }}>Tocá para volver a hoy</Text>
          )}
        </Pressable>
        <Pressable onPress={() => setMes((m) => sumarMes(m, 1))} className="p-1.5 rounded" accessibilityLabel="Mes siguiente">
          <ChevronRight size={20} color={T.text} />
        </Pressable>
      </View>

      {/* Totales = filtro por estado */}
      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        <PillEstado
          on={estado === 'todos'}
          color={T.text}
          texto="Todos"
          monto={fmt(tot.todos)}
          onPress={() => setEstado('todos')}
        />
        {(['pendiente', 'vencido', 'pagado'] as EstadoVista[]).map((e) => (
          <PillEstado
            key={e}
            on={estado === e}
            color={colorEstado[e]}
            texto={nombres[e]}
            monto={fmt(tot[e])}
            onPress={() => setEstado(estado === e ? 'todos' : e)}
          />
        ))}
      </View>

      {/* Conceptos */}
      {listaConceptos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <ChipConcepto on={concepto === null} texto="Todos los conceptos" onPress={() => setConcepto(null)} />
          {concepto && !listaConceptos.some((c) => c.nombre === concepto) && (
            <ChipConcepto on texto={`${concepto} · 0`} onPress={() => setConcepto(null)} />
          )}
          {listaConceptos.map((c) => (
            <ChipConcepto
              key={c.nombre}
              on={concepto === c.nombre}
              texto={c.cantidad > 1 ? `${c.nombre} · ${c.cantidad}` : c.nombre}
              onPress={() => setConcepto(concepto === c.nombre ? null : c.nombre)}
            />
          ))}
        </ScrollView>
      )}

      {visibles.length === 0 && (
        <Text style={{ color: T.muted, fontSize: 15 }}>
          {delMes.length === 0 ? 'Sin movimientos en este mes.' : 'Nada con estos filtros en este mes.'}
        </Text>
      )}

      {pc ? (
        <View className="rounded-lg border overflow-hidden" style={{ borderColor: T.border, backgroundColor: T.surface }}>
          <View className="flex-row border-b" style={{ borderColor: T.border, backgroundColor: T.surface2 }}>
            {DIAS_SEMANA.map((d) => (
              <Text key={d} className="flex-1 text-center py-1.5" style={{ color: T.muted, fontSize: 13, fontWeight: '600' }}>
                {d}
              </Text>
            ))}
          </View>
          {semanas.map((s) => {
            const movsSemana = s.dias.flatMap((d) => (d.slice(0, 7) === mes ? dias[d] ?? [] : []));
            const ts = totales(movsSemana, hoy);
            return (
              <View key={s.desde} className="border-b" style={{ borderColor: T.border }}>
                <View className="flex-row">
                  {s.dias.map((d, i) => {
                    const fuera = d.slice(0, 7) !== mes;
                    const esHoy = d === hoy;
                    const lista = fuera ? [] : dias[d] ?? [];
                    return (
                      <View
                        key={d}
                        className="flex-1 p-1"
                        style={{
                          minHeight: 84,
                          borderLeftWidth: i === 0 ? 0 : 1,
                          borderColor: T.border,
                          backgroundColor: fuera ? T.bg : esHoy ? T.primaryBadgeBg : 'transparent',
                          gap: 3,
                        }}
                      >
                        <Text
                          style={{
                            color: fuera ? T.border : esHoy ? T.primaryLight : T.muted,
                            fontSize: 12,
                            fontWeight: esHoy ? '700' : '500',
                          }}
                        >
                          {Number(d.slice(8, 10))}
                        </Text>
                        {lista.map((t) => (
                          <MiniTarjeta
                            key={t.id}
                            t={t}
                            color={colorEstado[estadoVista(t, hoy)]}
                            onEdit={onEdit}
                            onToggle={onToggle}
                          />
                        ))}
                      </View>
                    );
                  })}
                </View>
                {movsSemana.length > 0 && <TotalSemana ts={ts} nombres={nombres} desde={s.desde} hasta={s.hasta} />}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {semanas.map((s) => {
            const diasConMovs = s.dias.filter((d) => d.slice(0, 7) === mes && (dias[d]?.length ?? 0) > 0);
            const movsSemana = diasConMovs.flatMap((d) => dias[d]);
            const ts = totales(movsSemana, hoy);
            const esActual = s.desde <= hoy && hoy <= s.hasta;
            return (
              <View
                key={s.desde}
                className="rounded-lg border p-3"
                style={{ borderColor: esActual ? T.primary : T.border, backgroundColor: T.surface, gap: 8 }}
              >
                <View className="flex-row items-baseline justify-between">
                  <Text className="font-bold" style={{ color: T.text, fontSize: 15 }}>
                    {esActual ? 'Esta semana' : `${diaMesCorto(s.desde)} – ${diaMesCorto(s.hasta)}`}
                  </Text>
                  {movsSemana.length > 0 && (
                    <Text className="font-semibold" style={{ color: T.text, fontSize: 14 }}>
                      {tipo === 'gasto' ? '−' : '+'}
                      {fmt(ts.todos)}
                    </Text>
                  )}
                </View>
                {movsSemana.length > 0 ? (
                  <ResumenSemana ts={ts} nombres={nombres} />
                ) : (
                  <Text style={{ color: T.muted, fontSize: 14 }}>Sin movimientos.</Text>
                )}
                {diasConMovs.map((d) => (
                  <View key={d} style={{ gap: 6 }}>
                    <Text
                      className="uppercase tracking-wide"
                      style={{ color: d === hoy ? T.primaryLight : T.muted, fontSize: 12, fontWeight: '700' }}
                    >
                      {d === hoy ? `Hoy · ${diaLargo(d)}` : diaLargo(d)}
                    </Text>
                    {dias[d].map((t) => (
                      <Fila key={t.id} t={t} onToggle={onToggle} onEdit={onEdit} />
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MiniTarjeta({
  t,
  color,
  onEdit,
  onToggle,
}: {
  t: TransaccionVista;
  color: string;
  onEdit?: (t: TransaccionVista) => void;
  onToggle: (id: number) => void;
}) {
  const pagado = t.estado === 'pagado';
  return (
    <Pressable
      onPress={onEdit ? () => onEdit(t) : undefined}
      className="rounded px-1.5 py-1"
      style={{ backgroundColor: T.surface2, borderLeftWidth: 3, borderLeftColor: color, opacity: pagado ? 0.75 : 1 }}
    >
      <View className="flex-row items-center" style={{ gap: 4 }}>
        <Pressable
          onPress={() => onToggle(t.id)}
          accessibilityLabel={pagado ? 'Marcar como pendiente' : 'Marcar como pagado'}
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: color,
            backgroundColor: pagado ? color : 'transparent',
          }}
        />
        <Text numberOfLines={1} className="flex-1" style={{ color: T.text, fontSize: 12 }}>
          {t.nombre}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ color: T.text, fontSize: 12, fontWeight: '600' }}>
        {fmt(t.monto, t.moneda)}
      </Text>
    </Pressable>
  );
}

function ResumenSemana({ ts, nombres }: { ts: ReturnType<typeof totales>; nombres: Record<EstadoVista, string> }) {
  const partes: { txt: string; color: string }[] = [];
  if (ts.pagado) partes.push({ txt: `${nombres.pagado} ${fmt(ts.pagado)}`, color: T.teal });
  if (ts.vencido) partes.push({ txt: `${nombres.vencido} ${fmt(ts.vencido)}`, color: T.danger });
  if (ts.pendiente) partes.push({ txt: `${nombres.pendiente} ${fmt(ts.pendiente)}`, color: T.warn });
  return (
    <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
      {partes.map((p) => (
        <Text key={p.txt} style={{ color: p.color, fontSize: 13 }}>
          {p.txt}
        </Text>
      ))}
    </View>
  );
}

function TotalSemana({
  ts,
  nombres,
  desde,
  hasta,
}: {
  ts: ReturnType<typeof totales>;
  nombres: Record<EstadoVista, string>;
  desde: string;
  hasta: string;
}) {
  return (
    <View className="flex-row items-center justify-end px-2 py-1" style={{ gap: 12, backgroundColor: T.bg }}>
      <Text style={{ color: T.muted, fontSize: 12 }}>
        {diaMesCorto(desde)} – {diaMesCorto(hasta)}
      </Text>
      <ResumenSemana ts={ts} nombres={nombres} />
      <Text style={{ color: T.text, fontSize: 12, fontWeight: '700' }}>Total {fmt(ts.todos)}</Text>
    </View>
  );
}

function PillEstado({
  on,
  color,
  texto,
  monto,
  onPress,
}: {
  on: boolean;
  color: string;
  texto: string;
  monto: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-md border px-3 py-1.5"
      style={{ borderColor: on ? color : T.border, backgroundColor: on ? T.surface2 : T.surface, minWidth: 110 }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={{ color: on ? color : T.muted, fontSize: 13, fontWeight: '600' }}>{texto}</Text>
      <Text style={{ color: T.text, fontSize: 15, fontWeight: '700' }}>{monto}</Text>
    </Pressable>
  );
}

function ChipConcepto({ on, texto, onPress }: { on: boolean; texto: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="px-3 py-1.5 rounded-full border"
      style={{ backgroundColor: on ? T.primary : T.surface2, borderColor: on ? T.primary : T.border }}
    >
      <Text numberOfLines={1} style={{ color: on ? '#fff' : T.muted, fontSize: 13, fontWeight: '500' }}>
        {texto}
      </Text>
    </Pressable>
  );
}
