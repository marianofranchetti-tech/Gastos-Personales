-- =============================================================================
-- Fluxo: sincronización, perfiles y analítica.
--
-- Correr una sola vez en el SQL Editor del proyecto de Supabase (ver SUPABASE.md).
--
-- Modelo: cada dispositivo guarda todo en SQLite y sube/baja cambios. Acá vive
-- la copia de la nube. Cada fila lleva:
--   id                   uuid generado en el dispositivo (texto)
--   actualizado          hora del último cambio, puesta por el dispositivo
--   borrado              las bajas son marcas, para que los demás se enteren
--   servidor_actualizado hora de escritura acá; es el cursor de descarga
-- Gana el cambio más reciente: un `actualizado` más viejo que el guardado se
-- descarta en silencio (ver fluxo_ultimo_gana).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Datos del usuario (espejo de las tablas de SQLite)
-- -----------------------------------------------------------------------------

create table if not exists public.reglas_recurrentes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  tipo text,
  nombre text,
  categoria_id text,
  monto double precision,
  moneda text,
  periodo text,
  fijo smallint,
  fecha_inicio text,
  dia_venc smallint,
  dia_semana smallint,
  mes_anio smallint,
  fecha_fin text,
  activa smallint,
  actualizado timestamptz not null,
  borrado boolean not null default false,
  servidor_actualizado timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.transacciones (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  regla_id text,               -- id (uuid) de la regla que la generó
  tipo text,
  nombre text,
  categoria_id text,
  monto double precision,
  moneda text,
  fecha text,                  -- AAAA-MM-DD, igual que en el dispositivo
  venc text,
  estado text,
  pagado_en text,
  venc_regla text,
  actualizado timestamptz not null,
  borrado boolean not null default false,
  servidor_actualizado timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.precios (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  producto text,
  precio double precision,
  moneda text,
  comercio text,
  categoria_id text,
  fecha text,
  actualizado timestamptz not null,
  borrado boolean not null default false,
  servidor_actualizado timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists reglas_cursor on public.reglas_recurrentes (user_id, servidor_actualizado);
create index if not exists transacciones_cursor on public.transacciones (user_id, servidor_actualizado);
create index if not exists precios_cursor on public.precios (user_id, servidor_actualizado);

-- Gana el más reciente. Devolver null en un BEFORE UPDATE descarta esa fila
-- del upsert sin error: el dispositivo atrasado baja la versión buena después.
create or replace function public.fluxo_ultimo_gana()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.actualizado < old.actualizado then
      return null;
    end if;
    -- Una fila no cambia de dueño ni de id.
    new.user_id := old.user_id;
    new.id := old.id;
  end if;
  new.servidor_actualizado := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists ultimo_gana on public.reglas_recurrentes;
create trigger ultimo_gana before insert or update on public.reglas_recurrentes
  for each row execute function public.fluxo_ultimo_gana();
drop trigger if exists ultimo_gana on public.transacciones;
create trigger ultimo_gana before insert or update on public.transacciones
  for each row execute function public.fluxo_ultimo_gana();
drop trigger if exists ultimo_gana on public.precios;
create trigger ultimo_gana before insert or update on public.precios
  for each row execute function public.fluxo_ultimo_gana();

-- -----------------------------------------------------------------------------
-- Perfiles, dispositivos y eventos de uso
-- -----------------------------------------------------------------------------

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  nombre text,
  avatar_url text,
  proveedor text,                 -- google | email
  creado timestamptz not null default now(),
  ultimo_uso timestamptz,
  idioma text,                    -- es-AR
  pais text,                      -- AR (de la configuración regional)
  zona_horaria text,              -- America/Argentina/Buenos_Aires
  moneda_principal text,
  plataforma_ultima text,         -- android | ios | web
  version_app text,
  acepto_terminos_en timestamptz,
  version_terminos text
);

create table if not exists public.dispositivos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,               -- id local del dispositivo (sync_meta.dispositivo_id)
  plataforma text,
  sistema text,
  version_sistema text,
  marca text,
  modelo text,
  tipo text,                      -- telefono | tablet | escritorio
  version_app text,
  idioma text,
  zona_horaria text,
  primer_uso timestamptz not null default now(),
  ultimo_uso timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.eventos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dispositivo_id text,
  tipo text not null,
  props jsonb,
  ocurrido timestamptz not null,  -- en el dispositivo (puede llegar tarde, sin red)
  recibido timestamptz not null default now()
);

create index if not exists eventos_usuario on public.eventos (user_id, ocurrido);
create index if not exists eventos_tipo on public.eventos (tipo, ocurrido);

