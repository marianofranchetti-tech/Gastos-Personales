/**
 * Paletas de la app. `T` es UN objeto mutable que todas las pantallas leen al
 * renderizar (`style={{ color: T.text }}`). Cambiar de tema es copiar la otra
 * paleta encima de `T` y volver a renderizar desde la raíz (ver TemaProvider):
 * así ningún componente tuvo que cambiar su forma de pedir colores.
 *
 * Regla: nada fuera de un render puede leer `T` y guardarse el valor (un
 * `const X = T.algo` a nivel de módulo queda congelado en el tema de arranque).
 */
export type ModoTema = 'oscuro' | 'claro';

// Oscuro estilo Odoo — espejo de las variables CSS del prototipo Fluxo.
const OSCURO = {
  bgDeep: '#12151C',
  bg: '#1D212B',
  surface: '#262B38',
  surface2: '#2E3444',
  border: '#3A4150',
  text: '#E6E9EF',
  muted: '#9AA3B2',
  primary: '#714B67',
  primaryH: '#8A5C7E',
  primaryLight: '#C99BBD',
  primaryBadgeBg: 'rgba(113,75,103,.35)',
  teal: '#00A09D',
  tealD: '#017E84',
  tealBg: 'rgba(0,160,157,.15)',
  warn: '#E4A11B',
  warnBg: 'rgba(228,161,27,.15)',
  danger: '#D44C59',
  dangerBg: 'rgba(212,76,89,.15)',
  overlay: 'rgba(0,0,0,.6)',
};

// Claro: mismos roles, contraste AA sobre blanco. Los acentos se oscurecen un
// paso porque el teal y el rojo del modo oscuro quedan lavados sobre blanco.
const CLARO: typeof OSCURO = {
  bgDeep: '#E6E9EF',
  bg: '#F3F4F7',
  surface: '#FFFFFF',
  surface2: '#ECEEF3',
  border: '#D5D9E2',
  text: '#1C2130',
  muted: '#5D6576',
  primary: '#714B67',
  primaryH: '#5E3E56',
  primaryLight: '#714B67',
  primaryBadgeBg: 'rgba(113,75,103,.12)',
  teal: '#00807D',
  tealD: '#017E84',
  tealBg: 'rgba(0,128,125,.10)',
  warn: '#B7791F',
  warnBg: 'rgba(183,121,31,.12)',
  danger: '#C23B48',
  dangerBg: 'rgba(194,59,72,.10)',
  overlay: 'rgba(15,18,26,.45)',
};

export const PALETAS: Record<ModoTema, typeof OSCURO> = { oscuro: OSCURO, claro: CLARO };

export const T = { ...OSCURO };

export function aplicarTema(modo: ModoTema) {
  Object.assign(T, PALETAS[modo]);
}

/**
 * Sombra de los botones flotantes.
 *
 * `elevation` es solo de Android: en iOS no hace nada y los botones quedan
 * planos, pegados al fondo. iOS necesita las cuatro propiedades de shadow.
 * Declarar las dos cosas juntas funciona en ambas plataformas, porque cada una
 * ignora las que no entiende.
 */
export const SOMBRA_FLOTANTE = {
  elevation: 6,
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 3 },
} as const;

export const APP_NAME = 'Fluxo'; // ⚠ PROVISORIO (alternativa: Proxar). Verificar tiendas + INPI antes de invertir en marca.
