import { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useData } from '../db/DataProvider';
import { cortoDeMes } from '../db/estadisticas';
import { fmt } from '../lib/format';
import { Nivel, saludFinanciera } from '../lib/salud';
import { T } from '../lib/theme';

const colorDe = (n: Nivel) => (n === 'bien' ? T.teal : n === 'aviso' ? T.warn : T.danger);

/**
 * Salud financiera: un medidor 0-100, cuatro indicadores con semáforo y el
 * resultado de los últimos meses. No depende del filtro de período: mide
 * meses cerrados, que es lo único que no cambia a mitad de camino.
 */
export function SaludFinanciera() {
  const { estadisticas, porPagar, fijosDelMes } = useData();
  const salud = useMemo(() => {
    const aPagar = porPagar.filter((t) => t.tipo === 'gasto').reduce((a, t) => a + t.saldo, 0);
    const aCobrar = porPagar.filter((t) => t.tipo === 'ingreso').reduce((a, t) => a + t.saldo, 0);
    return saludFinanciera({ datos: estadisticas, porPagar: aPagar, porCobrar: aCobrar, fijosDelMes });
  }, [estadisticas, porPagar, fijosDelMes]);

  if (!salud) {
    return (
      <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
        <Text style={{ color: T.muted, fontSize: 15 }}>
          Con un mes completo de movimientos cargados aparece acá el diagnóstico.
        </Text>
      </View>
    );
  }

  const color = colorDe(salud.nivel);
  const maxAbs = Math.max(...salud.meses.map((m) => Math.abs(m.resultado)), 1);

  return (
    <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border, gap: 16 }}>
      <View className="flex-row items-center" style={{ gap: 16 }}>
        <Medidor puntaje={salud.puntaje} color={color} />
        <View className="flex-1">
          <Text style={{ color: T.muted, fontSize: 14 }}>Tu salud financiera</Text>
          <Text style={{ color, fontSize: 24, fontWeight: '700' }}>{salud.titulo}</Text>
          <Text style={{ color: T.muted, fontSize: 13 }}>Sobre meses cerrados y lo pendiente</Text>
        </View>
      </View>

      <View style={{ gap: 12 }}>
        {salud.indicadores.map((i) => (
          <View key={i.id} style={{ gap: 4 }}>
            <View className="flex-row justify-between items-baseline">
              <Text style={{ color: T.text, fontSize: 15 }}>{i.nombre}</Text>
              <Text style={{ color: colorDe(i.nivel), fontSize: 15, fontWeight: '700' }}>{i.valor}</Text>
            </View>
            <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
              <View style={{ width: `${Math.max(3, i.puntaje)}%`, height: '100%', backgroundColor: colorDe(i.nivel), borderRadius: 999 }} />
            </View>
            <Text style={{ color: T.muted, fontSize: 13 }}>{i.detalle}</Text>
          </View>
        ))}
      </View>

      {salud.meses.length >= 2 && (
        <View style={{ gap: 6 }}>
          <Text style={{ color: T.muted, fontSize: 13 }}>Resultado de cada mes (ingresos − gastos)</Text>
          {/* Barras divergentes desde el cero: arriba sobró, abajo faltó. */}
          <View className="flex-row" style={{ height: 64 }}>
            {salud.meses.map((m) => {
              const h = (Math.abs(m.resultado) / maxAbs) * 30;
              const pos = m.resultado >= 0;
              return (
                <View key={m.mes} className="flex-1 items-center" style={{ height: 64 }}>
                  <View style={{ height: 32, justifyContent: 'flex-end' }}>
                    {pos && <View style={{ width: 14, height: Math.max(2, h), backgroundColor: T.teal, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />}
                  </View>
                  <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: T.border }} />
                  <View style={{ height: 31 }}>
                    {!pos && <View style={{ width: 14, height: Math.max(2, h), backgroundColor: T.danger, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />}
                  </View>
                </View>
              );
            })}
          </View>
          <View className="flex-row">
            {salud.meses.map((m) => (
              <View key={m.mes} className="flex-1 items-center">
                <Text style={{ color: T.muted, fontSize: 11 }}>{cortoDeMes(m.mes)}</Text>
                <Text style={{ color: m.resultado >= 0 ? T.teal : T.danger, fontSize: 10 }} numberOfLines={1}>
                  {abreviar(m.resultado)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** -2.414.450 -> "−2,4M"; 850000 -> "850k". Para que entre debajo de una barra. */
function abreviar(n: number): string {
  const s = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (a >= 1_000) return `${s}${Math.round(a / 1_000)}k`;
  return s + fmt(a).replace('$', '');
}

/** Semicírculo 0-100. */
function Medidor({ puntaje, color }: { puntaje: number; color: string }) {
  const r = 38;
  const cx = 46;
  const cy = 46;
  const arco = (p: number) => {
    const ang = Math.PI * (1 - p / 100);
    return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(ang)} ${cy - r * Math.sin(ang)}`;
  };
  return (
    <View style={{ width: 92, height: 56, alignItems: 'center' }}>
      <Svg width={92} height={52}>
        <Path d={arco(100)} stroke={T.surface2} strokeWidth={9} fill="none" strokeLinecap="round" />
        {puntaje > 0 && <Path d={arco(puntaje)} stroke={color} strokeWidth={9} fill="none" strokeLinecap="round" />}
      </Svg>
      <Text style={{ position: 'absolute', bottom: 0, color: T.text, fontSize: 20, fontWeight: '700' }}>{puntaje}</Text>
    </View>
  );
}
