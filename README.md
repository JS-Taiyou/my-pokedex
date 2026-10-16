# My Pokédex

A Pokédex web app: **Hono** on Node.js serving both a REST API and a **React + Tailwind + shadcn/ui + Motion** frontend, with **Supabase Postgres** as the database.

The browser never talks to [PokeAPI](https://pokeapi.co) — only the backend does. Pokemon details are fetched from PokeAPI at most once ever, cached into our database (`is_cached` flips to `true`), and every later request is served purely from Postgres. While a first-visit cache miss is being enriched, the client sees shadcn skeletons.

## Layout

```
src/                  Hono server (API routes, PokeAPI client, enrichment)
src/scripts/          fetch:list, db:migrate, db:seed, enrich
supabase/migrations/  SQL schema (applied by db:migrate)
data/                 pokemon-list.json — PokeAPI snapshot used for seeding
web/                  Vite + React SPA (Tailwind v4, shadcn/ui, motion)
```

## Setup

```bash
npm install
cp .env.example .env   # paste your Supabase session-pooler DATABASE_URL
```

The database schema and seed data (types + the 1351-pokemon index) are already
applied to the Supabase project. On a fresh project, run instead:

```bash
npm run fetch:list   # snapshot https://pokeapi.co/api/v2/pokemon to data/
npm run db:migrate   # apply supabase/migrations/*.sql
npm run db:seed      # seed types + pokemon index (+ pattern-derived artwork)
```

`db:seed` is idempotent: re-running it refreshes names/urls and only fills
artwork for rows still missing it (`coalesce`), so enriched data is never
overwritten.

### Seeding without the npm scripts

The same seed data exists as plain SQL in `data/`:

- `data/seed-types.sql` — the 21 types with color palettes
- `data/seed-pokemon-1.sql` … `seed-pokemon-4.sql` — the pokemon index,
  including the pattern-derived artwork urls (`null` for the few forms with
  no artwork upstream)

Run them with any SQL client connected to your database, e.g.:

```bash
psql "$DATABASE_URL" -f data/seed-types.sql -f data/seed-pokemon-1.sql \
  -f data/seed-pokemon-2.sql -f data/seed-pokemon-3.sql -f data/seed-pokemon-4.sql
```

or paste each file into the Supabase Dashboard SQL editor. The schema
(`supabase/migrations/*.sql`) must be applied first — via `npm run
db:migrate`, or by pasting the migration files into the SQL editor.

After refreshing the snapshot with `npm run fetch:list`, regenerate these SQL
files with `node data/gen-mcp-seed.mjs`.

## Run

```bash
npm run dev           # API on :3000 (tsx watch) + web on :5173 (Vite, proxies /api)
npm run build         # web -> web/dist, server -> dist/
npm start             # production: one process serves the API and the SPA on :3000
npm test              # vitest (mapper unit tests)
```

Optionally pre-warm artwork so the grid isn't full of placeholders:

```bash
npm run enrich -- 100   # enrich first 100 uncached pokemon
npm run enrich -- --all # enrich everything (~a few thousand one-time PokeAPI calls)
```

## API

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/health` | liveness + db ping |
| GET | `/api/pokemon` | `limit` (≤100), `offset`, `search`, `type`, `user` (uuid) — pokeapi-style envelope |
| GET | `/api/pokemon/:idOrName` | full detail; enriches from PokeAPI on cache miss, then responds |
| GET | `/api/types` | all types with color palettes |
| POST | `/api/users` | `{name}` — find-or-create, returns the user uuid |
| GET | `/api/users/:id` / `:id/favorites` | user + favorite list |
| PUT / DELETE | `/api/users/:id/favorites/:pokemonId` | toggle favorites |

Favorites use name-only profiles (no passwords): the client stores the user
uuid in `localStorage` after a one-time "enter your name" dialog.

## Tests

```bash
npm test               # unit + integration
npm run test:coverage  # coverage report across src/
```

Integration tests connect using the `DATABASE_URL` from `.env`, but isolate
themselves in a dedicated `pokedex_test` schema: every run drops and
recreates the schema, applies `supabase/migrations` to it, and pins the
connection's `search_path` there (a Postgres startup parameter) — the app's
`public` data is never visible to them. PokeAPI is mocked, so no network.

## Notes

- All tables have RLS enabled with **no policies**: Supabase's auto-exposed
  REST API can touch nothing; the backend owns the data over a direct
  Postgres connection.
- PokeAPI access is throttled (max 4 concurrent, retries with backoff,
  single-flight coalescing, in-memory cache for static type data).
- The browser view state (page, search, type filter) lives in the URL, so any
  view is shareable and survives refresh/back/forward. Applying a filter
  resets the page.
- Type filters use PokeAPI's `/type/{name}` pokemon list as the source of
  truth. Each type's full membership is synced into `pokemon_types` and the
  type is flagged `is_cached` — by the boot-time background sweep (one type
  every 5s, ~2 minutes for all 21) or by the first filter hit on a type.
  Once cached, filters are served purely from Postgres, even after restarts.
- While the server is up, a background enricher enriches the oldest
  un-enriched pokemon every 5s (`where is_cached = false order by id limit 1`);
  the grid polls every 5s while it still shows un-enriched cards.
- Grid pages with un-enriched pokemon fill themselves in: the client requests
  one pokemon every 2s from our API, which enriches server-side if needed.
- Artwork arrives best-effort before enrichment: the server derives
  `official-artwork/{id}.png` urls for un-enriched pokemon, the client shows
  them, and whenever one actually loads it is persisted via
  `POST /api/pokemon/image-urls` (only rows still lacking `image_url` are
  filled; enrichment keeps authoritative urls).
- `image_url` points at the official artwork on GitHub's sprite CDN — the one
  asset not proxied through our backend.
