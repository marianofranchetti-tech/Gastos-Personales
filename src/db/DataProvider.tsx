import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  alternarEstado,
  crearTransaccion,
  getPorPagar,
  getTransaccionesConRegla,
  marcarPagada,
  NuevaTransaccion,
  TransaccionVista,
} from './queries';
import { materializarRecurrentes } from './materializar';
import { calcularProyeccion, ProyeccionPorMoneda } from './proyeccion';

const HORIZONTE_PROYECCION_MESES = 12;

type DataContextType = {
  gastos: TransaccionVista[];
  ingresos: TransaccionVista[];
  porPagar: TransaccionVista[];
  proyeccion: ProyeccionPorMoneda;
  loading: boolean;
  guardar: (input: NuevaTransaccion) => Promise<void>;
  alternar: (id: number) => Promise<void>;
  pagar: (id: number) => Promise<void>;
  refrescar: () => Promise<void>;
};

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [gastos, setGastos] = useState<TransaccionVista[]>([]);
  const [ingresos, setIngresos] = useState<TransaccionVista[]>([]);
  const [porPagar, setPorPagar] = useState<TransaccionVista[]>([]);
  const [proyeccion, setProyeccion] = useState<ProyeccionPorMoneda>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [g, i, pp, pr] = await Promise.all([
      getTransaccionesConRegla(db, 'gasto'),
      getTransaccionesConRegla(db, 'ingreso'),
      getPorPagar(db),
      calcularProyeccion(db, HORIZONTE_PROYECCION_MESES),
    ]);
    setGastos(g);
    setIngresos(i);
    setPorPagar(pp);
    setProyeccion(pr);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // La materialización corre una sola vez por arranque, antes de la primera
      // lectura, para que Home ya muestre los vencimientos generados. Si falla,
      // la app igual abre con lo que haya en la base: no es bloqueante.
      try {
        await materializarRecurrentes(db);
      } catch (e) {
        console.warn('[recurrentes] materialización falló:', e);
      }
      if (vivo) await refresh();
    })();
    return () => {
      vivo = false;
    };
  }, [db, refresh]);

  const guardar = useCallback(
    async (input: NuevaTransaccion) => {
      await crearTransaccion(db, input);
      // Una regla nueva puede tener vencimientos dentro de la ventana: los
      // materializamos ya, si no no aparecen hasta el próximo arranque.
      if (input.rec) await materializarRecurrentes(db);
      await refresh();
    },
    [db, refresh]
  );

  const alternar = useCallback(
    async (id: number) => {
      await alternarEstado(db, id);
      await refresh();
    },
    [db, refresh]
  );

  const pagar = useCallback(
    async (id: number) => {
      await marcarPagada(db, id);
      await refresh();
    },
    [db, refresh]
  );

  return (
    <DataContext.Provider
      value={{ gastos, ingresos, porPagar, proyeccion, loading, guardar, alternar, pagar, refrescar: refresh }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
