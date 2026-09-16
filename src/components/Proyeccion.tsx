import { Text, View } from 'react-native';
import { MesProyectado, ProyeccionPorMoneda } from '../db/proyeccion';
import { fmt, mesLargo } from '../lib/format';
import { T } from '../lib/theme';

/**
 * Proyección mes a mes. Arranca en el mes siguiente: el mes en curso ya tiene
 * plata movida y se lee en el balance de arriba, no acá.
 *
 * La forma es una barra divergente sobre el cero, porque lo que el lector tiene
 * que hacer es leer POLARIDAD (¿este mes me sobra o me falta?), no comparar
 * magnitudes. Dos barras ingresos/egresos casi llenas no dejaban ver eso.
 * El signo va también en el número, así que la identidad nunca depende del color.
 *
 * Las monedas no se suman entre sí: sin cotización real, un total mezclado sería
 * un número inventado. Cada una lleva su bloque.
 */
export function Proyeccion({ proyeccion }: { proyeccion: ProyeccionPorMoneda }) {
  const monedas = Object.keys(proyeccion).sort();

  if (monedas.length === 0) {
    return (
      <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border }}>
        <Text className="text-[16px]" style={{ color: T.muted }}>
          Todavía no hay nada recurrente cargado, así que no hay nada que proyectar.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {monedas.map((moneda) => (
        <BloqueMoneda key={moneda} moneda={moneda} meses={proyeccion[moneda]} varias={monedas.length > 1} />
      ))}
    </View>
  );
}

function BloqueMoneda({ moneda, meses, varias }: { moneda: string; meses: MesProyectado[]; varias: boolean }) {
  const cierre = meses[meses.length - 1];
  // El primer mes en que el acumulado se da vuelta: es el dato accionable.
  const cruce = meses.find((m) => m.acumulado < 0);
  const escala = Math.max(...meses.map((m) => Math.abs(m.diferencia)), 1);

  return (
    <View className="rounded-lg p-4 border" style={{ backgroundColor: T.surface, borderColor: T.border, gap: 16 }}>
      {varias && (
        <Text className="text-[14px] font-bold uppercase tracking-widest" style={{ color: T.muted }}>
          {moneda}
        </Text>
      )}

      {/* Titular: el número que resume los N meses */}
      <View>
        <Text className="text-[14px]" style={{ color: T.muted }}>
          En {meses.length} meses acumulás
        </Text>
        <Text
          className="text-2xl font-bold"
          style={{ color: cierre.acumulado >= 0 ? T.teal : T.danger }}
        >
          {cierre.acumulado >= 0 ? '+' : '−'}
          {fmt(Math.abs(cierre.acumulado), moneda)}
        </Text>
        {cruce && (
          <Text className="text-[14px] mt-0.5" style={{ color: T.warn }}>
            Te das vuelta en {mesLargo(cruce.mes)}
          </Text>
        )}
      </View>

      <View style={{ gap: 10 }}>
        {meses.map((m) => (
          <MesFila key={m.mes} m={m} moneda={moneda} escala={escala} />
        ))}
      </View>

      <Text className="text-[14px]" style={{ color: T.muted }}>
        Sobre lo recurrente y lo pendiente ya cargado. No incluye el mes en curso.
      </Text>
    </View>
  );
}

function MesFila({ m, moneda, escala }: { m: MesProyectado; moneda: string; escala: number }) {
  const positivo = m.diferencia >= 0;
  const ancho = `${(Math.abs(m.diferencia) / escala) * 100}%` as const;

  return (
    <View style={{ gap: 4 }}>
      <View className="flex-row justify-between items-baseline">
        <Text className="text-[16px] capitalize" style={{ color: T.text }}>
          {mesLargo(m.mes)}
        </Text>
        <Text className="text-[16px] font-semibold" style={{ color: positivo ? T.teal : T.danger }}>
          {positivo ? '+' : '−'}
          {fmt(Math.abs(m.diferencia), moneda)}
        </Text>
      </View>

      {/* Barra divergente: mitad izquierda negativa, derecha positiva, cero al medio */}
      <View className="flex-row items-center" style={{ height: 8 }}>
        <View className="flex-1 flex-row justify-end">
          {!positivo && (
            <View style={{ width: ancho, height: 8, backgroundColor: T.danger, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }} />
          )}
        </View>
        <View style={{ width: 2, height: 8, backgroundColor: T.border }} />
        <View className="flex-1 flex-row">
          {positivo && (
            <View style={{ width: ancho, height: 8, backgroundColor: T.teal, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
          )}
        </View>
      </View>

      <View className="flex-row justify-between">
        <Text className="text-[14px]" style={{ color: T.muted }}>
          ↑ {fmt(m.ingresos, moneda)}   ↓ {fmt(m.egresos, moneda)}
        </Text>
        <Text className="text-[14px]" style={{ color: T.muted }}>
          acumulado {m.acumulado >= 0 ? '' : '−'}
          {fmt(Math.abs(m.acumulado), moneda)}
        </Text>
      </View>
    </View>
  );
}
