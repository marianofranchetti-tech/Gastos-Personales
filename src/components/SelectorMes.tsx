import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { usePeriodo } from '../lib/PeriodoProvider';
import { hoyISO } from '../lib/fechasRecurrentes';
import { T } from '../lib/theme';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Filtro único de mes y año. Fija el período compartido (PeriodoProvider) en
 * vista Mes, así el gráfico, las categorías y el calendario miran el mismo mes.
 *
 * Flechas para el mes anterior / siguiente; tocar el nombre abre un selector
 * de año + mes para saltar lejos sin veinte toques.
 */
export function SelectorMes() {
  const { g, ancla, setG, mover, irA } = usePeriodo();
  const [abierto, setAbierto] = useState(false);
  const hoy = hoyISO();

  // Esta pantalla siempre trabaja por mes, pero el período es compartido:
  // al salir se devuelve la granularidad que el usuario tenía en las otras
  // pantallas (si venía de Año, vuelve a Año). El mes elegido sí se comparte.
  const previa = useRef(g);
  useEffect(() => {
    const anterior = previa.current;
    setG('mes');
    return () => setG(anterior);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anio = Number(ancla.slice(0, 4));
  const mes = Number(ancla.slice(5, 7));
  const esHoy = ancla.slice(0, 7) === hoy.slice(0, 7);

  return (
    <View
      className="flex-row items-center justify-between rounded-lg border p-2"
      style={{ backgroundColor: T.surface, borderColor: T.border }}
    >
      <Pressable onPress={() => mover(-1)} className="p-1.5 rounded" accessibilityLabel="Mes anterior">
        <ChevronLeft size={20} color={T.text} />
      </Pressable>
      <Pressable
        onPress={() => setAbierto(true)}
        className="flex-1 flex-row items-center justify-center"
        style={{ gap: 8 }}
        accessibilityLabel="Elegir mes y año"
      >
        <CalendarDays size={18} color={T.muted} />
        <Text className="font-semibold" style={{ color: T.text, fontSize: 16 }}>
          {capital(MESES[mes - 1])} {anio}
        </Text>
      </Pressable>
      {!esHoy && (
        <Pressable
          onPress={() => irA(hoy)}
          className="px-2 py-1 rounded mr-1"
          style={{ backgroundColor: T.surface2 }}
          accessibilityLabel="Volver al mes actual"
        >
          <Text style={{ color: T.muted, fontSize: 13, fontWeight: '600' }}>Hoy</Text>
        </Pressable>
      )}
      <Pressable onPress={() => mover(1)} className="p-1.5 rounded" accessibilityLabel="Mes siguiente">
        <ChevronRight size={20} color={T.text} />
      </Pressable>

      {abierto && (
        <PickerMesAnio
          anio={anio}
          mes={mes}
          hoy={hoy}
          onElegir={(a, m) => {
            irA(`${a}-${String(m).padStart(2, '0')}-01`);
            setAbierto(false);
          }}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </View>
  );
}

function PickerMesAnio({
  anio,
  mes,
  hoy,
  onElegir,
  onCerrar,
}: {
  anio: number;
  mes: number;
  hoy: string;
  onElegir: (anio: number, mes: number) => void;
  onCerrar: () => void;
}) {
  const [a, setA] = useState(anio);
  const hoyAnio = Number(hoy.slice(0, 4));
  const hoyMes = Number(hoy.slice(5, 7));

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCerrar}>
      <Pressable className="flex-1 items-center justify-center p-4" style={{ backgroundColor: T.overlay }} onPress={onCerrar}>
        <Pressable
          className="rounded-2xl border p-4"
          style={{ width: '100%', maxWidth: 360, backgroundColor: T.bg, borderColor: T.border, gap: 12 }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row items-center justify-between">
            <Pressable onPress={() => setA(a - 1)} className="p-2 rounded" accessibilityLabel="Año anterior">
              <ChevronLeft size={20} color={T.text} />
            </Pressable>
            <Text className="font-bold" style={{ color: T.text, fontSize: 18 }}>
              {a}
            </Text>
            <Pressable onPress={() => setA(a + 1)} className="p-2 rounded" accessibilityLabel="Año siguiente">
              <ChevronRight size={20} color={T.text} />
            </Pressable>
          </View>

          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {MESES_CORTOS.map((nombre, i) => {
              const m = i + 1;
              const elegido = a === anio && m === mes;
              const actual = a === hoyAnio && m === hoyMes;
              return (
                <Pressable
                  key={nombre}
                  onPress={() => onElegir(a, m)}
                  className="rounded-lg border items-center py-2.5"
                  style={{
                    width: '31%',
                    flexGrow: 1,
                    backgroundColor: elegido ? T.primary : T.surface,
                    borderColor: elegido ? T.primary : actual ? T.primaryLight : T.border,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: elegido }}
                >
                  <Text style={{ color: elegido ? '#fff' : T.text, fontSize: 15, fontWeight: elegido ? '700' : '500' }}>
                    {nombre}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => onElegir(hoyAnio, hoyMes)}
            className="rounded-lg py-2.5"
            style={{ backgroundColor: T.surface2 }}
          >
            <Text className="text-center font-semibold" style={{ color: T.text, fontSize: 15 }}>
              Ir al mes actual
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
