import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useData } from '../db/DataProvider';
import { Tablero } from '../components/Tablero';
import { BalanceMes } from '../components/BalanceMes';
import { GraficoCategorias } from '../components/GraficoCategorias';
import { ModalOpciones } from '../components/ModalOpciones';
import { ModalDepurar } from '../components/ModalDepurar';
import { SaludFinanciera } from '../components/SaludFinanciera';
import { SelectorPeriodo } from '../components/SelectorPeriodo';
import { T } from '../lib/theme';
import { useLayout } from '../lib/layout';
import { useResumenMes } from '../lib/useResumenMes';
import { sugerenciasBalance } from '../lib/sugerencias';

/**
 * Inicio es solo tablero. En el teléfono, una columna: balance, salud,
 * período, gráficos. En la PC, dos: a la izquierda lo que no depende del
 * período (balance del mes y salud), a la derecha lo que sí (selector y
 * gráficos), para que al cambiar el filtro se mueva un solo lado.
 */
export function InicioScreen() {
  const { estadisticas, limpiar, porPagar } = useData();
  const { totG, totI, pendCobro } = useResumenMes();
  const { contenido, pc } = useLayout();

  const totales = useMemo(
    () => ({
      aPagar: porPagar.filter((t) => t.tipo === 'gasto').reduce((a, t) => a + t.monto, 0),
      aCobrar: porPagar.filter((t) => t.tipo === 'ingreso').reduce((a, t) => a + t.monto, 0),
    }),
    [porPagar]
  );
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [depurando, setDepurando] = useState(false);

  const sugerencias = useMemo(
    () =>
      sugerenciasBalance({
        datos: estadisticas,
        porPagar: totales.aPagar,
        porCobrar: totales.aCobrar,
      }),
    [estadisticas, totales]
  );

  const columnaFija = (
    <View style={{ gap: 20 }}>
      <View>
        <Titulo>Balance de este mes</Titulo>
        <BalanceMes ingresos={totI} egresos={totG} pendienteCobro={pendCobro} />
      </View>
      <View>
        <Titulo>Salud financiera</Titulo>
        <SaludFinanciera />
      </View>
    </View>
  );

  const columnaPeriodo = (
    <View style={{ gap: 20 }}>
      <View>
        <Titulo>Período de los gráficos</Titulo>
        <SelectorPeriodo />
      </View>
      <Tablero titulo="Ingresos contra gastos" modo="ambos" sugerencias={sugerencias} selector={false} />
      <View>
        <Titulo>En qué se fue la plata</Titulo>
        <GraficoCategorias />
      </View>
    </View>
  );

  return (
    <ScrollView className="flex-1" contentContainerStyle={[contenido, { gap: 20 }]}>
      {pc ? (
        <View className="flex-row" style={{ gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 5 }}>{columnaFija}</View>
          <View style={{ flex: 7 }}>{columnaPeriodo}</View>
        </View>
      ) : (
        <>
          {columnaFija}
          {columnaPeriodo}
        </>
      )}

      <Pressable onPress={() => setDepurando(true)} className="pt-3">
        <Text className="text-[14px] text-center" style={{ color: T.muted }}>
          Conservar solo un rango de fechas
        </Text>
      </Pressable>
      {depurando && <ModalDepurar onClose={() => setDepurando(false)} />}

      {/* Los datos de ejemplo vienen de fábrica y no son tuyos. */}
      <Pressable onPress={() => setConfirmandoBorrado(true)} className="py-3">
        <Text className="text-[14px] text-center" style={{ color: T.muted }}>
          Borrar todos los movimientos y empezar de cero
        </Text>
      </Pressable>

      {confirmandoBorrado && (
        <ModalOpciones
          titulo="Borrar todos los movimientos"
          mensaje="Se van todos los gastos, ingresos y reglas recurrentes, incluidos los datos de ejemplo. Las categorías y los precios quedan. No se puede deshacer."
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

function Titulo({ children }: { children: string }) {
  return (
    <Text className="font-bold mb-2" style={{ color: T.text, fontSize: 16 }}>
      {children}
    </Text>
  );
}
