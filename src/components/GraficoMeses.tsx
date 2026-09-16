import { Text, View } from 'react-native';
import { cortoDeMes, MesBarra } from '../db/estadisticas';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';

const ALTO = 132;
const ANCHO_BARRA_DOBLE = 9;
const ANCHO_BARRA_SIMPLE = 16;

export type ModoGrafico = 'ambos' | 'ingresos' | 'egresos';

/**
 * Nueve meses en columnas: el actual al centro, cuatro atrás y cuatro adelante.
 *
 * Tres decisiones que no son estéticas:
 *
 * 1. Las barras futuras van a media opacidad y hay una línea vertical en el
 *    corte. Son proyección, no hechos. Dibujarlas iguales sería mentir.
 * 2. El único número es el techo del eje. Etiquetar barras además de eso
 *    repetía el mismo valor tres veces cuando varios meses empataban arriba.
 * 3. Un mes en cero se dibuja en cero, sin barra. El hueco es el dato: así se
 *    ve de un vistazo desde cuándo hay historia cargada.
 */
export function GraficoMeses({
  datos,
  modo = 'ambos',
  moneda = 'ARS',
}: {
  datos: MesBarra[];
  modo?: ModoGrafico;
  moneda?: string;
}) {
  const muestraIng = modo === 'ambos' || modo === 'ingresos';
  const muestraEgr = modo === 'ambos' || modo === 'egresos';
  const anchoBarra = modo === 'ambos' ? ANCHO_BARRA_DOBLE : ANCHO_BARRA_SIMPLE;

  const valores = datos.flatMap((m) => [
    muestraIng ? m.ingresos : 0,
    muestraEgr ? m.egresos : 0,
  ]);
  const tope = Math.max(...valores, 1);
  const hayDatos = valores.some((v) => v > 0);
  const alto = (v: number) => (v <= 0 ? 0 : Math.max(2, (v / tope) * ALTO));

  return (
    <View style={{ gap: 10 }}>
      {modo === 'ambos' && (
        <View className="flex-row" style={{ gap: 14 }}>
          <Clave color={T.teal} texto="Ingresos" />
          <Clave color={T.danger} texto="Gastos" />
        </View>
      )}

      <View>
        {/* Techo del eje: el valor más alto, redondeado */}
        {hayDatos && (
          <Text className="text-[13px] mb-1" style={{ color: T.muted }}>
            {fmt(tope, moneda)}
          </Text>
        )}

        <View className="flex-row items-end" style={{ height: ALTO }}>
          {datos.map((m) => {
            return (
              <View key={m.mes} className="flex-1 items-center justify-end" style={{ height: ALTO }}>
                <View
                  className="flex-row items-end justify-center"
                  style={{ gap: 2, opacity: m.real ? 1 : 0.45 }}
                >
                  {muestraIng && (
                    <Barra alto={alto(m.ingresos)} ancho={anchoBarra} color={T.teal} />
                  )}
                  {muestraEgr && (
                    <Barra alto={alto(m.egresos)} ancho={anchoBarra} color={T.danger} />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Línea de base: sostiene las barras y marca el cero */}
        <View style={{ height: 1, backgroundColor: T.border }} />

        <View className="flex-row mt-1">
          {datos.map((m) => (
            <View key={m.mes} className="flex-1 items-center">
              <Text
                className="text-[13px]"
                style={{ color: m.actual ? T.primaryLight : T.muted, fontWeight: m.actual ? '700' : '400' }}
              >
                {cortoDeMes(m.mes)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text className="text-[14px]" style={{ color: T.muted }}>
        {hayDatos
          ? 'A la derecha del mes en curso es proyección, no plata que ya se movió.'
          : 'Todavía no hay movimientos en estos meses. Las barras aparecen a medida que cargás.'}
      </Text>
    </View>
  );
}

function Barra({ alto, ancho, color }: { alto: number; ancho: number; color: string }) {
  return (
    <View
      style={{
        width: ancho,
        height: alto,
        backgroundColor: color,
        // Punta redondeada arriba, recta en la base: la barra nace del cero.
        borderTopLeftRadius: 4,
        borderTopRightRadius: 4,
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
