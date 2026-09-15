import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { TransaccionVista } from '../db/queries';
import { Fila } from '../components/Fila';
import { Proyeccion } from '../components/Proyeccion';
import { CATS } from '../lib/categorias';
import { CAT_ICONS } from '../lib/iconos';
import { fmt } from '../lib/format';
import { T } from '../lib/theme';
import { useResumenMes } from '../lib/useResumenMes';
import { agruparPendientes, sumar } from '../lib/agruparPendientes';
import { ModalOpciones } from '../components/ModalOpciones';

export function InicioScreen() {
  const { alternar, porPagar, proyeccion, limpiar, abrirEdicion } = useData();
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const { totG, porCat } = useResumenMes();

  // Los cobros esperados no son "por pagar": van en su propia sección.
  const { aPagar, aCobrar } = useMemo(() => {
    const gastos = porPagar.filter((t) => t.tipo === 'gasto');
    const ingresos = porPagar.filter((t) => t.tipo === 'ingreso');
    return { aPagar: gastos, aCobrar: ingresos };
  }, [porPagar]);

  return (
    <ScrollView
      className="flex-1 px-4 mt-4"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ gap: 20, paddingBottom: 96 }}
    >
      <SeccionPendientes
        titulo="Por pagar"
        filas={aPagar}
        onToggle={alternar}
        onEdit={abrirEdicion}
        vacio="No tenés nada por pagar en los próximos días."
      />

      <SeccionPendientes
        titulo="Por cobrar"
        filas={aCobrar}
        onToggle={alternar}
        onEdit={abrirEdicion}
        vacio={null}
      />

      <View>
        <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
          Cómo vienen los próximos meses
        </Text>
        <Proyeccion proyeccion={proyeccion} />
      </View>

      <View>
        <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
          Top categorías del mes
        </Text>
        <View
          className="rounded-lg p-4 border"
          style={{ backgroundColor: T.surface, borderColor: T.border, gap: 12 }}
        >
          {porCat.map(([cid, monto]) => {
            const c = CATS.find((c) => c.id === cid);
            const Icono = CAT_ICONS[cid];
            return (
              <View key={cid}>
                <View className="flex-row justify-between items-center mb-1">
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    {Icono && <Icono size={14} strokeWidth={1.8} color={c?.color} />}
                    <Text className="text-sm" style={{ color: T.text }}>
                      {c?.nombre}
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold" style={{ color: T.text }}>
                    {fmt(monto)}
                  </Text>
                </View>
                <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: T.surface2 }}>
                  <View
                    className="h-1.5 rounded-full"
                    style={{ width: `${(monto / totG) * 100}%`, backgroundColor: c?.color }}
                  />
                </View>
              </View>
            );
          })}
          {porCat.length === 0 && (
            <Text className="text-sm" style={{ color: T.muted }}>
              Todavía no registraste pagos este mes.
            </Text>
          )}
        </View>
      </View>

      {/* Los datos de ejemplo vienen cargados de fábrica y no son tuyos.
          Esto los borra para que puedas empezar con tus números reales. */}
      <Pressable onPress={() => setConfirmandoBorrado(true)} className="py-3">
        <Text className="text-xs text-center" style={{ color: T.muted }}>
          Borrar todos los movimientos y empezar de cero
        </Text>
      </Pressable>

      {confirmandoBorrado && (
        <ModalOpciones
          titulo="Borrar todos los movimientos"
          mensaje="Se van todos los gastos, ingresos y reglas recurrentes, incluidos los datos de ejemplo. Las categorías quedan. No se puede deshacer."
          opciones={[{ id: 'ok', label: 'Borrar todo', detalle: 'Empezar de cero con tus números', destructiva: true }]}
          onElegir={async () => {
            setConfirmandoBorrado(false);
            await limpiar();
          }}
          onCancelar={() => setConfirmandoBorrado(false)}
        />
      )}
    </ScrollView>
  );
}

function SeccionPendientes({
  titulo,
  filas,
  onToggle,
  onEdit,
  vacio,
}: {
  titulo: string;
  filas: TransaccionVista[];
  onToggle: (id: number) => void;
  onEdit: (t: TransaccionVista) => void;
  vacio: string | null;
}) {
  const agrupadas = useMemo(() => agruparPendientes(filas), [filas]);
  const total = sumar(filas);

  if (filas.length === 0) {
    if (!vacio) return null;
    return (
      <View>
        <Text className="text-sm font-bold mb-2" style={{ color: T.text }}>
          {titulo}
        </Text>
        <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
          <Text className="text-sm" style={{ color: T.muted }}>
            {vacio}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row justify-between items-baseline mb-2">
        <Text className="text-sm font-bold" style={{ color: T.text }}>
          {titulo}
        </Text>
        <Text className="text-xs" style={{ color: T.muted }}>
          {filas.length} {filas.length === 1 ? 'vencimiento' : 'vencimientos'} · {fmt(total)}
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        {agrupadas.map(({ fila, mas }) => (
          <Fila key={fila.id} t={fila} onToggle={onToggle} onEdit={onEdit} masOcurrencias={mas} />
        ))}
      </View>
    </View>
  );
}
