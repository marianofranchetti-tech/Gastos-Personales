/**
 * Sesión del usuario: entrar con Google o con mail y contraseña, crear cuenta,
 * recuperar la contraseña y salir.
 *
 * Google en el teléfono abre el navegador del sistema y vuelve a la app por
 * deep link (fluxo://auth). En la web es una redirección común y supabase-js
 * lee el token de la URL solo.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../sync/supabase';

// En la web, cierra la ventana emergente de Google si la hubiera.
WebBrowser.maybeCompleteAuthSession();

type AuthContextType = {
  /** false si la app corre sin Supabase configurado: modo local, sin cuentas. */
  habilitado: boolean;
  sesion: Session | null;
  cargando: boolean;
  /** El usuario abrió el link de "olvidé mi contraseña": hay que pedirle una nueva. */
  recuperando: boolean;
  entrarConGoogle: () => Promise<void>;
  entrarConMail: (email: string, clave: string) => Promise<void>;
  /** Devuelve true si la cuenta quedó lista; false si falta confirmar el mail. */
  crearCuenta: (email: string, clave: string, nombre: string) => Promise<boolean>;
  recuperarClave: (email: string) => Promise<void>;
  cambiarClave: (clave: string) => Promise<void>;
  salir: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

/** Adónde vuelve el usuario después de Google o de un link por mail. */
function urlDeRetorno(): string {
  if (Platform.OS === 'web') return window.location.origin;
  return Linking.createURL('auth');
}

/** Parámetros de un link de retorno: los tokens llegan en el #fragmento, a veces en el ?query. */
function parametros(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const hash = url.split('#')[1] ?? '';
  for (const parte of `${query}&${hash}`.split('&')) {
    if (!parte) continue;
    const [k, v = ''] = parte.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

/** Traduce los errores de Supabase que puede ver el usuario. */
export function mensajeDeError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/invalid login credentials/i.test(m)) return 'Mail o contraseña incorrectos.';
  if (/email not confirmed/i.test(m)) return 'Todavía no confirmaste tu mail. Revisá tu casilla.';
  if (/user already registered/i.test(m)) return 'Ya existe una cuenta con ese mail. Entrá o recuperá la contraseña.';
  if (/password should be at least/i.test(m)) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (/unable to validate email|invalid email/i.test(m)) return 'Ese mail no parece válido.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Esperá un rato y probá de nuevo.';
  if (/network|fetch/i.test(m)) return 'Sin conexión. Para entrar hace falta internet.';
  return m;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(!!supabase);
  const [recuperando, setRecuperando] = useState(false);

  /** Toma los tokens de un link de retorno (Google, confirmación de mail, recuperación). */
  const sesionDesdeUrl = useCallback(async (url: string) => {
    if (!supabase) return;
    const p = parametros(url);
    if (p.error_description || p.error) throw new Error(p.error_description || p.error);
    if (p.access_token && p.refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
      if (error) throw error;
    } else if (p.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(p.code);
      if (error) throw error;
    }
    if (p.type === 'recovery') setRecuperando(true);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let vivo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSesion(data.session);
      setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true);
    });

    // Teléfono: links de mail (confirmación, recuperación) que abren la app.
    let quitarLink: (() => void) | undefined;
    if (Platform.OS !== 'web') {
      const abrir = (url: string | null) => {
        if (url && /access_token|code=|error/.test(url)) {
          sesionDesdeUrl(url).catch((e) => console.warn('[auth] link de retorno', e));
        }
      };
      Linking.getInitialURL().then(abrir);
      const s = Linking.addEventListener('url', ({ url }) => abrir(url));
      quitarLink = () => s.remove();
    }

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
      quitarLink?.();
    };
  }, [sesionDesdeUrl]);

  const entrarConGoogle = useCallback(async () => {
    if (!supabase) return;
    const redirectTo = urlDeRetorno();
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
      return; // el navegador se va a Google y vuelve
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    const r = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (r.type === 'success') await sesionDesdeUrl(r.url);
  }, [sesionDesdeUrl]);

  const entrarConMail = useCallback(async (email: string, clave: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
    if (error) throw error;
  }, []);

  const crearCuenta = useCallback(async (email: string, clave: string, nombre: string) => {
    if (!supabase) return false;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: clave,
      options: { emailRedirectTo: urlDeRetorno(), data: { nombre: nombre.trim() || null } },
    });
    if (error) throw error;
    // Con la confirmación de mail activada, no hay sesión hasta que toque el link.
    return !!data.session;
  }, []);

  const recuperarClave = useCallback(async (email: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: urlDeRetorno() });
    if (error) throw error;
  }, []);

  const cambiarClave = useCallback(async (clave: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password: clave });
    if (error) throw error;
    setRecuperando(false);
  }, []);

  const salir = useCallback(async () => {
    if (!supabase) return;
    setRecuperando(false);
    // 'local': cierra este dispositivo, no las sesiones de los demás.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        habilitado: !!supabase,
        sesion,
        cargando,
        recuperando,
        entrarConGoogle,
        entrarConMail,
        crearCuenta,
        recuperarClave,
        cambiarClave,
        salir,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
