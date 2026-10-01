import { useWindowDimensions, ViewStyle } from 'react-native';

/** A partir de este ancho la app usa navegación lateral y columnas. */
export const ANCHO_PC = 900;

/**
 * Teléfono: una columna, pestañas abajo.
 * PC / tablet apaisada: menú lateral, contenido centrado con ancho máximo y,
 * en Inicio, dos columnas.
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const pc = width >= ANCHO_PC;
  const contenido: ViewStyle = {
    width: '100%',
    maxWidth: pc ? 1180 : 680,
    alignSelf: 'center',
    paddingHorizontal: pc ? 24 : 16,
    paddingTop: pc ? 24 : 16,
    paddingBottom: 110,
  };
  return { pc, contenido };
}
