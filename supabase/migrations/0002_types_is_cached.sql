-- Track per-type sync completion: a type with is_cached = true has its full
-- pokemon membership in pokemon_types, so type filters can be served purely
-- from our database (and the background sweep can resume where it left off).
alter table types add column if not exists is_cached boolean not null default false;
alter table types add column if not exists cached_at timestamptz;
