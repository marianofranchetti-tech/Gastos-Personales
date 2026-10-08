/**
 * Cliente de Supabase. Si faltan las variables de entorno la app funciona como
 * siempre, solo en el dispositivo y sin cuentas (útil para desarrollar y para
 * los tests). Ver SUPABASE.md.
 *
 * La URL y la clave "anon" (publishable) son públicas por diseño: van dentro
 * de la app. Lo que protege los datos son las políticas RLS del SQL.
 */
import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { AppState, Platform } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && clave
    ? createClient(url, clave, {
        auth: {
          // En el teléfono la sesión vive en el localStorage de expo-sqlite;
          // en la web, en el del navegador.
          storage: globalThis.localStorage,
          autoRefreshToken: true,
          persistSession: true,
          // En la web Google vuelve con el token en la URL; en el teléfono lo
          // leemos nosotros del deep link.
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

// En el teléfono el token se refresca solo mientras la app está en primer
// plano: en segundo plano los timers no son confiables.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
