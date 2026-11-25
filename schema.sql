-- Ejecuta este archivo una sola vez en Supabase → SQL Editor → New query → Run.
-- Crea las tablas de la app y las reglas para que cada persona vea SOLO sus datos.

-- 1) Datos de cada usuario (movimientos, metas, presupuestos, etc.)
create table if not exists public.docs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  kind       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.docs enable row level security;

drop policy if exists "docs: ver los propios" on public.docs;
drop policy if exists "docs: crear los propios" on public.docs;
drop policy if exists "docs: editar los propios" on public.docs;
drop policy if exists "docs: borrar los propios" on public.docs;
create policy "docs: ver los propios"    on public.docs for select to authenticated using (auth.uid() = user_id);
create policy "docs: crear los propios"  on public.docs for insert to authenticated with check (auth.uid() = user_id);
create policy "docs: editar los propios" on public.docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "docs: borrar los propios" on public.docs for delete to authenticated using (auth.uid() = user_id);

-- 2) Comentarios de quienes prueban la app. Los usuarios solo pueden enviar;
--    tú los lees en Table Editor → feedback.
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  email      text,
  message    text not null check (char_length(message) between 1 and 2000),
  page       text,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback: enviar" on public.feedback;
create policy "feedback: enviar" on public.feedback for insert to authenticated with check (auth.uid() = user_id);
