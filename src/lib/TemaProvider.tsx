import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Appearance, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { aplicarTema, ModoTema, T } from './theme';

/**
 * Tema claro / oscuro.
 *
 * Arranca con el del sistema operativo y, si la persona elige otro, lo guarda
 * en la tabla `config` para el próximo arranque. Cambiar de tema reescribe `T`
 * y cambia el estado de este provider: HomeShell lee el contexto, así que se
 * vuelve a renderizar con todo lo que tiene adentro y cada estilo inline toma
 * los colores nuevos. Nadie se desmonta: no se pierde la pestaña ni un form.
 */
type Ctx = { modo: ModoTema; alternar: () => void };
const TemaContext = createContext<Ctx | null>(null);

const CLAVE = 'tema';
const delSistema = (): ModoTema => (Appearance.getColorScheme() === 'light' ? 'claro' : 'oscuro');

export function TemaProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [modo, setModo] = useState<ModoTema>(() => {
    const m = delSistema();
    aplicarTema(m);
    return m;
  });

  // Preferencia guardada, si la hay. Pisa a la del sistema.
  useEffect(() => {
    db.getFirstAsync<{ valor: string }>('SELECT valor FROM config WHERE clave = ?', CLAVE)
      .then((r) => {
        if (r?.valor === 'claro' || r?.valor === 'oscuro') {
          aplicarTema(r.valor);
          setModo(r.valor);
        }
      })
      .catch(() => {});
  }, [db]);

  useEffect(() => {
    if (Platform.OS === 'web') estilosWeb(modo);
  }, [modo]);

  const alternar = useCallback(() => {
    const nuevo: ModoTema = modo === 'oscuro' ? 'claro' : 'oscuro';
    aplicarTema(nuevo);
    setModo(nuevo);
    db.runAsync(
      'INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
      CLAVE,
      nuevo
    ).catch(() => {});
  }, [db, modo]);

  return <TemaContext.Provider value={{ modo, alternar }}>{children}</TemaContext.Provider>;
}

export function useTema() {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema debe usarse dentro de <TemaProvider>');
  return ctx;
}

/**
 * Solo web: barra de scroll visible y arrastrable con el mouse, con los
 * colores del tema. En el teléfono el scroll es con el dedo y el indicador
 * nativo alcanza; en la PC la barra lateral es la forma de navegar páginas
 * largas.
 */
function estilosWeb(modo: ModoTema) {
  if (typeof document === 'undefined') return;
  let tag = document.getElementById('fluxo-tema') as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'fluxo-tema';
    document.head.appendChild(tag);
  }
  const pulgar = modo === 'oscuro' ? '#4A5266' : '#B4BAC6';
  const pulgarH = modo === 'oscuro' ? '#5E6880' : '#959CAB';
  tag.textContent = `
    :root { color-scheme: ${modo === 'oscuro' ? 'dark' : 'light'}; }
    body { background: ${T.bgDeep}; }
    * { scrollbar-width: auto; scrollbar-color: ${pulgar} transparent; }
    ::-webkit-scrollbar { width: 12px; height: 12px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${pulgar}; border-radius: 8px; border: 3px solid transparent; background-clip: content-box; }
    ::-webkit-scrollbar-thumb:hover { background: ${pulgarH}; background-clip: content-box; border: 3px solid transparent; }
  `;
}
