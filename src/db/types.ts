import { Periodo, TipoTx } from '../lib/categorias';

export type Estado = 'pendiente' | 'pagado';

export type Cuenta = {
  id: number;
  nombre: string;
  moneda: string;
  saldo_inicial: number;
  icono: string | null;
};

export type ReglaRecurrente = {
  id: number;
  tipo: TipoTx;
  nombre: string;
  categoria_id: string;
  cuenta_id: number | null;
  monto: number;
  moneda: string;
  periodo: Periodo;
  fijo: number; // 0 | 1, sólo aplica a gastos
  fecha_inicio: string;
  dia_venc: number | null;
  activa: number; // 0 | 1
};

export type Transaccion = {
  id: number;
  tipo: TipoTx;
  nombre: string;
  categoria_id: string;
  cuenta_id: number | null;
  monto: number;
  moneda: string;
  fecha: string;
  venc: string | null;
  estado: Estado;
  regla_recurrente_id: number | null;
};

export type Presupuesto = {
  id: number;
  categoria_id: string | null;
  mes: string; // 'YYYY-MM'
  monto_limite: number;
  moneda: string;
};
