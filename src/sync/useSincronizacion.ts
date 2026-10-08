/**
 * Cuándo se sincroniza: al entrar, un rato después de cada cambio, al volver
 * la app al frente, al recuperar la red (web) y cada minuto mientras está
 * abierta. Nunca dos a la vez: si piden otra en el medio, se encadena.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { cantidadPendientes, escribirMeta, leerMeta, sincronizar } from './motor';
import { supabase } from './supabase';
import { registrarUso, remotoSupabase } from './remotoSupabase';

export type EstadoSync = 'apagado' | 'sincronizando' | 'al_dia' | 'sin_conexion' | 'error';

export type InfoSync = {
  estado: EstadoSync;
  ultima: Date | null;
  pendientes: number;
  error: string | null;
  sincronizarAhora: () => Promise<void>;
};

const ESPERA_TRAS_CAMBIO_MS = 1500;
const CADA_MS = 60_000;

const esFallaDeRed = (e: unknown) => /network|fetch|timeout|failed to fetch/i.test((e as Error)?.message ?? String(e));

export function useSincronizacion(
  db: SQLiteDatabase,
  usuarioId: string | null,
  alTraerCambios: () => Promise<void>
): InfoSync & { avisarCambio: () => void } {
  const activo = !!supabase && !!usuarioId;
  const [estado, setEstado] = useState<EstadoSync>(activo ? 'sincronizando' : 'apagado');
  const [ultima, setUltima] = useState<Date | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const enCurso = useRef<Promise<void> | null>(null);
  const otraVez = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La última versión del callback, sin re-crear sincronizarAhora en cada render.
  const alTraer = useRef(alTraerCambios);
  alTraer.current = alTraerCambios;

  const sincronizarAhora = useCallback(async () => {
    if (!supabase || !usuarioId) return;
    if (enCurso.current) {
      otraVez.current = true;
      return enCurso.current;
    }
    const cliente = supabase;
    const vuelta = (async () => {
      setEstado('sincronizando');
      try {
        do {
          otraVez.current = false;
          const r = await sincronizar(db, remotoSupabase(cliente, usuarioId), usuarioId);
          if (r.bajados > 0 || r.depurados > 0) await alTraer.current();
        } while (otraVez.current);
        setUltima(new Date());
        setError(null);
        setEstado('al_dia');
      } catch (e) {
        console.warn('[sync]', e);
        setError((e as Error)?.message ?? String(e));
        setEstado(esFallaDeRed(e) ? 'sin_conexion' : 'error');
      } finally {
        setPendientes(await cantidadPendientes(db).catch(() => 0));
        enCurso.current = null;
      }
    })();
    enCurso.current = vuelta;
    return vuelta;
  }, [db, usuarioId]);

  const avisarCambio = useCallback(() => {
    if (!supabase || !usuarioId) return;
    setPendientes((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      sincronizarAhora();
    }, ESPERA_TRAS_CAMBIO_MS);
  }, [usuarioId, sincronizarAhora]);

  useEffect(() => {
    if (!supabase || !usuarioId) {
      setEstado('apagado');
      return;
    }
    const cliente = supabase;
    let vivo = true;

    (async () => {
      await sincronizarAhora();
      // Perfil y dispositivo: una vez por arranque. Si falla, sigue en la próxima.
      try {
        const acepto = await leerMeta(db, 'acepto_terminos_en');
        await registrarUso(cliente, usuarioId, await leerMeta(db, 'dispositivo_id'), { acepto_terminos_en: acepto });
        if (acepto && vivo) await escribirMeta(db, 'acepto_terminos_en', null);
      } catch (e) {
        console.warn('[sync] perfil', e);
      }
    })();

    const intervalo = setInterval(sincronizarAhora, CADA_MS);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') sincronizarAhora();
    });
    const alVolverLaRed = () => sincronizarAhora();
    if (Platform.OS === 'web') window.addEventListener('online', alVolverLaRed);

    return () => {
      vivo = false;
      clearInterval(intervalo);
      app.remove();
      if (Platform.OS === 'web') window.removeEventListener('online', alVolverLaRed);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [db, usuarioId, sincronizarAhora]);

  return { estado, ultima, pendientes, error, sincronizarAhora, avisarCambio };
}
