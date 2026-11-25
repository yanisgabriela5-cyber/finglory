-- Ejecuta este archivo una sola vez en Supabase → SQL Editor → New query → Run.
-- Las tablas llevan el prefijo fg_ para poder convivir con otras apps en el mismo proyecto.
-- Crea las tablas de la app y las reglas para que cada persona vea SOLO sus datos.

-- 1) Datos de cada usuario (movimientos, metas, presupuestos, etc.)
create table if not exists public.fg_docs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  kind       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.fg_docs enable row level security;

drop policy if exists "fg_docs: ver los propios" on public.fg_docs;
drop policy if exists "fg_docs: crear los propios" on public.fg_docs;
drop policy if exists "fg_docs: editar los propios" on public.fg_docs;
drop policy if exists "fg_docs: borrar los propios" on public.fg_docs;
create policy "fg_docs: ver los propios"    on public.fg_docs for select to authenticated using (auth.uid() = user_id);
create policy "fg_docs: crear los propios"  on public.fg_docs for insert to authenticated with check (auth.uid() = user_id);
create policy "fg_docs: editar los propios" on public.fg_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fg_docs: borrar los propios" on public.fg_docs for delete to authenticated using (auth.uid() = user_id);

-- 2) Comentarios de quienes prueban la app. Los usuarios solo pueden enviar;
--    tú los lees en Table Editor → feedback.
create table if not exists public.fg_feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  email      text,
  message    text not null check (char_length(message) between 1 and 2000),
  page       text,
  created_at timestamptz not null default now()
);
alter table public.fg_feedback enable row level security;
drop policy if exists "fg_feedback: enviar" on public.fg_feedback;
create policy "fg_feedback: enviar" on public.fg_feedback for insert to authenticated with check (auth.uid() = user_id);
