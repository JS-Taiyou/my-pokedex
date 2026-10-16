import { Hono } from 'hono'
import { z } from 'zod'
import { sql } from '../db.js'
import { badRequest, notFound } from '../lib/errors.js'
import { emptyToUndefined, parseWith, readJsonBody } from '../lib/validate.js'
import { parseIdFromUrl, type EvolutionStage } from '../lib/mappers.js'
import { ARTWORK_BASE_URL, provisionalArtworkFor, withProvisionalArtwork } from '../lib/artwork.js'
import { UpstreamNotFoundError, pokeapi } from '../services/pokeapi.js'
import { enrichPokemon, syncTypeMembership } from '../services/enrichment.js'

export interface TypeBadge {
  id: number
  name: string
  colors: string[]
}

export interface PokemonListItem {
  id: number
  name: string
  image_url: string | null
  /** True when image_url is the pattern-derived guess, not persisted data. */
  image_provisional: boolean
  is_cached: boolean
  types: TypeBadge[]
  is_favorite: boolean
}

export interface AbilityView {
  id: number
  name: string
  description: string | null
  is_hidden: boolean
  slot: number
}

export interface WeaknessView {
  id: number
  name: string
  colors: string[]
  modifier: string
}

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(60).optional()),
  type: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(30).optional()),
  user: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
})

const detailQuery = z.object({
  user: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
})

const favoriteSubquery = (user?: string) =>
  user
    ? sql`exists(select 1 from user_favorites uf where uf.pokemon_id = p.id and uf.user_id = ${user}::uuid)`
    : sql`false`

const typesAggregate = sql`
  coalesce((
    select json_agg(json_build_object('id', t.id, 'name', t.name, 'colors', t.colors) order by pt.slot)
    from pokemon_types pt
    join types t on t.id = pt.type_id
    where pt.pokemon_id = p.id
  ), '[]'::json)
`

const app = new Hono()

/**
 * GET /api/pokemon — paginated list, pokeapi-style envelope. Served entirely
 * from our database; `image_url` is null until the pokemon has been enriched.
 */
app.get('/', async (c) => {
  const q = parseWith(listQuery, c.req.query())
  // Static filters where null means "not requested" — no dynamic SQL
  // composition, and the planner short-circuits the null branches.
  const searchPattern = q.search ? `%${q.search}%` : null

  // Type filters: once a type's membership has been synced (types.is_cached)
  // the filter is served purely from our database. Only an unknown or
  // not-yet-synced type touches PokeAPI — and that visit syncs it, so it is
  // also the last one.
  let typeFilter = sql`true`
  if (q.type) {
    const [known] = await sql`
      select id, is_cached from types where name = ${q.type} limit 1
    `
    if (known?.is_cached) {
      typeFilter = sql`
        exists (
          select 1 from pokemon_types pt
          where pt.pokemon_id = p.id and pt.type_id = ${known.id}
        )
      `
    } else {
      try {
        const type = await pokeapi.typeByName(q.type)
        await syncTypeMembership(type)
        const typeIds = type.pokemon.map((entry) => parseIdFromUrl(entry.pokemon.url))
        typeFilter = sql`p.id = any(${typeIds})`
      } catch (err) {
        if (err instanceof UpstreamNotFoundError) {
          throw badRequest(`unknown type "${q.type}"`)
        }
        throw err
      }
    }
  }

  const where = sql`
    (${searchPattern}::text is null or p.name ilike ${searchPattern})
    and ${typeFilter}
  `

  const [{ count }] = await sql`
    select count(*)::int as count from pokemon p where ${where}
  `
  const rows = await sql<PokemonListItem[]>`
    select
      p.id, p.name, p.image_url, p.is_cached,
      ${typesAggregate} as types,
      ${favoriteSubquery(q.user)} as is_favorite
    from pokemon p
    where ${where}
    order by p.id
    limit ${q.limit} offset ${q.offset}
  `

  const pageUrl = (offset: number): string => {
    const params = new URLSearchParams({ limit: String(q.limit), offset: String(offset) })
    if (q.search) params.set('search', q.search)
    if (q.type) params.set('type', q.type)
    return `/api/pokemon?${params.toString()}`
  }
  return c.json({
    count,
    next: q.offset + q.limit < count ? pageUrl(q.offset + q.limit) : null,
    previous: q.offset > 0 ? pageUrl(Math.max(0, q.offset - q.limit)) : null,
    results: rows.map(withProvisionalArtwork),
  })
})

