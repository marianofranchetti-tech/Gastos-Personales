import { useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { Barra } from '../lib/periodo';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';

const ALTO = 150;

export type ModoGrafico = 'ambos' | 'ingresos' | 'egresos';

/**
 * Barras de ingresos y gastos por columna (meses, semanas o días según el
 * período elegido).
 *
 * Decisiones que no son estéticas:
 *
 * 1. Las barras futuras van a media opacidad. Son proyección, no hechos.
 *    Dibujarlas iguales sería mentir.
 * 2. El único número fijo es el techo del eje. El detalle de una columna se
 *    ve tocándola: con 13 columnas, etiquetar cada barra es ruido.
 * 3. Un período en cero se dibuja en cero, sin barra. El hueco es el dato.
 * 4. El ancho de barra sale del ancho real del gráfico: 13 columnas tienen
 *    que entrar en un teléfono angosto y no verse ridículas en una PC.
 */
export type ResumenGrafico = { etiqueta: string; ingresos: number; egresos: number; real: boolean };

export function GraficoMeses({
  datos,
  modo = 'ambos',
  moneda = 'ARS',
  resumen,
}: {
  datos: Barra[];
  modo?: ModoGrafico;
  moneda?: string;
  /** Total del período elegido, para mostrar cuando no hay columna tocada (vista Mes). */
  resumen?: ResumenGrafico;
}) {
  const [ancho, setAncho] = useState(0);
  const [tocado, setTocado] = useState<string | null>(null);

  const muestraIng = modo === 'ambos' || modo === 'ingresos';
  const muestraEgr = modo === 'ambos' || modo === 'egresos';

  const col = ancho > 0 && datos.length > 0 ? ancho / datos.length : 24;
  const porBarra = modo === 'ambos' ? (col - 6) / 2 : col - 8;
  const anchoBarra = Math.max(4, Math.min(modo === 'ambos' ? 18 : 30, porBarra));
  const etiquetasRalas = col < 30;

  const valores = datos.flatMap((m) => [muestraIng ? m.ingresos : 0, muestraEgr ? m.egresos : 0]);
  const tope = Math.max(...valores, 1);
  const hayDatos = valores.some((v) => v > 0);
  const hayFuturo = datos.some((m) => !m.real);
  const alto = (v: number) => (v <= 0 ? 0 : Math.max(2, (v / tope) * ALTO));

  const tocada = datos.find((m) => m.clave === tocado);
  const foco: { etiqueta: string; titulo?: string; sub?: string; ingresos: number; egresos: number; real: boolean } | undefined =
    tocada ?? resumen ?? datos.find((m) => m.elegido) ?? datos.find((m) => m.actual);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 6 }}>
        {modo === 'ambos' && (
          <View className="flex-row" style={{ gap: 14 }}>
            <Clave color={T.teal} texto="Ingresos" />
            <Clave color={T.danger} texto="Gastos" />
          </View>
        )}
        {foco && hayDatos && (
          <Text style={{ color: T.muted, fontSize: 13 }}>
            <Text style={{ color: T.text, fontWeight: '600' }}>
              {foco.titulo ?? foco.etiqueta}
              {!foco.titulo && foco.sub && foco.sub.startsWith("'") ? ` ${foco.sub}` : ''}
              {!foco.real ? ' (proy.)' : ''}
            </Text>
            {muestraIng && (
              <Text style={{ color: T.teal }}>{`  ↑ ${fmt(foco.ingresos, moneda)}`}</Text>
            )}
            {muestraEgr && (
              <Text style={{ color: T.danger }}>{`  ↓ ${fmt(foco.egresos, moneda)}`}</Text>
            )}
          </Text>
        )}
      </View>

      <View>
        {hayDatos && (
          <Text className="text-[13px] mb-1" style={{ color: T.muted }}>
            {fmt(tope, moneda)}
          </Text>
        )}

        <View
          className="flex-row items-end"
          style={{ height: ALTO }}
          onLayout={(e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width)}
        >
          {datos.map((m) => (
            <Pressable
              key={m.clave}
              onPress={() => setTocado(m.clave === tocado ? null : m.clave)}
              className="flex-1 items-center justify-end"
              style={{
                height: ALTO,
                borderRadius: 6,
                // El elegido va con borde, no con relleno: un relleno alto se
                // confundía con una barra más.
                borderWidth: 1,
                borderColor: m.elegido ? T.primary : 'transparent',
                backgroundColor: m.clave === tocado ? T.surface2 : 'transparent',
              }}
            >
              <View className="flex-row items-end justify-center" style={{ gap: 2, opacity: m.real ? 1 : 0.45 }}>
                {muestraIng && <Columna alto={alto(m.ingresos)} ancho={anchoBarra} color={T.teal} />}
                {muestraEgr && <Columna alto={alto(m.egresos)} ancho={anchoBarra} color={T.danger} />}
              </View>
            </Pressable>
          ))}
        </View>

        <View style={{ height: 1, backgroundColor: T.border }} />

        <View className="flex-row mt-1">
          {datos.map((m, i) => {
            const destacada = m.actual || m.elegido;
            const visible =
              m.marca !== undefined
                ? m.marca || destacada
                : !etiquetasRalas || destacada || (datos.length - 1 - i) % 2 === 0;
            return (
              <View key={m.clave} className="flex-1 items-center">
                <Text
                  // Con marcas (vista Mes, ~31 columnas) la etiqueta puede
                  // desbordar su columna: las vecinas están ocultas.
                  numberOfLines={m.marca === undefined ? 1 : undefined}
                  style={{
                    width: m.marca === undefined ? undefined : 28,
                    textAlign: 'center',
                    color: m.actual ? T.primaryLight : T.muted,
                    fontWeight: destacada ? '700' : '400',
                    fontSize: col < 26 ? 11 : 13,
                    opacity: visible ? 1 : 0,
                  }}
                >
                  {m.etiqueta}
                </Text>
                {m.sub && (
                  <Text
                    numberOfLines={1}
                    style={{ color: T.muted, fontSize: 10, opacity: (visible && m.marca === undefined) || m.sub.startsWith("'") ? 1 : 0 }}
                  >
                    {m.sub}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <Text className="text-[14px]" style={{ color: T.muted }}>
        {!hayDatos
          ? 'Todavía no hay movimientos en este período. Las barras aparecen a medida que cargás.'
          : hayFuturo
            ? 'Las barras más claras son proyección o vencimientos que todavía no pasaron. Tocá una columna para ver el detalle.'
            : 'Tocá una columna para ver el detalle.'}
      </Text>
    </View>
  );
}

function Columna({ alto, ancho, color }: { alto: number; ancho: number; color: string }) {
  return (
    <View
      style={{
        width: ancho,
        height: alto,
        backgroundColor: color,
        borderTopLeftRadius: Math.min(4, ancho / 2),
        borderTopRightRadius: Math.min(4, ancho / 2),
      }}
    />
  );
}

function Clave({ color, texto }: { color: string; texto: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <Text className="text-[14px]" style={{ color: T.muted }}>
        {texto}
      </Text>
    </View>
  );
}
