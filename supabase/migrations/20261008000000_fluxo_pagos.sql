-- =============================================================================
-- Fluxo: pagos y cobros parciales (app v9).
--
-- Correr una vez en el SQL Editor, DESPUÉS de 20261005000000_fluxo_sync.sql.
-- Se puede correr de nuevo sin romper nada.
--
-- Cada concepto (transacción) tiene un solo vencimiento; lo que se va pagando
-- son filas de `pagos`. transacciones.estado sigue existiendo como "saldado por
-- completo", así las vistas de admin no cambian de significado.
--
-- Mientras esta tabla no exista, la app sincroniza todo lo demás y deja los
-- pagos en su cola local hasta que aparezca.
-- =============================================================================

create table if not exists public.pagos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  transaccion_id text,          -- id (uuid) de la transacción pagada
  monto double precision,
  fecha text,                   -- AAAA-MM-DD, día del pago o cobro
  nota text,
  actualizado timestamptz not null,
  borrado boolean not null default false,
  servidor_actualizado timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists pagos_cursor on public.pagos (user_id, servidor_actualizado);
create index if not exists pagos_transaccion on public.pagos (user_id, transaccion_id);

drop trigger if exists ultimo_gana on public.pagos;
create trigger ultimo_gana before insert or update on public.pagos
  for each row execute function public.fluxo_ultimo_gana();

alter table public.pagos enable row level security;
revoke all on public.pagos from anon;

drop policy if exists propias on public.pagos;
create policy propias on public.pagos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
