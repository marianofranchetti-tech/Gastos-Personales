export type TipoTx = 'gasto' | 'ingreso';
export type Periodo = 'diario' | 'semanal' | 'mensual' | 'anual';

export type Categoria = { id: string; nombre: string; emoji: string; tipo: TipoTx; color: string };

export const CATS: Categoria[] = [
  { id: 'auto', nombre: 'Automóvil', emoji: '🚗', tipo: 'gasto', color: '#5B8DEF' },
  { id: 'casa', nombre: 'Casa', emoji: '🏠', tipo: 'gasto', color: '#E4A11B' },
  { id: 'comida', nombre: 'Comida', emoji: '🛒', tipo: 'gasto', color: '#6FBF73' },
  { id: 'tel', nombre: 'Internet y telefonía', emoji: '📶', tipo: 'gasto', color: '#4FC3F7' },
  { id: 'dep', nombre: 'Deportes', emoji: '⚽', tipo: 'gasto', color: '#9CCC65' },
  { id: 'entr', nombre: 'Entretenimiento', emoji: '🎬', tipo: 'gasto', color: '#BA68C8' },
  { id: 'fact', nombre: 'Facturas', emoji: '🧾', tipo: 'gasto', color: '#90A4AE' },
  { id: 'hig', nombre: 'Higiene', emoji: '🧴', tipo: 'gasto', color: '#4DD0E1' },
  { id: 'masc', nombre: 'Mascotas', emoji: '🐾', tipo: 'gasto', color: '#A1887F' },
  { id: 'reg', nombre: 'Regalos', emoji: '🎁', tipo: 'gasto', color: '#F06292' },
  { id: 'rest', nombre: 'Restaurante', emoji: '🍽️', tipo: 'gasto', color: '#FF8A65' },
  { id: 'ropa', nombre: 'Ropa', emoji: '👕', tipo: 'gasto', color: '#7986CB' },
  { id: 'salud', nombre: 'Salud', emoji: '🩺', tipo: 'gasto', color: '#EF5350' },
  { id: 'transp', nombre: 'Transporte', emoji: '🚌', tipo: 'gasto', color: '#FFD54F' },
  { id: 'prest', nombre: 'Préstamos', emoji: '🏦', tipo: 'gasto', color: '#C0A16B' },
];

export const CATS_ING: Categoria[] = [
  { id: 'salario', nombre: 'Salario', emoji: '💼', tipo: 'ingreso', color: '#00A09D' },
  { id: 'ahorro', nombre: 'Ahorro', emoji: '🐖', tipo: 'ingreso', color: '#4DB6AC' },
  { id: 'extras', nombre: 'Extras', emoji: '✨', tipo: 'ingreso', color: '#81C784' },
];

export const TODAS_CATS: Categoria[] = [...CATS, ...CATS_ING];

export const PERIODOS: { id: Periodo; nombre: string; dias: number }[] = [
  { id: 'diario', nombre: 'Diario', dias: 1 },
  { id: 'semanal', nombre: 'Semanal', dias: 7 },
  { id: 'mensual', nombre: 'Mensual', dias: 30 },
  { id: 'anual', nombre: 'Anual', dias: 365 },
];

export const MONEDAS = ['ARS', 'USD', 'EUR'] as const;
export type Moneda = (typeof MONEDAS)[number];
export const MONEDA_DEFAULT: Moneda = 'ARS';
