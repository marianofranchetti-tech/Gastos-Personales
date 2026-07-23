import { Pressable, Text, View } from 'react-native';
import { TransaccionVista } from '../db/queries';
import { PERIODOS, TODAS_CATS } from '../lib/categorias';
import { CAT_ICONS } from '../lib/iconos';
import { fechaISO, fmt, hoy, proxVenc } from '../lib/format';
import { T } from '../lib/theme';

export function Fila({ t, onToggle }: { t: TransaccionVista; onToggle: (id: number) => void }) {
  const cat = TODAS_CATS.find((c) => c.id === t.categoria_id);
  const Icono = CAT_ICONS[t.categoria_id];
  const nx = t.rec
    ? proxVenc({ rec: true, venc: t.venc, fecha: t.fecha, periodo: t.periodo ?? undefined })
    : null;
  const cobrado = t.estado === 'pagado';
  const fVenc = fechaISO(t.venc);
  if (fVenc) fVenc.setHours(23, 59, 0, 0); // vence al final del día
  const vencido = t.tipo === 'gasto' && t.estado === 'pendiente' && !!fVenc && fVenc < hoy;
  const periodoNombre = PERIODOS.find((p) => p.id === t.periodo)?.nombre;

  const badge = cobrado
    ? { bg: T.tealBg, col: T.teal, txt: t.tipo === 'gasto' ? '✓ Pagado' : '✓ Cobrado' }
    : vencido
      ? { bg: T.dangerBg, col: T.danger, txt: 'Vencido' }
      : { bg: T.warnBg, col: T.warn, txt: 'Pendiente' };

  return (
    <View
      className="flex-row items-center gap-3 rounded-lg px-3 py-2.5 border"
      style={{ backgroundColor: T.surface, borderColor: T.border }}
    >
      <View
        className="w-9 h-9 rounded-lg items-center justify-center"
        style={{ backgroundColor: (cat?.color ?? T.muted) + '22' }}
      >
        {Icono && <Icono size={18} strokeWidth={1.8} color={cat?.color ?? T.muted} />}
      </View>
      <View className="flex-1">
        <Text className="font-medium" style={{ color: T.text }} numberOfLines={1}>
          {t.nombre}
        </Text>
        <Text className="text-xs" style={{ color: T.muted }}>
          {t.rec
            ? `Recurrente · ${periodoNombre}${t.tipo === 'gasto' ? (t.fijo ? ' · Fijo' : ' · Variable') : ''}`
            : 'Eventual'}
          {nx ? (
            <Text style={{ color: T.teal }}>
              {' '}
              · Próx: {nx.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
            </Text>
          ) : null}
        </Text>
      </View>
      <View className="items-end">
        <Text className="font-semibold" style={{ color: t.tipo === 'gasto' ? T.text : T.teal }}>
          {t.tipo === 'gasto' ? '−' : '+'}
          {fmt(t.monto, t.moneda)}
        </Text>
        <Pressable
          onPress={() => onToggle(t.id)}
          className="px-2 py-0.5 rounded mt-0.5"
          style={{ backgroundColor: badge.bg }}
        >
          <Text className="text-[11px] font-semibold" style={{ color: badge.col }}>
            {badge.txt}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
