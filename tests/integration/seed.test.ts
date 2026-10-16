import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

// db:seed runs against the isolated schema through the shared singleton,
// but closes the pool when it finishes — so assertions use a dedicated
// client pinned to the same schema.
vi.mock('../../src/services/pokeapi.js', async () => {
  const f = await import('./fixtures.js')
  class UpstreamNotFoundError extends Error {}
  return {
    UpstreamNotFoundError,
    pokeapi: { listTypes: vi.fn(async () => f.typeListPayload()) },
  }
})

describe('db:seed script (integration)', () => {
  it('seeds types with colors and the full pokemon index with pattern artwork', async () => {
    const url = process.env.DATABASE_URL!
    const verify = postgres(url, {
      max: 1,
      ssl: url.includes('supabase') ? 'require' : undefined,
      prepare: false,
      connection: { search_path: 'pokedex_test' },
    })

    // make this test independent of integration file ordering
    await verify`truncate pokemon, types, abilities, users cascade`

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await import('../../src/scripts/seed.js') // runs main() on import

    // the 1351-row bulk upsert takes a few seconds over the wire
    await vi.waitFor(
      () => expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('pokemon: upserted')),
      { timeout: 60_000 },
    )

    try {
      const types = await verify`select id, name from types order by id`
      // fixtures list five types, ordered here by their pokeapi ids
      expect(types.map((t) => t.name)).toEqual(['poison', 'fire', 'water', 'grass', 'psychic'])

      const [counts] = await verify`
        select
          (select count(*) from pokemon) as total,
          (select count(*) from pokemon where image_url is not null) as with_artwork,
          (select image_url from pokemon where id = 10264) as spriteless
      `
      const expected = JSON.parse(
        readFileSync('data/pokemon-list.json', 'utf8'),
      ) as { results: unknown[] }
      expect(Number(counts.total)).toBe(expected.results.length)
      // everything except the four spriteless forms gets pattern artwork
      expect(Number(counts.with_artwork)).toBe(Number(counts.total) - 4)
      expect(counts.spriteless).toBeNull()
    } finally {
      await verify.end()
    }
  })
})
