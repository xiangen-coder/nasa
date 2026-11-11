create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now()
);
create index search_history_owner_date on public.search_history (user_id, created_at desc);
alter table public.search_history enable row level security;
revoke all on public.search_history from anon, authenticated;
grant select, insert, delete on public.search_history to authenticated;
create policy "Read own searches" on public.search_history for select to authenticated using ((select auth.uid()) = user_id);
create policy "Save own searches" on public.search_history for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own searches" on public.search_history for delete to authenticated using ((select auth.uid()) = user_id);
