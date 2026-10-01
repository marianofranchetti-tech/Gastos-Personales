import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { hoyISO } from './fechasRecurrentes';
import { Granularidad, moverAncla } from './periodo';

/**
 * Un solo período para todos los gráficos de la app. Si el gráfico de barras
 * y el de categorías tuvieran cada uno su filtro, terminarían mostrando
 * períodos distintos lado a lado sin que se note.
 */
type Ctx = {
  g: Granularidad;
  ancla: string;
  setG: (g: Granularidad) => void;
  mover: (delta: number) => void;
  irAHoy: () => void;
};

const PeriodoContext = createContext<Ctx | null>(null);

export function PeriodoProvider({ children }: { children: ReactNode }) {
  const [g, setG] = useState<Granularidad>('mes');
  const [ancla, setAncla] = useState(hoyISO);
  const value = useMemo(
    () => ({
      g,
      ancla,
      setG,
      mover: (d: number) => setAncla((a) => moverAncla(g, a, d)),
      irAHoy: () => setAncla(hoyISO()),
    }),
    [g, ancla]
  );
  return <PeriodoContext.Provider value={value}>{children}</PeriodoContext.Provider>;
}

export function usePeriodo() {
  const ctx = useContext(PeriodoContext);
  if (!ctx) throw new Error('usePeriodo debe usarse dentro de <PeriodoProvider>');
  return ctx;
}
