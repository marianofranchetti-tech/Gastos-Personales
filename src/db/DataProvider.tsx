import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  actualizarTransaccion,
  Alcance,
  alternarEstado,
  crearTransaccion,
  eliminarPago as borrarPago,
  eliminarTransaccion,
  getPagos,
  getPorPagar,
  getTransaccionesConRegla,
  limpiarDatos,
  contarFueraDeRango,
  eliminarFueraDeRango,
  marcarPagada,
  moverFecha,
  NuevaTransaccion,
  PagoVista,
  registrarPago as insertarPago,
  TransaccionVista,
  volverAPendiente,
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
import { useAuth } from '../auth/AuthProvider';
import { InfoSync, useSincronizacion } from '../sync/useSincronizacion';
import { registrarEvento, TipoEvento } from '../sync/eventos';

const HORIZONTE_PROYECCION_MESES = 6;
/** Para los gráficos: alcanza para ver un año entero o navegar meses hacia adelante. */
const HORIZONTE_GRAFICOS_MESES = 24;

type DataContextType = {
  gastos: TransaccionVista[];
  ingresos: TransaccionVista[];
  porPagar: TransaccionVista[];
  /** Pagos y cobros registrados, de todos los conceptos (más reciente primero). */
  pagos: PagoVista[];
  proyeccion: ProyeccionPorMoneda;
  /** Igual que proyeccion pero a 24 meses, para las barras futuras de los gráficos. */
  proyeccionGraficos: ProyeccionPorMoneda;
  /** Serie de 13 meses que alimenta sugerencias y salud financiera. */
  estadisticas: MesBarra[];
  /** Gasto del mes comprometido por reglas fijas. */
  fijosDelMes: number;
  /** De dónde viene la plata, para medir concentración. */
  fuentes: { nombre: string; monto: number }[];
  precios: ResumenProducto[];
  guardarPrecio: (p: NuevoPrecio, id?: number) => Promise<void>;
  eliminarPrecio: (id: number) => Promise<void>;
  /** Precio abierto para editar, o null. */
  precioEditando: ResumenProducto | null;
  abrirPrecio: (p: ResumenProducto) => void;
  cerrarPrecio: () => void;
  loading: boolean;
  guardar: (input: NuevaTransaccion) => Promise<void>;
  alternar: (id: number) => Promise<void>;
  pagar: (id: number) => Promise<void>;
  /** Pago o cobro parcial (o total). Lanza PagoInvalido si supera el saldo. */
  registrarPago: (transaccionId: number, p: { monto: number; fecha?: string; nota?: string | null }) => Promise<void>;
  eliminarPago: (pagoId: number) => Promise<void>;
  /** Borra todos los pagos del concepto: queda pendiente por el total. */
  despagar: (transaccionId: number) => Promise<void>;
  /** Pasa un movimiento a otro día (vencimiento; la fecha se corre igual). */
  mover: (id: number, fecha: string) => Promise<void>;
  refrescar: () => Promise<void>;
  /** Movimiento abierto para editar, o null. Lo consume HomeShell. */
  editando: TransaccionVista | null;
  abrirEdicion: (t: TransaccionVista) => void;
  cerrarEdicion: () => void;
  editar: (id: number, input: NuevaTransaccion, alcance: Alcance) => Promise<void>;
  eliminar: (id: number, alcance: Alcance) => Promise<void>;
  limpiar: () => Promise<void>;
  /** Cuántos movimientos quedan antes de `desde` y después de `hasta`. */
  contarFuera: (desde: string, hasta: string) => Promise<{ antes: number; despues: number }>;
  /** Borra los movimientos fuera de [desde, hasta]. Devuelve cuántos borró. */
  depurar: (desde: string, hasta: string) => Promise<number>;
  /** Estado de la sincronización con la nube ('apagado' si no hay cuenta). */
  sync: InfoSync;
};

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [gastos, setGastos] = useState<TransaccionVista[]>([]);
  const [ingresos, setIngresos] = useState<TransaccionVista[]>([]);
  const [porPagar, setPorPagar] = useState<TransaccionVista[]>([]);
  const [pagos, setPagos] = useState<PagoVista[]>([]);
  const [proyeccion, setProyeccion] = useState<ProyeccionPorMoneda>({});
  const [proyeccionGraficos, setProyeccionGraficos] = useState<ProyeccionPorMoneda>({});
  const [estadisticas, setEstadisticas] = useState<MesBarra[]>([]);
  const [fijosDelMes, setFijosDelMes] = useState(0);
  const [fuentes, setFuentes] = useState<{ nombre: string; monto: number }[]>([]);
  const [precios, setPrecios] = useState<ResumenProducto[]>([]);
  const [precioEditando, setPrecioEditando] = useState<ResumenProducto | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<TransaccionVista | null>(null);

  const refresh = useCallback(async () => {
    const [g, i, pp, pa, pr, prg, est, fij, fue, pre] = await Promise.all([
      getTransaccionesConRegla(db, 'gasto'),
      getTransaccionesConRegla(db, 'ingreso'),
      getPorPagar(db),
      getPagos(db),
      calcularProyeccion(db, HORIZONTE_PROYECCION_MESES),
      calcularProyeccion(db, HORIZONTE_GRAFICOS_MESES),
      estadisticasVentana(db),
      gastosFijosDelMes(db),
      fuentesDeIngreso(db),
      resumenPorProducto(db),
    ]);
    setGastos(g);
    setIngresos(i);
    setPorPagar(pp);
    setPagos(pa);
    setProyeccion(pr);
    setProyeccionGraficos(prg);
    setEstadisticas(est);
    setFijosDelMes(fij);
    setFuentes(fue);
    setPrecios(pre);
    setLoading(false);
  }, [db]);

  // Lo que llega de otro dispositivo puede traer reglas nuevas: se materializa
  // antes de volver a leer, igual que al arrancar.
  const recargar = useCallback(async () => {
    try {
      await materializarRecurrentes(db);
    } catch (e) {
      console.warn('[recurrentes] materialización falló:', e);
    }
    await refresh();
  }, [db, refresh]);

  const { sesion } = useAuth();
  const { avisarCambio, ...sync } = useSincronizacion(db, sesion?.user.id ?? null, recargar);

  /** Después de cada cambio del usuario: registra el uso y agenda la subida. */
  const anotar = useCallback(
    (evento: TipoEvento, props?: Record<string, unknown>) => {
      registrarEvento(db, evento, props).finally(avisarCambio);
    },
    [db, avisarCambio]
  );

  useEffect(() => {
    registrarEvento(db, 'app_abierta');
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
      anotar('movimiento_creado', {
        tipo: input.tipo,
        categoria: input.categoria_id,
        monto: input.monto,
        moneda: input.moneda ?? null,
        recurrente: input.rec ? input.periodo ?? true : false,
        estado: input.estado ?? null,
      });
    },
    [db, refresh, anotar]
  );

  const alternar = useCallback(
    async (id: number) => {
      await alternarEstado(db, id);
      await refresh();
      anotar('movimiento_estado');
    },
    [db, refresh, anotar]
  );

  const pagar = useCallback(
    async (id: number) => {
      await marcarPagada(db, id);
      await refresh();
      anotar('movimiento_pagado');
    },
    [db, refresh, anotar]
  );

  const registrarPago = useCallback(
    async (transaccionId: number, p: { monto: number; fecha?: string; nota?: string | null }) => {
      await insertarPago(db, transaccionId, p);
      await refresh();
      anotar('pago_registrado', { monto: p.monto });
    },
    [db, refresh, anotar]
  );

  const eliminarPago = useCallback(
    async (pagoId: number) => {
      await borrarPago(db, pagoId);
      await refresh();
      anotar('pago_eliminado');
    },
    [db, refresh, anotar]
  );

  const despagar = useCallback(
    async (transaccionId: number) => {
      await volverAPendiente(db, transaccionId);
      await refresh();
      anotar('movimiento_estado');
    },
    [db, refresh, anotar]
  );

  const mover = useCallback(
    async (id: number, fecha: string) => {
      await moverFecha(db, id, fecha);
      await refresh();
      anotar('movimiento_movido');
    },
    [db, refresh, anotar]
  );

  const editar = useCallback(
    async (id: number, input: NuevaTransaccion, alcance: Alcance) => {
      await actualizarTransaccion(db, id, input, alcance);
      // Una edición puede haber creado una regla nueva o corrido un ancla,
      // así que hay que volver a materializar antes de leer.
      await materializarRecurrentes(db);
      await refresh();
      anotar('movimiento_editado', { alcance, categoria: input.categoria_id, monto: input.monto });
    },
    [db, refresh, anotar]
  );

  const eliminar = useCallback(
    async (id: number, alcance: Alcance) => {
      await eliminarTransaccion(db, id, alcance);
      await refresh();
      anotar('movimiento_eliminado', { alcance });
    },
    [db, refresh, anotar]
  );

  const guardarPrecio = useCallback(
    async (p: NuevoPrecio, id?: number) => {
      if (id != null) await actualizarPrecio(db, id, p);
      else await crearPrecio(db, p);
      await refresh();
      anotar('precio_guardado', { nuevo: id == null, categoria: p.categoria_id });
    },
    [db, refresh, anotar]
  );

  const eliminarPrecio = useCallback(
    async (id: number) => {
      await borrarPrecio(db, id);
      await refresh();
      anotar('precio_eliminado');
    },
    [db, refresh, anotar]
  );

  const limpiar = useCallback(async () => {
    await limpiarDatos(db);
    await refresh();
    anotar('datos_limpiados');
  }, [db, refresh, anotar]);

  const contarFuera = useCallback((desde: string, hasta: string) => contarFueraDeRango(db, desde, hasta), [db]);

  const depurar = useCallback(
    async (desde: string, hasta: string) => {
      const n = await eliminarFueraDeRango(db, desde, hasta);
      await refresh();
      anotar('datos_depurados', { borrados: n });
      return n;
    },
    [db, refresh, anotar]
  );

  return (
    <DataContext.Provider
      value={{
        gastos,
        ingresos,
        porPagar,
        pagos,
        proyeccion,
        proyeccionGraficos,
        estadisticas,
        fijosDelMes,
        fuentes,
        precios,
        guardarPrecio,
        eliminarPrecio,
        precioEditando,
        abrirPrecio: setPrecioEditando,
        cerrarPrecio: () => setPrecioEditando(null),
        loading,
        guardar,
        alternar,
        pagar,
        registrarPago,
        eliminarPago,
        despagar,
        mover,
        refrescar: refresh,
        editando,
        abrirEdicion: setEditando,
        cerrarEdicion: () => setEditando(null),
        editar,
        eliminar,
        limpiar,
        contarFuera,
        depurar,
        sync,
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
