import { Text, View } from 'react-native';
import { CAT_ICONS } from '../lib/iconos';
import { TODAS_CATS } from '../lib/categorias';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';
import { useCategoriasPeriodo } from '../lib/useBarras';

const MAX_FILAS = 7;

/**
 * En qué se fue la plata en el período elegido: barras horizontales ordenadas
 * de mayor a menor. Barras y no torta porque con más de tres categorías nadie
 * compara bien porciones; largos, sí.
 *
 * Solo lo PAGADO, igual que el balance. Lo pendiente del período se avisa
 * abajo, aparte.
 */
export function GraficoCategorias({ moneda = 'ARS', tipo = 'gasto' }: { moneda?: string; tipo?: 'gasto' | 'ingreso' }) {
  const { categorias, total, pendiente } = useCategoriasPeriodo(moneda, tipo);
  const ing = tipo === 'ingreso';

  const filas =
    categorias.length > MAX_FILAS
      ? [
          ...categorias.slice(0, MAX_FILAS - 1),
          {
            id: '__otras',
            monto: categorias.slice(MAX_FILAS - 1).reduce((a, c) => a + c.monto, 0),
            porcentaje: categorias.slice(MAX_FILAS - 1).reduce((a, c) => a + c.porcentaje, 0),
          },
        ]
      : categorias;
  const mayor = Math.max(...filas.map((f) => f.monto), 1);

  return (
    <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border, gap: 12 }}>
      {total > 0 && (
        <View className="flex-row justify-between items-baseline">
          <Text style={{ color: T.muted, fontSize: 14 }}>{ing ? 'Cobrado en el período' : 'Pagado en el período'}</Text>
          <Text style={{ color: T.text, fontSize: 18, fontWeight: '700' }}>{fmt(total, moneda)}</Text>
        </View>
      )}

      {filas.map((c) => {
        const cat = TODAS_CATS.find((x) => x.id === c.id);
        const Icono = CAT_ICONS[c.id];
        const color = cat?.color ?? T.muted;
        return (
          <View key={c.id}>
            <View className="flex-row justify-between items-center mb-1">
              <View className="flex-row items-center flex-1" style={{ gap: 6 }}>
                {Icono && <Icono size={16} strokeWidth={1.8} color={color} />}
                <Text numberOfLines={1} style={{ color: T.text, fontSize: 15, flexShrink: 1 }}>
                  {c.id === '__otras' ? 'Otras' : cat?.nombre ?? c.id}
                </Text>
              </View>
              <View className="flex-row items-baseline" style={{ gap: 6 }}>
                <Text style={{ color: T.muted, fontSize: 14 }}>{Math.round(c.porcentaje)}%</Text>
                <Text className="font-semibold" style={{ color: T.text, fontSize: 15 }}>
                  {fmt(c.monto, moneda)}
                </Text>
              </View>
            </View>
            {/* Escala contra la categoría más grande, no contra el total: así
                la diferencia entre la 2.ª y la 3.ª se ve aunque ambas sean chicas. */}
            <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
              <View className="h-2 rounded-full" style={{ width: `${(c.monto / mayor) * 100}%`, backgroundColor: color }} />
            </View>
          </View>
        );
      })}

      {total === 0 && (
        <Text style={{ color: T.muted, fontSize: 16 }}>
          {ing ? 'No hay cobros registrados en este período.' : 'No hay pagos registrados en este período.'}
        </Text>
      )}

      {pendiente > 0 && (
        <Text style={{ color: T.muted, fontSize: 13 }}>
          Además hay {fmt(pendiente, moneda)} de {ing ? 'ingresos del período todavía sin cobrar' : 'gastos del período todavía sin pagar'}.
        </Text>
      )}
    </View>
  );
}
