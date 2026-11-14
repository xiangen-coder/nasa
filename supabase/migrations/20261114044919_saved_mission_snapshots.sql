alter table public.search_history
  add column snapshot jsonb
    check (snapshot is null or (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 1000000)),
  add column has_snapshot boolean generated always as (snapshot is not null) stored;