-- Perfil automático al crearse la cuenta (Google trae nombre y foto).
create or replace function public.fluxo_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre, avatar_url, proveedor)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'nombre'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    new.raw_app_meta_data ->> 'provider'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists fluxo_nuevo_usuario on auth.users;
create trigger fluxo_nuevo_usuario after insert on auth.users
  for each row execute function public.fluxo_nuevo_usuario();

-- -----------------------------------------------------------------------------
-- Seguridad: cada usuario ve y toca solo lo suyo
-- -----------------------------------------------------------------------------

alter table public.reglas_recurrentes enable row level security;
alter table public.transacciones enable row level security;
alter table public.precios enable row level security;
alter table public.perfiles enable row level security;
alter table public.dispositivos enable row level security;
alter table public.eventos enable row level security;

-- Sin sesión no se accede a nada.
revoke all on public.reglas_recurrentes, public.transacciones, public.precios,
              public.perfiles, public.dispositivos, public.eventos from anon;

drop policy if exists propias on public.reglas_recurrentes;
create policy propias on public.reglas_recurrentes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists propias on public.transacciones;
create policy propias on public.transacciones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists propias on public.precios;
create policy propias on public.precios for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists propias on public.dispositivos;
create policy propias on public.dispositivos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists propio on public.perfiles;
create policy propio on public.perfiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Eventos: cada uno carga y ve los suyos. La lectura no es un capricho: la app
-- sube con `on conflict (id) do nothing` (un reintento no duplica) y Postgres
-- exige permiso de SELECT para resolver ese conflicto; sin esta política la
-- carga falla por RLS.
drop policy if exists cargar on public.eventos;
drop policy if exists propios on public.eventos;
create policy propios on public.eventos for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists leer_propios on public.eventos;
create policy leer_propios on public.eventos for select to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Analítica para el administrador
--
-- Esquema `admin`: no está expuesto en la API, ningún usuario de la app lo
-- puede leer. Se consulta desde el SQL Editor o el Table Editor de Supabase
-- (eligiendo el esquema `admin`). Las vistas corren como su dueño (postgres),
-- así que ven a todos los usuarios.
-- -----------------------------------------------------------------------------

create schema if not exists admin;
revoke all on schema admin from public, anon, authenticated;

-- Quién usa la app y cuánto.
create or replace view admin.usuarios as
select
  p.id,
  p.email,
  p.nombre,
  p.proveedor,
  p.creado as alta,
  p.ultimo_uso,
  p.pais,
  p.idioma,
  p.zona_horaria,
  p.plataforma_ultima,
  p.version_app,
  p.acepto_terminos_en,
  (select count(*) from public.dispositivos d where d.user_id = p.id) as dispositivos,
  (select count(*) from public.transacciones t where t.user_id = p.id and not t.borrado) as movimientos,
  (select count(*) from public.reglas_recurrentes r where r.user_id = p.id and not r.borrado and r.activa = 1) as recurrentes_activos,
  (select count(*) from public.precios x where x.user_id = p.id and not x.borrado) as precios,
  (select count(distinct e.ocurrido::date) from public.eventos e
    where e.user_id = p.id and e.ocurrido > now() - interval '30 days') as dias_activos_30d,
  (select count(*) from public.eventos e
    where e.user_id = p.id and e.tipo = 'app_abierta' and e.ocurrido > now() - interval '30 days') as aperturas_30d,
  (select max(e.ocurrido) from public.eventos e where e.user_id = p.id) as ultimo_evento
from public.perfiles p;

-- Ingresos, gastos y resultado por usuario, mes y moneda.
create or replace view admin.finanzas_mensuales as
select
  t.user_id,
  p.email,
  substr(t.fecha, 1, 7) as mes,
  t.moneda,
  coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0) as ingresos,
  coalesce(sum(t.monto) filter (where t.tipo = 'ingreso' and t.estado = 'pagado'), 0) as ingresos_cobrados,
  coalesce(sum(t.monto) filter (where t.tipo = 'gasto'), 0) as gastos,
  coalesce(sum(t.monto) filter (where t.tipo = 'gasto' and t.estado = 'pagado'), 0) as gastos_pagados,
  coalesce(sum(t.monto) filter (where t.tipo = 'gasto' and t.estado = 'pendiente'), 0) as gastos_pendientes,
  coalesce(sum(t.monto) filter (
    where t.tipo = 'gasto' and t.estado = 'pendiente' and t.venc < to_char(current_date, 'YYYY-MM-DD')
  ), 0) as gastos_vencidos,
  coalesce(sum(t.monto) filter (where t.tipo = 'gasto' and r.fijo = 1), 0) as gastos_fijos,
  coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)
    - coalesce(sum(t.monto) filter (where t.tipo = 'gasto'), 0) as resultado,
  round((
    (coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0) - coalesce(sum(t.monto) filter (where t.tipo = 'gasto'), 0))
    / nullif(sum(t.monto) filter (where t.tipo = 'ingreso'), 0) * 100
  )::numeric, 1) as tasa_ahorro_pct,
  count(*) as movimientos
