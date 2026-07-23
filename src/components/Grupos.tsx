import { Text, View } from 'react-native';
import { TransaccionVista } from '../db/queries';
import { TipoTx } from '../lib/categorias';
import { T } from '../lib/theme';
import { Fila } from './Fila';

// Pendientes por vencimiento asc; pagados/cobrados por fecha desc
function agrupar(items: TransaccionVista[]) {
  return {
    pend: items
      .filter((t) => t.estado === 'pendiente')
      .sort((a, b) => (a.venc || a.fecha).localeCompare(b.venc || b.fecha)),
    done: items
      .filter((t) => t.estado === 'pagado')
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}

export function Grupos({
  items,
  tipo,
  onToggle,
}: {
  items: TransaccionVista[];
  tipo: TipoTx;
  onToggle: (id: number) => void;
}) {
  const { pend, done } = agrupar(items);
  return (
    <View>
      {pend.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: T.warn }}>
            Pendientes ({pend.length})
          </Text>
          {pend.map((t) => (
            <Fila key={t.id} t={t} onToggle={onToggle} />
          ))}
        </View>
      )}
      {done.length > 0 && (
        <View className="mt-4" style={{ gap: 8 }}>
          <Text className="text-xs font-bold uppercase tracking-wide" style={{ color: T.teal }}>
            {tipo === 'gasto' ? 'Pagados' : 'Cobrados'} ({done.length})
          </Text>
          {done.map((t) => (
            <Fila key={t.id} t={t} onToggle={onToggle} />
          ))}
        </View>
      )}
      {items.length === 0 && (
        <Text className="text-sm" style={{ color: T.muted }}>
          Sin movimientos todavía.
        </Text>
      )}
    </View>
  );
}
