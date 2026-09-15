import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  actualizarTransaccion,
  Alcance,
  alternarEstado,
  crearTransaccion,
  eliminarTransaccion,
  getPorPagar,
  getTransaccionesConRegla,
  limpiarDatos,
  marcarPagada,
  NuevaTransaccion,
  TransaccionVista,
} from './queries';
import { materializarRecurrentes } from './materializar';
import { calcularProyeccion, ProyeccionPorMoneda } from './proyeccion';
import {
  estadisticasVentana,
  fuentesDeIngreso,
  gastosFijosDelMes,
  MesBarra,
} from './estadisticas';
import {
  crearPrecio,
  eliminarPrecio as borrarPrecio,
  actualizarPrecio,
  NuevoPrecio,
  resumenPorProducto,
  ResumenProducto,
} from './precios';

const HORIZONTE_PROYECCION_MESES = 6;

type DataContextType = {
  gastos: TransaccionVista[];
  ingresos: TransaccionVista[];
  porPagar: TransaccionVista[];
  proyeccion: ProyeccionPorMoneda;
  /** Serie de 9 meses que alimenta los tres gráficos. */
  estadisticas: MesBarra[];
  /** Gasto del mes comprometido por reglas fijas. */
  fijosDelMes: number;
  /** De dónde viene la plata, para medir concentración. */
  fuentes: { nombre: string; monto: number }[];
  precios: ResumenProducto[];
  guardarPrecio: (p: NuevoPrecio, id?: number) => Promise<void>;
  eliminarPrecio: (id: number) => Promise<void>;
  loading: boolean;
  guardar: (input: NuevaTransaccion) => Promise<void>;
  alternar: (id: number) => Promise<void>;
  pagar: (id: number) => Promise<void>;
  refrescar: () => Promise<void>;
  /** Movimiento abierto para editar, o null. Lo consume HomeShell. */
  editando: TransaccionVista | null;
  abrirEdicion: (t: TransaccionVista) => void;
  cerrarEdicion: () => void;
  editar: (id: number, input: NuevaTransaccion, alcance: Alcance) => Promise<void>;
  eliminar: (id: number, alcance: Alcance) => Promise<void>;
  limpiar: () => Promise<void>;
};

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [gastos, setGastos] = useState<TransaccionVista[]>([]);
  const [ingresos, setIngresos] = useState<TransaccionVista[]>([]);
  const [porPagar, setPorPagar] = useState<TransaccionVista[]>([]);
  const [proyeccion, setProyeccion] = useState<ProyeccionPorMoneda>({});
  const [estadisticas, setEstadisticas] = useState<MesBarra[]>([]);
  const [fijosDelMes, setFijosDelMes] = useState(0);
  const [fuentes, setFuentes] = useState<{ nombre: string; monto: number }[]>([]);
  const [precios, setPrecios] = useState<ResumenProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<TransaccionVista | null>(null);

  const refresh = useCallback(async () => {
    const [g, i, pp, pr, est, fij, fue, pre] = await Promise.all([
      getTransaccionesConRegla(db, 'gasto'),
      getTransaccionesConRegla(db, 'ingreso'),
      getPorPagar(db),
      calcularProyeccion(db, HORIZONTE_PROYECCION_MESES),
      estadisticasVentana(db),
      gastosFijosDelMes(db),
      fuentesDeIngreso(db),
      resumenPorProducto(db),
    ]);
    setGastos(g);
    setIngresos(i);
    setPorPagar(pp);
    setProyeccion(pr);
    setEstadisticas(est);
    setFijosDelMes(fij);
    setFuentes(fue);
    setPrecios(pre);
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

  const editar = useCallback(
    async (id: number, input: NuevaTransaccion, alcance: Alcance) => {
      await actualizarTransaccion(db, id, input, alcance);
      // Una edición puede haber creado una regla nueva o corrido un ancla,
      // así que hay que volver a materializar antes de leer.
      await materializarRecurrentes(db);
      await refresh();
    },
    [db, refresh]
  );

  const eliminar = useCallback(
    async (id: number, alcance: Alcance) => {
      await eliminarTransaccion(db, id, alcance);
      await refresh();
    },
    [db, refresh]
  );

  const guardarPrecio = useCallback(
    async (p: NuevoPrecio, id?: number) => {
      if (id != null) await actualizarPrecio(db, id, p);
      else await crearPrecio(db, p);
      await refresh();
    },
    [db, refresh]
  );

  const eliminarPrecio = useCallback(
    async (id: number) => {
      await borrarPrecio(db, id);
      await refresh();
    },
    [db, refresh]
  );

  const limpiar = useCallback(async () => {
    await limpiarDatos(db);
    await refresh();
  }, [db, refresh]);

  return (
    <DataContext.Provider
      value={{
        gastos,
        ingresos,
        porPagar,
        proyeccion,
        estadisticas,
        fijosDelMes,
        fuentes,
        precios,
        guardarPrecio,
        eliminarPrecio,
        loading,
        guardar,
        alternar,
        pagar,
        refrescar: refresh,
        editando,
        abrirEdicion: setEditando,
        cerrarEdicion: () => setEditando(null),
        editar,
        eliminar,
        limpiar,
      }}
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
