import { Text, View } from 'react-native';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';

/**
 * Ingresos contra gastos del mes, comparados por longitud.
 *
 * Dos barras sobre la MISMA escala, no una torta ni una barra apilada. Con dos
 * valores, lo que el lector tiene que poder hacer es comparar magnitudes —
 * "cuánto más grande es uno que el otro"— y para eso la longitud es el único
 * canal que se lee sin esfuerzo. Una torta de dos porciones obliga a comparar
 * ángulos, que es peor, y además no deja ver la diferencia en pesos.
 *
 * El número grande es la diferencia, que es la pregunta real del mes.
 */
export function BalanceMes({
  ingresos,
  egresos,
  pendienteCobro = 0,
  moneda = 'ARS',
}: {
  ingresos: number;
  egresos: number;
  pendienteCobro?: number;
  moneda?: string;
}) {
  const balance = ingresos - egresos;
  const tope = Math.max(ingresos, egresos, 1);
  const positivo = balance >= 0;

  return (
    <View
      className="rounded-lg p-4 border"
      style={{ backgroundColor: T.surface, borderColor: T.border, gap: 14 }}
    >
      <View>
        <Text style={{ color: T.muted, fontSize: 14 }}>
          {positivo ? 'Te sobran este mes' : 'Te faltan este mes'}
        </Text>
        <Text style={{ color: positivo ? T.teal : T.danger, fontSize: 30, fontWeight: '700' }}>
          {positivo ? '' : '−'}
          {fmt(Math.abs(balance), moneda)}
        </Text>
        <Text style={{ color: T.muted, fontSize: 13 }}>Sobre dinero pagado y cobrado</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Linea etiqueta="Ingresos" valor={ingresos} tope={tope} color={T.teal} moneda={moneda} />
        <Linea etiqueta="Gastos" valor={egresos} tope={tope} color={T.danger} moneda={moneda} />
      </View>

      {pendienteCobro > 0 && (
        <Text style={{ color: T.muted, fontSize: 13 }}>
          Además tenés {fmt(pendienteCobro, moneda)} pendiente de cobro: todavía no está acá.
        </Text>
      )}
    </View>
  );
}

function Linea({
  etiqueta,
  valor,
  tope,
  color,
  moneda,
}: {
  etiqueta: string;
  valor: number;
  tope: number;
  color: string;
  moneda: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View className="flex-row justify-between items-baseline">
        <Text style={{ color: T.text, fontSize: 15 }}>{etiqueta}</Text>
        <Text style={{ color: T.text, fontSize: 16, fontWeight: '600' }}>{fmt(valor, moneda)}</Text>
      </View>
      <View className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
        <View
          style={{
            width: `${(valor / tope) * 100}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 999,
          }}
        />
      </View>
    </View>
  );
}
