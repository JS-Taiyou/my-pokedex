import { Hono } from 'hono'
import { z } from 'zod'
import { sql } from '../db.js'
import { notFound } from '../lib/errors.js'
import { withProvisionalArtwork } from '../lib/artwork.js'
import { parseWith, readJsonBody } from '../lib/validate.js'
import type { PokemonListItem } from './pokemon.js'

interface UserView {
  id: string
  name: string
  created_at: string
}

const createBody = z.object({
  // Name-only profiles: we find-or-create, no passwords involved.
  name: z.string().trim().min(1).max(60),
})

const favoriteSubquery = sql`
  coalesce((
    select json_agg(json_build_object('id', t.id, 'name', t.name, 'colors', t.colors) order by pt.slot)
    from pokemon_types pt
    join types t on t.id = pt.type_id
    where pt.pokemon_id = p.id
  ), '[]'::json)
`

async function requireUser(id: string): Promise<UserView> {
  const [user] = await sql<UserView[]>`
    select id, name, created_at from users where id = ${id}::uuid
  `
  if (!user) throw notFound('user')
  return user
}

const app = new Hono()

/** POST /api/users — find-or-create by name; the client stores the uuid locally. */
app.post('/', async (c) => {
  const body = parseWith(createBody, await readJsonBody(c.req.raw))
  const [existing] = await sql<UserView[]>`
    select id, name, created_at from users where name = ${body.name} limit 1
  `
  if (existing) return c.json(existing)
  const [created] = await sql<UserView[]>`
    insert into users (name) values (${body.name}) returning id, name, created_at
  `
  return c.json(created, 201)
})

app.get('/:id', async (c) => {
  const id = parseWith(z.string().uuid(), c.req.param('id'))
  return c.json(await requireUser(id))
})

/** GET /api/users/:id/favorites — same card shape as the main list. */
app.get('/:id/favorites', async (c) => {
  const id = parseWith(z.string().uuid(), c.req.param('id'))
  await requireUser(id)
  const results = await sql<PokemonListItem[]>`
    select
      p.id, p.name, p.image_url, p.is_cached,
      ${favoriteSubquery} as types,
      true as is_favorite
    from user_favorites uf
    join pokemon p on p.id = uf.pokemon_id
    where uf.user_id = ${id}::uuid
    order by p.id
  `
  return c.json({
    count: results.length,
    next: null,
    previous: null,
    results: results.map(withProvisionalArtwork),
  })
})

app.put('/:id/favorites/:pokemonId', async (c) => {
  const id = parseWith(z.string().uuid(), c.req.param('id'))
  const pokemonId = parseWith(z.coerce.number().int().positive(), c.req.param('pokemonId'))
  await requireUser(id)
  const [pokemon] = await sql`select id from pokemon where id = ${pokemonId}`
  if (!pokemon) throw notFound('pokemon')
  await sql`
    insert into user_favorites (user_id, pokemon_id)
    values (${id}::uuid, ${pokemonId})
    on conflict (user_id, pokemon_id) do nothing
  `
  return c.body(null, 204)
})

app.delete('/:id/favorites/:pokemonId', async (c) => {
  const id = parseWith(z.string().uuid(), c.req.param('id'))
  const pokemonId = parseWith(z.coerce.number().int().positive(), c.req.param('pokemonId'))
  await requireUser(id)
  await sql`
    delete from user_favorites where user_id = ${id}::uuid and pokemon_id = ${pokemonId}
  `
  return c.body(null, 204)
})

export default app
