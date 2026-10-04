import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react-native';
import { TransaccionVista } from '../db/queries';
import { TipoTx } from '../lib/categorias';
import {
  conceptos,
  diaLargo,
  diaMesCorto,
  EstadoVista,
  estadoVista,
  fechaMov,
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
import { ModalOpciones } from './ModalOpciones';

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
 * Dos vistas: Calendario (grilla de 7 columnas) y Lista (semana por semana).
 * Arranca en Calendario en la PC y en Lista en el teléfono, donde siete
 * columnas en 360 px dejan leer poco; el usuario elige.
 *
 * En Calendario las tarjetas se arrastran a otro día (`onMover`). Con mouse,
 * arrastrar directo; con el dedo, mantener apretado y después arrastrar, para
 * no pelearse con el scroll.
 *
 * Si se pasa `mes`, el mes lo maneja la pantalla (filtro único) y el
 * calendario no muestra su propia navegación.
 */
export function CalendarioMovimientos({
  items,
  tipo,
  onToggle,
  onEdit,
  mes: mesControlado,
  onMover,
  onArrastrando,
}: {
  items: TransaccionVista[];
  tipo: TipoTx;
  onToggle: (id: number) => void;
  onEdit?: (t: TransaccionVista) => void;
  /** 'YYYY-MM'. Si viene, el mes lo controla la pantalla. */
  mes?: string;
  /** Soltar una tarjeta en otro día. Sin esto no se puede arrastrar. */
  onMover?: (t: TransaccionVista, fecha: string) => void;
  /** Avisa cuando empieza/termina un arrastre (para frenar el scroll). */
  onArrastrando?: (activo: boolean) => void;
}) {
  const { pc } = useLayout();
  const hoy = hoyISO();
  const [mesPropio, setMes] = useState(hoy.slice(0, 7));
  const mes = mesControlado ?? mesPropio;
  const [vista, setVista] = useState<'calendario' | 'lista'>(pc ? 'calendario' : 'lista');
  const [confirmar, setConfirmar] = useState<TransaccionVista | null>(null);
  const dnd = useArrastre(onMover, onArrastrando);
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
    <View style={{ gap: 10 }} ref={dnd.raiz} collapsable={false}>
      {/* Mes (solo si la pantalla no lo maneja) */}
      {mesControlado == null && (
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
      )}

      {/* Vista */}
      <View className="flex-row rounded-md p-0.5 self-start" style={{ backgroundColor: T.surface2 }}>
        {(
          [
            { id: 'calendario', nombre: 'Calendario', Icono: CalendarDays },
            { id: 'lista', nombre: 'Lista', Icono: List },
          ] as const
        ).map(({ id, nombre, Icono }) => {
          const on = vista === id;
          return (
            <Pressable
              key={id}
              onPress={() => setVista(id)}
              className="flex-row items-center px-3 py-1.5 rounded"
              style={{ backgroundColor: on ? T.primary : 'transparent', gap: 6 }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Icono size={16} color={on ? '#fff' : T.muted} />
              <Text style={{ color: on ? '#fff' : T.muted, fontSize: 14, fontWeight: on ? '600' : '500' }}>{nombre}</Text>
            </Pressable>
          );
        })}
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

      {vista === 'calendario' ? (
        <View className="rounded-lg border overflow-hidden" style={{ borderColor: T.border, backgroundColor: T.surface }}>
          {onMover && (
            <Text className="px-2 pt-1.5" style={{ color: T.muted, fontSize: 12 }}>
              {punteroFino
                ? 'Arrastrá una tarjeta a otro día para cambiarle la fecha.'
                : 'Mantené apretada una tarjeta y arrastrala a otro día para cambiarle la fecha.'}
            </Text>
          )}
          <View className="flex-row border-b" style={{ borderColor: T.border, backgroundColor: T.surface2 }}>
            {DIAS_SEMANA.map((d) => (
              <Text key={d} className="flex-1 text-center py-1.5" style={{ color: T.muted, fontSize: pc ? 13 : 11, fontWeight: '600' }}>
                {pc ? d : d.charAt(0)}
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
                    const esDestino = dnd.destino === d;
                    return (
                      <View
                        key={d}
                        ref={(r) => {
                          dnd.celdas.current[d] = r;
                        }}
                        collapsable={false}
                        className="flex-1"
                        style={{
                          minHeight: pc ? 84 : 64,
                          minWidth: 0,
                          padding: pc ? 4 : 2,
                          borderLeftWidth: i === 0 ? 0 : 1,
                          borderColor: T.border,
                          backgroundColor: esDestino
                            ? T.surface2
                            : fuera
                              ? T.bg
                              : esHoy
                                ? T.primaryBadgeBg
                                : 'transparent',
                          outlineStyle: esDestino ? 'dashed' : undefined,
                          outlineWidth: esDestino ? 2 : undefined,
                          outlineColor: esDestino ? T.primary : undefined,
                          outlineOffset: esDestino ? -2 : undefined,
                          gap: 3,
                        } as object}
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
                            compacta={!pc}
                            onEdit={onEdit}
                            onToggle={() => setConfirmar(t)}
                            arrastrando={dnd.arrastre?.t.id === t.id}
                            onIniciarArrastre={onMover ? dnd.iniciar : undefined}
                            onMoverArrastre={dnd.mover}
                            onSoltar={dnd.soltar}
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
                      <Fila key={t.id} t={t} onToggle={() => setConfirmar(t)} onEdit={onEdit} />
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {/* La tarjeta que sigue al puntero mientras se arrastra */}
      {dnd.arrastre && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: dnd.arrastre.w,
            zIndex: 50,
            transform: dnd.pos.getTranslateTransform(),
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <MiniTarjeta
            t={dnd.arrastre.t}
            color={colorEstado[estadoVista(dnd.arrastre.t, hoy)]}
            compacta={!pc}
            onToggle={() => {}}
          />
        </Animated.View>
      )}

      {confirmar && (
        <ModalOpciones
          titulo={
            confirmar.estado === 'pagado'
              ? '¿Volver a pendiente?'
              : tipo === 'gasto'
                ? '¿Marcar como pagado?'
                : '¿Marcar como cobrado?'
          }
          mensaje={`${confirmar.nombre} · ${fmt(confirmar.monto, confirmar.moneda)} · ${diaLargo(fechaMov(confirmar))}`}
          opciones={[
            {
              id: 'si',
              label:
                confirmar.estado === 'pagado'
                  ? 'Sí, pasar a pendiente'
                  : tipo === 'gasto'
                    ? 'Sí, marcar como pagado'
                    : 'Sí, marcar como cobrado',
              detalle:
                confirmar.estado === 'pagado'
                  ? 'Se borra la fecha de pago registrada'
                  : 'Se registra con fecha de hoy',
            },
          ]}
          onElegir={() => {
            onToggle(confirmar.id);
            setConfirmar(null);
          }}
          onCancelar={() => setConfirmar(null)}
        />
      )}
    </View>
  );
}

type Rect = { x: number; y: number; w: number; h: number };
type Arrastre = { t: TransaccionVista; w: number; dx: number; dy: number };

/**
 * Arrastrar y soltar entre días. Al empezar se miden todas las celdas en
 * coordenadas de ventana; cada movimiento busca la celda bajo el puntero.
 * Medir una vez por arrastre (y no en cada movimiento) mantiene esto liviano.
 */
function useArrastre(
  onMover?: (t: TransaccionVista, fecha: string) => void,
  onArrastrando?: (activo: boolean) => void
) {
  const raiz = useRef<View>(null);
  const celdas = useRef<Record<string, View | null>>({});
  const rects = useRef<Record<string, Rect>>({});
  const origen = useRef({ x: 0, y: 0 });
  const actual = useRef<Arrastre | null>(null);
  const destinoRef = useRef<string | null>(null);
  const pos = useRef(new Animated.ValueXY()).current;
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [destino, setDestino] = useState<string | null>(null);

  const buscar = (x: number, y: number) => {
    for (const [d, r] of Object.entries(rects.current)) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return d;
    }
    return null;
  };

  const ubicar = (x: number, y: number) => {
    const a = actual.current;
    if (!a) return;
    pos.setValue({ x: x - origen.current.x - a.dx, y: y - origen.current.y - a.dy });
    const d = buscar(x, y);
    if (d !== destinoRef.current) {
      destinoRef.current = d;
      setDestino(d);
    }
  };

  const iniciar = (t: TransaccionVista, tarjeta: Rect, x: number, y: number) => {
    const a = { t, w: tarjeta.w, dx: x - tarjeta.x, dy: y - tarjeta.y };
    actual.current = a;
    rects.current = {};
    for (const [d, v] of Object.entries(celdas.current)) {
      v?.measureInWindow((cx, cy, w, h) => {
        rects.current[d] = { x: cx, y: cy, w, h };
      });
    }
    raiz.current?.measureInWindow((rx, ry) => {
      origen.current = { x: rx, y: ry };
      ubicar(x, y);
    });
    setArrastre(a);
    onArrastrando?.(true);
  };

  const soltar = (cancelado = false) => {
    const a = actual.current;
    const d = destinoRef.current;
    actual.current = null;
    destinoRef.current = null;
    setArrastre(null);
    setDestino(null);
    onArrastrando?.(false);
    if (!cancelado && a && d && d !== fechaMov(a.t)) onMover?.(a.t, d);
  };

  return { raiz, celdas, pos, arrastre, destino, iniciar, mover: ubicar, soltar };
}

/** Puntero fino (mouse/trackpad): se arrastra directo, sin mantener apretado. */
const punteroFino =
  Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

function MiniTarjeta({
  t,
  color,
  compacta = false,
  onEdit,
  onToggle,
  arrastrando = false,
  onIniciarArrastre,
  onMoverArrastre,
  onSoltar,
}: {
  t: TransaccionVista;
  color: string;
  compacta?: boolean;
  onEdit?: (t: TransaccionVista) => void;
  onToggle: () => void;
  arrastrando?: boolean;
  onIniciarArrastre?: (t: TransaccionVista, tarjeta: Rect, x: number, y: number) => void;
  onMoverArrastre?: (x: number, y: number) => void;
  onSoltar?: (cancelado?: boolean) => void;
}) {
  const pagado = t.estado === 'pagado';
  const ref = useRef<View>(null);
  // Con el dedo, el arrastre se arma con una pulsación larga.
  const armado = useRef(false);
  const activo = useRef(false);
  const habilitado = !!onIniciarArrastre;

  const empezar = (x: number, y: number) => {
    activo.current = true;
    ref.current?.measureInWindow((cx, cy, w, h) => onIniciarArrastre?.(t, { x: cx, y: cy, w, h }, x, y));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          habilitado && (armado.current || (punteroFino && Math.abs(g.dx) + Math.abs(g.dy) > 6)),
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          habilitado && (armado.current || (punteroFino && Math.abs(g.dx) + Math.abs(g.dy) > 6)),
        onPanResponderGrant: (_e, g) => {
          if (!activo.current) empezar(g.x0, g.y0);
        },
        onPanResponderMove: (_e, g) => onMoverArrastre?.(g.moveX, g.moveY),
        onPanResponderRelease: () => {
          armado.current = false;
          activo.current = false;
          onSoltar?.();
        },
        onPanResponderTerminate: () => {
          armado.current = false;
          activo.current = false;
          onSoltar?.(true);
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habilitado, t, onIniciarArrastre, onMoverArrastre, onSoltar]
  );

  return (
    <View ref={ref} collapsable={false} {...(habilitado ? pan.panHandlers : {})} style={{ opacity: arrastrando ? 0.35 : 1 }}>
      <Pressable
        onPress={onEdit ? () => onEdit(t) : undefined}
        onLongPress={
          habilitado
            ? (e) => {
                armado.current = true;
                empezar(e.nativeEvent.pageX, e.nativeEvent.pageY);
              }
            : undefined
        }
        onPressOut={() => {
          // Pulsación larga sin mover: se suelta en el mismo lugar.
          if (armado.current && activo.current) {
            armado.current = false;
            activo.current = false;
            onSoltar?.(true);
          }
        }}
        delayLongPress={350}
        className="rounded"
        style={
          {
            paddingHorizontal: compacta ? 3 : 6,
            paddingVertical: compacta ? 2 : 4,
            backgroundColor: T.surface2,
            borderLeftWidth: 3,
            borderLeftColor: color,
            opacity: pagado ? 0.75 : 1,
            cursor: habilitado ? 'grab' : undefined,
            userSelect: 'none',
          } as object
        }
      >
        <View className="flex-row items-center" style={{ gap: 4 }}>
          {!compacta && (
            <Pressable
              onPress={onToggle}
              accessibilityLabel={pagado ? 'Marcar como pendiente' : 'Marcar como pagado'}
              hitSlop={6}
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: color,
                backgroundColor: pagado ? color : 'transparent',
              }}
            />
          )}
          <Text numberOfLines={1} className="flex-1" style={{ color: T.text, fontSize: compacta ? 10 : 12 }}>
            {t.nombre}
          </Text>
        </View>
        <Text numberOfLines={1} style={{ color: T.text, fontSize: compacta ? 10 : 12, fontWeight: '600' }}>
          {compacta ? fmtCorto(t.monto) : fmt(t.monto, t.moneda)}
        </Text>
      </Pressable>
    </View>
  );
}

/** $1.600.000 -> 1,6M; $320.000 -> 320k. Para celdas de 50 px. */
function fmtCorto(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
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
    <View className="flex-row flex-wrap items-center justify-end px-2 py-1" style={{ columnGap: 12, backgroundColor: T.bg }}>
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
