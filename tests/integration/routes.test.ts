import { beforeAll, describe, expect, it, vi } from 'vitest'

// PokeAPI is mocked and, for the DB-cached filter test, wired to THROW if
// called — proving the filter is served purely from our tables.
vi.mock('../../src/services/pokeapi.js', async () => {
  class UpstreamNotFoundError extends Error {}
  return {
    UpstreamNotFoundError,
    pokeapi: {
      pokemon: vi.fn(async () => {
        throw new Error('unexpected pokeapi.pokemon call')
      }),
      species: vi.fn(async () => {
        throw new Error('unexpected pokeapi.species call')
      }),
      evolutionChain: vi.fn(async () => {
        throw new Error('unexpected pokeapi.evolutionChain call')
      }),
      typeByName: vi.fn(async () => {
        throw new UpstreamNotFoundError('not found upstream')
      }),
      listTypes: vi.fn(async () => {
        throw new Error('unexpected pokeapi.listTypes call')
      }),
      ability: vi.fn(async () => {
        throw new Error('unexpected pokeapi.ability call')
      }),
    },
  }
})

import { createApp } from '../../src/app.js'
import { sql } from '../../src/db.js'

const app = createApp()

const json = async (res: Response): Promise<Record<string, unknown>> => res.json() as never

describe('GET /api/pokemon (integration)', () => {
  beforeAll(async () => {
    await sql`truncate pokemon, types cascade`
    await sql`
      insert into pokemon (id, name, data_url, image_url) values
        (10, 'caterpie', 'https://pokeapi.co/api/v2/pokemon/10/', null),
        (11, 'metapod',  'https://pokeapi.co/api/v2/pokemon/11/', 'https://example.com/kept.png'),
        (12, 'butterfree', 'https://pokeapi.co/api/v2/pokemon/12/', null),
        (25, 'pikachu', 'https://pokeapi.co/api/v2/pokemon/25/', null)
    `
    await sql`
      insert into types (id, name, colors, is_cached) values
        (7, 'bug', '["#91A119", "#B8C26A"]'::jsonb, true),
        (10, 'fire', '["#E62829", "#EF7374"]'::jsonb, false)
    `
    await sql`
      insert into pokemon_types (pokemon_id, type_id, slot) values
        (10, 7, 1), (11, 7, 1), (12, 7, 1), (25, 10, 1)
    `
  })

  it('returns the pokeapi-style envelope with pagination urls', async () => {
    const res = await app.request('/api/pokemon?limit=2&offset=1')
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.count).toBe(4)
    expect(body.next).toBe('/api/pokemon?limit=2&offset=3')
    expect(body.previous).toBe('/api/pokemon?limit=2&offset=0')
    expect((body.results as Array<{ id: number }>).map((r) => r.id)).toEqual([11, 12])
  })

  it('rejects limits above 100', async () => {
    const res = await app.request('/api/pokemon?limit=500')
    expect(res.status).toBe(400)
  })

  it('filters by search (ilike)', async () => {
    const res = await app.request('/api/pokemon?search=PIKA')
    const body = await json(res)
    expect((body.results as Array<{ name: string }>).map((r) => r.name)).toEqual(['pikachu'])
  })

  it('serves cached-type filters purely from the database (no upstream)', async () => {
    const res = await app.request('/api/pokemon?type=bug')
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.count).toBe(3)
    expect((body.results as Array<{ name: string }>).map((r) => r.name)).toEqual([
      'caterpie',
      'metapod',
      'butterfree',
    ])
    // typeByName is mocked to throw — a 200 proves it was never called.
  })

  it('maps an uncached type to a 400 when upstream does not know it', async () => {
    const res = await app.request('/api/pokemon?type=unknown-type')
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain('unknown type')
  })

  it('derives provisional artwork for rows without image_url', async () => {
    const res = await app.request('/api/pokemon?search=caterpie')
    const body = await json(res)
    const card = (body.results as Array<Record<string, unknown>>)[0]
    expect(card.image_url).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10.png',
    )
    expect(card.image_provisional).toBe(true)
  })

  it('returns 404 for unknown pokemon', async () => {
    expect((await app.request('/api/pokemon/999999')).status).toBe(404)
    expect((await app.request('/api/pokemon/nobody')).status).toBe(404)
  })
})

describe('POST /api/pokemon/image-urls (integration)', () => {
  it('fills missing artwork only — existing urls are never overwritten', async () => {
    const res = await app.request('/api/pokemon/image-urls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [10, 11, 999999] }),
    })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ persisted: 1 })

    const rows = await sql`select id, image_url from pokemon where id in (10, 11) order by id`
    expect(rows[0].image_url).toContain('official-artwork/10.png')
    expect(rows[1].image_url).toBe('https://example.com/kept.png')
  })

  it('validates the body', async () => {
    const res = await app.request('/api/pokemon/image-urls', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    })
    expect(res.status).toBe(400)
  })
})

describe('users and favorites (integration)', () => {
  it('find-or-create returns the same user for the same name', async () => {
    const first = await json(
      await app.request('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'ash' }),
      }),
    )
    const second = await json(
      await app.request('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'ash' }),
      }),
    )
    expect(first.id).toBe(second.id)
    expect(first.name).toBe('ash')
  })

  it('round-trips favorites', async () => {
    const user = await json(
      await app.request('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'misty' }),
      }),
    )
    const userId = user.id as string

    expect(
      (
        await app.request(`/api/users/${userId}/favorites/25`, { method: 'PUT' })
      ).status,
    ).toBe(204)

    const list = await json(await app.request(`/api/users/${userId}/favorites`))
    expect(list.count).toBe(1)
    const results = list.results as Array<Record<string, unknown>>
    expect(results[0].name).toBe('pikachu')
    expect(results[0].is_favorite).toBe(true)

    expect(
      (
        await app.request(`/api/users/${userId}/favorites/25`, { method: 'DELETE' })
      ).status,
    ).toBe(204)
    const empty = await json(await app.request(`/api/users/${userId}/favorites`))
    expect(empty.count).toBe(0)
  })

  it('404s favorites for unknown users', async () => {
    const res = await app.request(
      '/api/users/00000000-0000-0000-0000-000000000000/favorites',
    )
    expect(res.status).toBe(404)
  })
})
