import { beforeEach, describe, expect, it, vi } from 'vitest'

// Keep .env out of the picture so the db-guard test controls DATABASE_URL.
vi.mock('dotenv/config', () => ({}))
vi.mock('../../src/services/pokeapi.js', () => ({
  pokeapi: { listPokemon: vi.fn() },
  UpstreamNotFoundError: class extends Error {},
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn() }
})

import { mkdirSync, writeFileSync } from 'node:fs'
import { pokeapi } from '../../src/services/pokeapi.js'

const mockedListPokemon = vi.mocked(pokeapi.listPokemon)

const entry = (id: number) => ({
  id,
  name: `pokemon-${id}`,
  data_url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
})
const resource = (id: number) => ({
  name: `pokemon-${id}`,
  url: `https://pokeapi.co/api/v2/pokemon/${id}/`,
})

/** Imports the fetch-list script fresh (it runs main() on import). */
async function runFetchList(): Promise<void> {
  vi.resetModules()
  await import('../../src/scripts/fetch-pokemon-list.js')
}

beforeEach(() => {
  vi.mocked(mkdirSync).mockClear()
  vi.mocked(writeFileSync).mockClear()
  mockedListPokemon.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('fetch-pokemon-list script', () => {
  it('writes the snapshot when the single big page is complete', async () => {
    mockedListPokemon
      .mockResolvedValueOnce({ count: 3, next: null, previous: null, results: [] })
      .mockResolvedValueOnce({ count: 3, next: null, previous: null, results: [resource(1), resource(2), resource(3)] })

    await runFetchList()
    await vi.waitFor(() => expect(writeFileSync).toHaveBeenCalledTimes(1))

    expect(mkdirSync).toHaveBeenCalledWith('data', { recursive: true })
    const [path, raw] = vi.mocked(writeFileSync).mock.calls[0]
    expect(path).toBe('data/pokemon-list.json')
    const payload = JSON.parse(raw as string)
    expect(payload.count).toBe(3)
    expect(payload.results).toEqual([entry(1), entry(2), entry(3)])
    expect(payload.source).toContain('pokeapi.co')
  })

  it('falls back to chunked paging when the big page is truncated', async () => {
    mockedListPokemon.mockImplementation(async (limit: number, offset: number) => {
      if (limit === 1) {
        return { count: 1002, next: null, previous: null, results: [] } // probe
      }
      if (limit === 1002) {
        return { count: 1002, next: null, previous: null, results: [] } // truncated big page
      }
      return {
        count: 1002,
        next: null,
        previous: null,
        results:
          offset === 0
            ? Array.from({ length: 1000 }, (_, i) => resource(i + 1))
            : [resource(1001), resource(1002)],
      }
    })

    await runFetchList()
    await vi.waitFor(() => expect(writeFileSync).toHaveBeenCalledTimes(1))

    // the pager asks for min(1000, remaining) rows per chunk — the final
    // chunk is the 2 leftover rows at offset 1000
    expect(mockedListPokemon).toHaveBeenLastCalledWith(2, 1000)
    const payload = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string)
    expect(payload.count).toBe(1002)
    expect(payload.results[0]).toEqual(entry(1))
    expect(payload.results.at(-1)).toEqual(entry(1002))
  })
})

describe('db module guard', () => {
  it('fails loudly when DATABASE_URL is missing', async () => {
    vi.resetModules()
    const previous = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    delete process.env.DB_SCHEMA
    try {
      await expect(import('../../src/db.js')).rejects.toThrow(/DATABASE_URL is not set/)
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous
    }
  })
})
