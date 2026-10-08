import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react-native';
import { TransaccionVista } from '../db/queries';
import { TipoTx } from '../lib/categorias';
import {
  conceptos,
  diaLargo,
  enFiltro,
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
import { BarraPagado, ModalPagos } from './Pagos';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Movimientos en un calendario mensual, semana por semana.
 *
 * - Cada movimiento cae en su día de vencimiento (o su fecha si no vence).
 * - Las flechas recorren meses hacia atrás y hacia adelante: lo ya pagado de
 *   meses anteriores se ve igual que lo que viene.
 * - Los totales del mes son también el filtro por estado. Pendientes y
 *   Vencidos suman saldo; Pagados, lo pagado (parciales incluidos).
 * - Cada concepto es UNA tarjeta en su vencimiento: los pagos parciales no la
 *   dividen ni la mueven. El ✓ abre sus pagos (registrar, historial, borrar).
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
  onEdit,
  mes: mesControlado,
  onMover,
  onArrastrando,
}: {
  items: TransaccionVista[];
  tipo: TipoTx;
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
  // Concepto con la hoja de pagos abierta.
  const [pagando, setPagando] = useState<TransaccionVista | null>(null);
  const dnd = useArrastre(onMover, onArrastrando);
  // Con el dedo no se arrastra: se elige la tarjeta (pulsación larga) y después
  // se toca el día de destino. Arrastrar en celdas de 50 px peleándose con el
  // scroll y la selección de texto del navegador no funcionaba en el teléfono.
  const [moviendo, setMoviendo] = useState<TransaccionVista | null>(null);
  const moverA = (d: string) => {
    if (!moviendo || !onMover) return;
    if (d !== fechaMov(moviendo)) onMover(moviendo, d);
    setMoviendo(null);
  };
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
    () => conceptos(delMes.filter((t) => enFiltro(t, estado, hoy))),
    [delMes, estado, hoy]
  );
  const visibles = useMemo(
    () => filtrarMovs(delMes, { desde, hasta, estado, concepto, hoy }),
    [delMes, desde, hasta, estado, concepto, hoy]
  );
  const dias = useMemo(() => porDia(visibles), [visibles]);
  const semanas = useMemo(() => semanasDelMes(mes), [mes]);

  const etiquetaMes = etiquetaPeriodo('mes', desde, hoy);
  const nombres: Record<EstadoVista, string> = {
    pagado: tipo === 'gasto' ? 'Pagados' : 'Cobrados',
    parcial: 'Parciales',
    pendiente: 'Pendientes',
    vencido: tipo === 'gasto' ? 'Vencidos' : 'Atrasados',
  };
  const colorEstado: Record<EstadoVista, string> = {
    pagado: T.teal,
    parcial: T.primaryLight,
    pendiente: T.warn,
    vencido: T.danger,
  };

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
        {/* Parciales muestra lo que les falta (su saldo). */}
        {(['pendiente', 'vencido', 'parcial', 'pagado'] as EstadoVista[]).map((e) => (
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
          {onMover && !moviendo && (
            <Text className="px-2 pt-1.5" style={{ color: T.muted, fontSize: 12 }}>
              {punteroFino
                ? 'Arrastrá una tarjeta a otro día para cambiarle la fecha.'
                : 'Mantené apretada una tarjeta y arrastrala a otro día. Si la soltás sin mover, tocá el día al que la querés pasar.'}
            </Text>
          )}
          {moviendo && (
            <View
              className="flex-row items-center justify-between px-2 py-1.5"
              style={{ backgroundColor: T.primaryBadgeBg, gap: 8 }}
            >
              <Text numberOfLines={2} className="flex-1" style={{ color: T.text, fontSize: 13 }} selectable={false}>
                Moviendo <Text style={{ fontWeight: '700' }}>{moviendo.nombre}</Text>: tocá el día de destino.
              </Text>
              <Pressable
                onPress={() => setMoviendo(null)}
                className="px-2.5 py-1 rounded"
                style={{ backgroundColor: T.surface2 }}
                accessibilityLabel="Cancelar el cambio de fecha"
              >
                <Text style={{ color: T.text, fontSize: 13, fontWeight: '600' }}>Cancelar</Text>
              </Pressable>
            </View>
          )}
          <View className="flex-row border-b" style={{ borderColor: T.border, backgroundColor: T.surface2 }}>
            {DIAS_SEMANA.map((d) => (
              <Text key={d} className="flex-1 text-center py-1.5" style={{ color: T.muted, fontSize: pc ? 13 : 11, fontWeight: '600' }}>
                {pc ? d : d.charAt(0)}
              </Text>
            ))}
          </View>
          {semanas.map((s) => {
            // Sin desglose por semana: en la grilla, el total del mes ya está
            // arriba (las píldoras de estado) y la fila extra solo agregaba ruido.
            return (
              <View key={s.desde} className="border-b" style={{ borderColor: T.border }}>
                <View className="flex-row">
                  {s.dias.map((d, i) => {
                    const fuera = d.slice(0, 7) !== mes;
                    const esHoy = d === hoy;
                    const lista = fuera ? [] : dias[d] ?? [];
                    const esDestino = dnd.destino === d || (!!moviendo && !fuera);
                    return (
                      <Pressable
                        key={d}
                        disabled={!moviendo || fuera}
                        onPress={() => moverA(d)}
                        accessibilityLabel={moviendo && !fuera ? `Pasar al ${Number(d.slice(8, 10))}` : undefined}
                        ref={(r) => {
                          // Solo los días del mes visible aceptan tarjetas: soltar
                          // en un día gris la haría desaparecer de la vista.
                          dnd.celdas.current[d] = fuera ? null : r;
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
                          outlineWidth: esDestino ? (moviendo ? 1 : 2) : undefined,
                          outlineColor: esDestino ? T.primary : undefined,
                          outlineOffset: esDestino ? -2 : undefined,
                          gap: 3,
                          userSelect: 'none',
                          WebkitTouchCallout: 'none',
                        } as object}
                      >
                        <Text
                          selectable={false}
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
                            onToggle={() => setPagando(t)}
                            arrastrando={dnd.arrastre?.t.id === t.id}
                            onIniciarArrastre={onMover ? dnd.iniciar : undefined}
                            onMoverArrastre={dnd.mover}
                            onSoltar={dnd.soltar}
                            elegida={moviendo?.id === t.id}
                            onElegir={onMover && !punteroFino ? setMoviendo : undefined}
                            onTocarEnModo={moviendo ? () => moverA(d) : undefined}
                          />
                        ))}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        // Lista plana del mes, día por día. Sin agrupar por semana: el total del
        // mes ya está en las píldoras de arriba.
        <View style={{ gap: 14 }}>
          {Object.keys(dias)
            .filter((d) => d.slice(0, 7) === mes && dias[d].length > 0)
            .sort()
            .map((d) => (
              <View key={d} style={{ gap: 6 }}>
                <Text
                  className="uppercase tracking-wide"
                  style={{ color: d === hoy ? T.primaryLight : T.muted, fontSize: 12, fontWeight: '700' }}
                >
                  {d === hoy ? `Hoy · ${diaLargo(d)}` : diaLargo(d)}
                </Text>
                {dias[d].map((t) => (
                  <Fila key={t.id} t={t} onToggle={() => setPagando(t)} onEdit={onEdit} />
                ))}
              </View>
            ))}
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

      {pagando && <ModalPagos id={pagando.id} onClose={() => setPagando(null)} />}
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
  elegida = false,
  onElegir,
  onTocarEnModo,
}: {
  t: TransaccionVista;
  color: string;
  compacta?: boolean;
  onEdit?: (t: TransaccionVista) => void;
  onToggle: () => void;
  arrastrando?: boolean;
  /** Arrastre con mouse. Con el dedo no se usa (ver onElegir). */
  onIniciarArrastre?: (t: TransaccionVista, tarjeta: Rect, x: number, y: number) => void;
  onMoverArrastre?: (x: number, y: number) => void;
  onSoltar?: (cancelado?: boolean) => void;
  /** Esta tarjeta es la que se está moviendo (modo tocar-destino). */
  elegida?: boolean;
  /** Pulsación larga con el dedo: elige la tarjeta para moverla. */
  onElegir?: (t: TransaccionVista) => void;
  /** Si hay una tarjeta elegida, tocar esta equivale a tocar su día. */
  onTocarEnModo?: () => void;
}) {
  const pagado = t.estado === 'pagado';
  // Pagado a medias: "pagado X de Y" y la barra. La tarjeta sigue siendo una.
  const parcial = t.pagado > 0.005 && t.saldo > 0;
  const ref = useRef<View>(null);
  // Arrastre directo con mouse/trackpad (PanResponder).
  const arrastrable = !!onIniciarArrastre && punteroFino;
  // Con el dedo en la web, el arrastre se arma con una pulsación larga y se
  // maneja con eventos táctiles nativos (ver el efecto de abajo). El
  // PanResponder no sirve acá: el navegador se queda con el gesto para hacer
  // scroll o seleccionar texto antes de que la app pueda reclamarlo.
  const tactil = Platform.OS === 'web' && !punteroFino && !!onIniciarArrastre;

  // Los manejadores táctiles viven toda la vida de la tarjeta: leen lo último
  // desde una ref para no volver a engancharse (y perder el gesto) en cada render.
  const ultimo = useRef({ t, onIniciarArrastre, onMoverArrastre, onSoltar, onElegir, enModo: !!onTocarEnModo });
  ultimo.current = { t, onIniciarArrastre, onMoverArrastre, onSoltar, onElegir, enModo: !!onTocarEnModo };
  // Tras un arrastre el navegador igual manda el "click": se ignora un rato
  // para que soltar la tarjeta no abra la edición.
  const ignorarPress = useRef(false);

  useEffect(() => {
    if (!tactil) return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let activo = false;
    let movido = false;
    let x0 = 0;
    let y0 = 0;
    let x = 0;
    let y = 0;

    const terminar = (cancelado: boolean) => {
      const u = ultimo.current;
      if (timer) {
        clearTimeout(timer);
        timer = null;
        return;
      }
      if (!activo) return;
      activo = false;
      ignorarPress.current = true;
      setTimeout(() => (ignorarPress.current = false), 400);
      if (!movido) {
        // Pulsación larga sin mover: queda elegida para tocar el día destino.
        u.onSoltar?.(true);
        if (!cancelado) u.onElegir?.(u.t);
      } else {
        u.onSoltar?.(cancelado);
      }
    };

    const alTocar = (e: TouchEvent) => {
      if (e.touches.length !== 1 || ultimo.current.enModo) return;
      x0 = x = e.touches[0].clientX;
      y0 = y = e.touches[0].clientY;
      activo = false;
      movido = false;
      timer = setTimeout(() => {
        timer = null;
        activo = true;
        (navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate?.(15);
        const r = el.getBoundingClientRect();
        ultimo.current.onIniciarArrastre?.(ultimo.current.t, { x: r.left, y: r.top, w: r.width, h: r.height }, x, y);
      }, 400);
    };
    const alMover = (e: TouchEvent) => {
      const tc = e.touches[0];
      if (!tc) return;
      x = tc.clientX;
      y = tc.clientY;
      if (activo) {
        // Con el arrastre armado el dedo ya no hace scroll.
        if (e.cancelable) e.preventDefault();
        if (Math.hypot(x - x0, y - y0) > 8) movido = true;
        ultimo.current.onMoverArrastre?.(x, y);
      } else if (timer && Math.hypot(x - x0, y - y0) > 8) {
        // Movió antes de los 400 ms: es un scroll, no un arrastre.
        clearTimeout(timer);
        timer = null;
      }
    };
    const alSoltar = (e: TouchEvent) => {
      if (activo && e.cancelable) e.preventDefault();
      terminar(false);
    };
    const alCancelar = () => terminar(true);
    // Sin esto, mantener apretado abre el menú contextual del navegador.
    const sinMenu = (e: Event) => e.preventDefault();

    el.addEventListener('touchstart', alTocar, { passive: true });
    el.addEventListener('touchmove', alMover, { passive: false });
    el.addEventListener('touchend', alSoltar, { passive: false });
    el.addEventListener('touchcancel', alCancelar);
    el.addEventListener('contextmenu', sinMenu);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('touchstart', alTocar);
      el.removeEventListener('touchmove', alMover);
      el.removeEventListener('touchend', alSoltar);
      el.removeEventListener('touchcancel', alCancelar);
      el.removeEventListener('contextmenu', sinMenu);
    };
  }, [tactil]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => arrastrable && Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_e, g) => arrastrable && Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: (_e, g) => {
          const x = g.x0;
          const y = g.y0;
          ref.current?.measureInWindow((cx, cy, w, h) => onIniciarArrastre?.(t, { x: cx, y: cy, w, h }, x, y));
        },
        onPanResponderMove: (_e, g) => onMoverArrastre?.(g.moveX, g.moveY),
        onPanResponderRelease: () => onSoltar?.(),
        onPanResponderTerminate: () => onSoltar?.(true),
        onPanResponderTerminationRequest: () => false,
      }),
    [arrastrable, t, onIniciarArrastre, onMoverArrastre, onSoltar]
  );

  return (
    <View
      ref={ref}
      collapsable={false}
      {...(arrastrable ? pan.panHandlers : {})}
      style={{ opacity: arrastrando ? 0.35 : 1 }}
    >
      <Pressable
        onPress={() => {
          if (ignorarPress.current) return;
          if (onTocarEnModo) onTocarEnModo();
          else onEdit?.(t);
        }}
        // En la web táctil lo maneja el efecto de arriba; en nativo, pulsación larga = elegir.
        onLongPress={onElegir && !onTocarEnModo && !tactil ? () => onElegir(t) : undefined}
        delayLongPress={400}
        className="rounded"
        style={
          {
            paddingHorizontal: compacta ? 3 : 6,
            paddingVertical: compacta ? 2 : 4,
            backgroundColor: elegida ? T.primaryBadgeBg : T.surface2,
            borderLeftWidth: 3,
            borderLeftColor: color,
            outlineStyle: elegida ? 'solid' : undefined,
            outlineWidth: elegida ? 2 : undefined,
            outlineColor: elegida ? T.primary : undefined,
            opacity: pagado ? 0.75 : 1,
            cursor: arrastrable ? 'grab' : undefined,
            // Sin esto, mantener apretado en el navegador del teléfono
            // selecciona el texto o abre el menú en vez de elegir la tarjeta.
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          } as object
        }
      >
        <View className="flex-row items-center" style={{ gap: 4 }}>
          {!compacta && (
            <Pressable
              onPress={onToggle}
              accessibilityLabel={t.tipo === 'gasto' ? 'Pagos de este gasto' : 'Cobros de este ingreso'}
              hitSlop={6}
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: color,
                backgroundColor: pagado ? color : 'transparent',
                overflow: 'hidden',
              }}
            >
              {parcial && <View style={{ width: '50%', height: '100%', backgroundColor: color }} />}
            </Pressable>
          )}
          <Text numberOfLines={1} selectable={false} className="flex-1" style={{ color: T.text, fontSize: compacta ? 10 : 12 }}>
            {t.nombre}
          </Text>
        </View>
        <Text numberOfLines={1} selectable={false} style={{ color: T.text, fontSize: compacta ? 10 : 12, fontWeight: '600' }}>
          {compacta ? fmtCorto(t.monto) : fmt(t.monto, t.moneda)}
        </Text>
        {parcial && (
          <View style={{ gap: 2, marginTop: 2 }}>
            {!compacta && (
              <Text numberOfLines={1} selectable={false} style={{ color: T.muted, fontSize: 10 }}>
                {t.tipo === 'gasto' ? 'pagado' : 'cobrado'} {fmtCorto(t.pagado)} de {fmtCorto(t.monto)}
              </Text>
            )}
            <BarraPagado pagado={t.pagado} monto={t.monto} alto={3} color={color} />
          </View>
        )}
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