from public.transacciones t
join public.perfiles p on p.id = t.user_id
left join public.reglas_recurrentes r on r.user_id = t.user_id and r.id = t.regla_id
where not t.borrado and t.fecha is not null
group by t.user_id, p.email, substr(t.fecha, 1, 7), t.moneda;

-- En qué se va la plata, por mes.
create or replace view admin.gastos_por_categoria as
select
  t.user_id,
  p.email,
  substr(t.fecha, 1, 7) as mes,
  t.moneda,
  t.categoria_id,
  sum(t.monto) as total,
  count(*) as movimientos,
  round((100 * sum(t.monto)
    / nullif(sum(sum(t.monto)) over (partition by t.user_id, substr(t.fecha, 1, 7), t.moneda), 0))::numeric, 1) as pct_del_mes
from public.transacciones t
join public.perfiles p on p.id = t.user_id
where not t.borrado and t.tipo = 'gasto' and t.fecha is not null
group by t.user_id, p.email, substr(t.fecha, 1, 7), t.moneda, t.categoria_id;

-- Foto del comportamiento: promedio de los últimos 3 meses cerrados + deuda hoy.
create or replace view admin.comportamiento as
with meses as (
  select *
    from admin.finanzas_mensuales
   where mes >= to_char(date_trunc('month', current_date) - interval '3 months', 'YYYY-MM')
     and mes < to_char(current_date, 'YYYY-MM')
),
promedios as (
  select
    user_id,
    email,
    moneda,
    count(*) as meses_con_datos,
    round(avg(ingresos)::numeric, 0) as ingreso_mensual_prom,
    round(avg(gastos)::numeric, 0) as gasto_mensual_prom,
    round((sum(resultado) / nullif(sum(ingresos), 0) * 100)::numeric, 1) as tasa_ahorro_pct,
    round((sum(gastos_fijos) / nullif(sum(gastos), 0) * 100)::numeric, 1) as gasto_fijo_pct,
    count(*) filter (where resultado < 0) as meses_en_rojo
  from meses
  group by user_id, email, moneda
),
deuda as (
  select
    user_id,
    moneda,
    sum(monto) filter (where estado = 'pendiente') as pendiente_total,
    sum(monto) filter (where estado = 'pendiente' and venc < to_char(current_date, 'YYYY-MM-DD')) as vencido_total,
    count(*) filter (where estado = 'pendiente' and venc < to_char(current_date, 'YYYY-MM-DD')) as vencidos
  from public.transacciones
  where not borrado and tipo = 'gasto'
  group by user_id, moneda
),
categoria as (
  select distinct on (user_id, moneda) user_id, moneda, categoria_id as categoria_principal
    from public.transacciones
   where not borrado and tipo = 'gasto' and fecha >= to_char(current_date - 90, 'YYYY-MM-DD')
   group by user_id, moneda, categoria_id
   order by user_id, moneda, sum(monto) desc
)
select
  pr.*,
  coalesce(d.pendiente_total, 0) as pendiente_total,
  coalesce(d.vencido_total, 0) as vencido_total,
  coalesce(d.vencidos, 0) as vencidos,
  c.categoria_principal,
  case
    when pr.tasa_ahorro_pct is null then 'sin ingresos'
    when pr.tasa_ahorro_pct >= 20 then 'ahorrador'
    when pr.tasa_ahorro_pct >= 0 then 'equilibrado'
    else 'en rojo'
  end as perfil_financiero
from promedios pr
left join deuda d on d.user_id = pr.user_id and d.moneda = pr.moneda
left join categoria c on c.user_id = pr.user_id and c.moneda = pr.moneda;

-- Actividad diaria de toda la app.
create or replace view admin.actividad_diaria as
select
  e.ocurrido::date as dia,
  count(distinct e.user_id) as usuarios_activos,
  count(*) filter (where e.tipo = 'app_abierta') as aperturas,
  count(*) filter (where e.tipo = 'movimiento_creado') as movimientos_cargados,
  count(*) as eventos
from public.eventos e
group by e.ocurrido::date;
