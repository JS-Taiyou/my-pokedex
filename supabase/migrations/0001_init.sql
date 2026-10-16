-- Initial pokedex schema.
-- RLS is enabled with no policies on every table: the Supabase-hosted REST
-- API (anon/authenticated roles) can touch nothing, while our backend's
-- direct Postgres connection owns the data end to end.

create table pokemon (
  id integer primary key,                       -- same ids PokeAPI returns
  name text not null,
  data_url text not null,                       -- the endpoint that lists it
  is_cached boolean not null default false,     -- details enriched from PokeAPI yet?
  image_url text,
  genders jsonb not null default '[]'::jsonb,
  category text,
  height integer,                               -- decimeters, as PokeAPI reports
  weight integer,                               -- hectograms, as PokeAPI reports
  stats jsonb,
  evolutions jsonb,
  cached_at timestamptz
);

create index pokemon_name_idx on pokemon (name);
create index pokemon_uncached_idx on pokemon (is_cached) where not is_cached;

create table types (
  id integer primary key,
  name text not null unique,
  colors jsonb not null                         -- [primary, tint]
);

create table abilities (
  id integer primary key,
  name text not null,
  description text
);

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table user_favorites (
  user_id uuid not null references users (id) on delete cascade,
  pokemon_id integer not null references pokemon (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pokemon_id)
);

create table pokemon_types (
  pokemon_id integer not null references pokemon (id) on delete cascade,
  type_id integer not null references types (id) on delete cascade,
  slot integer not null,
  primary key (pokemon_id, type_id)
);

create table pokemon_abilities (
  pokemon_id integer not null references pokemon (id) on delete cascade,
  ability_id integer not null references abilities (id) on delete cascade,
  is_hidden boolean not null default false,
  slot integer not null,
  primary key (pokemon_id, ability_id)
);

create table pokemon_weaknesses (
  pokemon_id integer not null references pokemon (id) on delete cascade,
  type_id integer not null references types (id) on delete cascade,
  modifier varchar(255) not null,               -- '4' | '2' | '0.5' | '0.25' | '0'
  primary key (pokemon_id, type_id)
);

-- Postgres does not index referencing sides of foreign keys automatically.
create index user_favorites_pokemon_idx on user_favorites (pokemon_id);
create index pokemon_types_type_idx on pokemon_types (type_id);
create index pokemon_abilities_ability_idx on pokemon_abilities (ability_id);
create index pokemon_weaknesses_type_idx on pokemon_weaknesses (type_id);

alter table pokemon enable row level security;
alter table types enable row level security;
alter table abilities enable row level security;
alter table users enable row level security;
alter table user_favorites enable row level security;
alter table pokemon_types enable row level security;
alter table pokemon_abilities enable row level security;
alter table pokemon_weaknesses enable row level security;
