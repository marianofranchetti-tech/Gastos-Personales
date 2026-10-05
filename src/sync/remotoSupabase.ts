/**
 * El `Remoto` del motor de sincronización, implementado sobre Supabase.
 * Más el registro de perfil y dispositivo, que no pasa por la cola.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoRemoto, FilaRemota, Remoto, TablaSync } from './motor';

export function remotoSupabase(supabase: SupabaseClient, usuarioId: string): Remoto {
  return {
    async traer(tabla: TablaSync, desde: string, limite: number) {
      const { data, error } = await supabase
        .from(tabla)
        .select('*')
        .eq('user_id', usuarioId)
        .gt('servidor_actualizado', desde)
        .order('servidor_actualizado', { ascending: true })
        .limit(limite);
      if (error) throw error;
      return (data ?? []) as FilaRemota[];
    },

    async subir(tabla: TablaSync, filas: FilaRemota[]) {
      const { error } = await supabase.from(tabla).upsert(filas, { onConflict: 'user_id,id' });
      if (error) throw error;
    },

    async subirEventos(eventos: EventoRemoto[]) {
      const { error } = await supabase.from('eventos').upsert(eventos, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}

/** Versión de los términos que acepta el usuario al entrar (ver LoginScreen). */
export const VERSION_TERMINOS = '2026-10-05';

function regional() {
  const opciones = Intl.DateTimeFormat().resolvedOptions();
  const idioma = opciones.locale ?? null;
  // 'es-AR' -> 'AR'. Es la región configurada en el equipo, no su ubicación.
  const pais = idioma?.split('-')[1]?.toUpperCase() ?? null;
  return { idioma, pais, zona_horaria: opciones.timeZone ?? null };
}

const TIPO_DISPOSITIVO: Record<number, string> = {
  [Device.DeviceType.PHONE]: 'telefono',
  [Device.DeviceType.TABLET]: 'tablet',
  [Device.DeviceType.DESKTOP]: 'escritorio',
  [Device.DeviceType.TV]: 'tv',
};

/**
 * Actualiza el perfil (último uso, región, versión) y la ficha de este
 * dispositivo. Corre una vez por arranque, después de sincronizar.
 */
export async function registrarUso(
  supabase: SupabaseClient,
  usuarioId: string,
  dispositivoId: string | null,
  extra: { moneda_principal?: string; acepto_terminos_en?: string | null }
): Promise<void> {
  const ahora = new Date().toISOString();
  const { idioma, pais, zona_horaria } = regional();
  const version_app = Constants.expoConfig?.version ?? null;

  const perfil: Record<string, unknown> = {
    ultimo_uso: ahora,
    idioma,
    pais,
    zona_horaria,
    plataforma_ultima: Platform.OS,
    version_app,
  };
  if (extra.moneda_principal) perfil.moneda_principal = extra.moneda_principal;
  if (extra.acepto_terminos_en) {
    perfil.acepto_terminos_en = extra.acepto_terminos_en;
    perfil.version_terminos = VERSION_TERMINOS;
  }
  // upsert y no update: si la cuenta es anterior al trigger que crea el perfil, lo crea acá.
  const p = await supabase.from('perfiles').upsert({ id: usuarioId, ...perfil }, { onConflict: 'id' });
  if (p.error) throw p.error;

  if (!dispositivoId) return;
  const d = await supabase.from('dispositivos').upsert(
    {
      user_id: usuarioId,
      id: dispositivoId,
      plataforma: Platform.OS,
      sistema: Device.osName,
      version_sistema: Device.osVersion,
      marca: Device.brand,
      modelo: Device.modelName,
      tipo: Device.deviceType != null ? TIPO_DISPOSITIVO[Device.deviceType] ?? null : null,
      version_app,
      idioma,
      zona_horaria,
      ultimo_uso: ahora,
    },
    { onConflict: 'user_id,id' }
  );
  if (d.error) throw d.error;
}