const imageUrlsBody = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
})

/**
 * POST /api/pokemon/image-urls — best-effort artwork persistence. The client
 * renders pattern-derived official-artwork urls for un-enriched pokemon;
 * when one actually loads, it reports the id here. We only fill rows whose
 * image_url is still null, so enriched (authoritative) urls are never
 * overwritten.
 */
app.post('/image-urls', async (c) => {
  const body = parseWith(imageUrlsBody, await readJsonBody(c.req.raw))
  const rows = await sql`
    update pokemon p
    set image_url = ${ARTWORK_BASE_URL} || '/' || r.id || '.png'
    from (select unnest(${body.ids}::int[]) as id) r
    where p.id = r.id and p.image_url is null
    returning p.id
  `
  return c.json({ persisted: rows.length })
})

/**
 * GET /api/pokemon/:idOrName — full detail. On a cache miss this waits while
 * the server enriches from PokeAPI and persists to Postgres, then responds;
 * the client only ever sees our API.
 */
app.get('/:idOrName', async (c) => {
  const q = parseWith(detailQuery, c.req.query())
  const key = c.req.param('idOrName').toLowerCase()
  const id = /^\d+$/.test(key) ? Number(key) : null

  const selectByIdOrName = id
    ? sql`select * from pokemon where id = ${id}`
    : sql`select * from pokemon where name = ${key}`

  let row = (await selectByIdOrName)[0]
  if (!row) throw notFound(`pokemon ${key}`)
  if (!row.is_cached) {
    await enrichPokemon(row.id)
    row = (await sql`select * from pokemon where id = ${row.id}`)[0]
  }

  const [types, abilities, weaknesses, favoriteRows] = await Promise.all([
    sql<TypeBadge[]>`
      select t.id, t.name, t.colors
      from pokemon_types pt join types t on t.id = pt.type_id
      where pt.pokemon_id = ${row.id}
      order by pt.slot
    `,
    sql<AbilityView[]>`
      select a.id, a.name, a.description, pa.is_hidden, pa.slot
      from pokemon_abilities pa join abilities a on a.id = pa.ability_id
      where pa.pokemon_id = ${row.id}
      order by pa.slot
    `,
    sql<WeaknessView[]>`
      select t.id, t.name, t.colors, w.modifier
      from pokemon_weaknesses w join types t on t.id = w.type_id
      where w.pokemon_id = ${row.id}
      order by (w.modifier::numeric) desc, t.name
    `,
    q.user
      ? sql`
          select 1 from user_favorites
          where user_id = ${q.user}::uuid and pokemon_id = ${row.id}
        `
      : Promise.resolve([]),
  ])

  // Evolution stages: one round trip for the whole chain (they may already be
  // enriched and carry artwork); the rest fall back to the derived pattern.
  const stages = (row.evolutions ?? []) as EvolutionStage[]
  let evolutions: Array<
    EvolutionStage & { image_url: string | null; is_cached: boolean }
  > = []
  if (stages.length > 0) {
    const stageIds = stages.map((stage) => stage.id)
    const knownRows = await sql`
      select id, name, image_url, is_cached from pokemon where id = any(${stageIds})
    `
    const knownById = new Map(
      knownRows.map((known) => [known.id as number, known]),
    )
    evolutions = stages.map((stage) => {
      const known = knownById.get(stage.id)
      return {
        ...stage,
        name: known?.name ?? stage.name,
        image_url: known?.image_url ?? provisionalArtworkFor(stage.id),
        is_cached: known?.is_cached ?? false,
      }
    })
  }

  const isFavorite = favoriteRows.length > 0

  return c.json({
    id: row.id,
    name: row.name,
    data_url: row.data_url,
    image_url: row.image_url,
    is_cached: row.is_cached,
    genders: row.genders ?? [],
    category: row.category,
    height: row.height,
    weight: row.weight,
    stats: row.stats ?? [],
    types,
    abilities,
    weaknesses: weaknesses.map((w) => ({
      type: { id: w.id, name: w.name, colors: w.colors },
      modifier: w.modifier,
    })),
    evolutions,
    is_favorite: isFavorite,
  })
})

export default app
