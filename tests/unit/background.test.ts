import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Everything the loops touch is mocked: db, enrichment and pokeapi. The
// loops themselves are driven with fake timers, five seconds at a time.

vi.mock('../../src/db.js', () => ({ sql: vi.fn() }))
vi.mock('../../src/services/enrichment.js', () => ({
  enrichPokemon: vi.fn(),
  syncTypeMembership: vi.fn(),
}))
vi.mock('../../src/services/pokeapi.js', () => ({
  pokeapi: { typeByName: vi.fn(), listTypes: vi.fn() },
}))

import { sql } from '../../src/db.js'
import { enrichPokemon, syncTypeMembership } from '../../src/services/enrichment.js'
import { pokeapi } from '../../src/services/pokeapi.js'
import { startBackgroundSync } from '../../src/services/background.js'

const mockedSql = vi.mocked(sql)
const mockedEnrich = vi.mocked(enrichPokemon)
const mockedSync = vi.mocked(syncTypeMembership)
const mockedTypeByName = vi.mocked(pokeapi.typeByName)

/** Route tagged-template queries to canned row sequences by SQL text. */
function stubQueries(rows: {
  typesCount?: Array<Record<string, unknown>>
  uncachedType?: Array<Record<string, unknown>>
  alwaysType?: Record<string, unknown>
  uncachedPokemon?: Array<Record<string, unknown>>
}): void {
  const typeQueue = [...(rows.uncachedType ?? [])]
  const pokemonQueue = [...(rows.uncachedPokemon ?? [])]
  mockedSql.mockImplementation(((strings: TemplateStringsArray) => {
    const query = strings.join('$?')
    // every response is an ARRAY of rows — the loops destructure [row]
    if (query.includes('count(*)') && query.includes('from types')) {
      return Promise.resolve(rows.typesCount ?? [{ count: 1 }])
    }
    if (query.includes('from types where not is_cached')) {
      if (rows.alwaysType) return Promise.resolve([rows.alwaysType])
      return Promise.resolve(typeQueue.length > 0 ? [typeQueue.shift()!] : [])
    }
    if (query.includes('from pokemon') && query.includes('not is_cached')) {
      return Promise.resolve(pokemonQueue.length > 0 ? [pokemonQueue.shift()!] : [])
    }
    return Promise.resolve([])
  }) as never)
}

const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => {
  vi.useFakeTimers()
  mockedSql.mockReset()
  mockedEnrich.mockReset().mockResolvedValue(undefined)
  mockedSync.mockReset().mockResolvedValue(undefined)
  mockedTypeByName.mockReset().mockResolvedValue({
    id: 1,
    name: 'fire',
    damage_relations: { double_damage_from: [], half_damage_from: [], no_damage_from: [] },
    pokemon: [],
  })
  logSpy.mockClear()
  errorSpy.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('background type sweep', () => {
  it('syncs uncached types one at a time and completes when none remain', async () => {
    stubQueries({
      typesCount: [{ count: 5 }],
      uncachedType: [{ id: 1, name: 'fire' }],
    })
    startBackgroundSync()
    await vi.advanceTimersByTimeAsync(12_000)

    expect(mockedTypeByName).toHaveBeenCalledExactlyOnceWith('fire')
    expect(mockedSync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'fire' }),
    )
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      expect.stringContaining('type sweep complete'),
    )
    // types table already populated -> no upstream type listing needed
    expect(vi.mocked(pokeapi.listTypes)).not.toHaveBeenCalled()
  })

  it('seeds the types table from PokeAPI when it is empty', async () => {
    stubQueries({ typesCount: [{ count: 0 }], uncachedType: [] })
    vi.mocked(pokeapi.listTypes).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    startBackgroundSync()
    await vi.advanceTimersByTimeAsync(1000)
    expect(pokeapi.listTypes).toHaveBeenCalledTimes(1)
  })

  it('gives up the sweep after five consecutive step failures', async () => {
    // the failing type keeps coming back from the database every cycle
    stubQueries({ alwaysType: { id: 1, name: 'fire' } })
    // throw per call instead of mockRejectedValue, whose eagerly-created
    // rejected promise dangles unhandled before the first await
    mockedTypeByName.mockImplementation(async () => {
      throw new Error('upstream down')
    })
    startBackgroundSync()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockedTypeByName.mock.calls.length).toBe(5)
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('(5)'),
      expect.anything(),
    )
  })
})

describe('background enricher', () => {
  it('enriches one uncached pokemon per 5s tick', async () => {
    stubQueries({
      uncachedPokemon: [{ id: 7 }, { id: 8 }, { id: 9 }],
    })
    startBackgroundSync()
    await vi.advanceTimersByTimeAsync(16_000)

    expect(mockedEnrich).toHaveBeenCalledTimes(3)
    expect(mockedEnrich).toHaveBeenNthCalledWith(1, 7)
    expect(mockedEnrich).toHaveBeenNthCalledWith(2, 8)
    expect(mockedEnrich).toHaveBeenNthCalledWith(3, 9)
  })

  it('blacklists a pokemon after three consecutive failures and moves on', async () => {
    stubQueries({
      // three failures blacklist id 7; the next select behaves as if the
      // exclusion in the SQL worked and hands us the next candidate
      uncachedPokemon: [{ id: 7 }, { id: 7 }, { id: 7 }, { id: 8 }],
    })
    mockedEnrich.mockImplementation(async (id: number) => {
      if (id === 7) throw new Error('bad row')
      return undefined
    })
    startBackgroundSync()
    await vi.advanceTimersByTimeAsync(30_000)

    // id 7 fails three times, is blacklisted, then the loop moves to id 8
    expect(mockedEnrich).toHaveBeenCalledTimes(4)
    expect(mockedEnrich).toHaveBeenLastCalledWith(8)
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      expect.stringContaining('#7 failed (3/3)'),
      expect.anything(),
    )
  })

  it('idles quietly when there is nothing to enrich', async () => {
    stubQueries({ uncachedPokemon: [] })
    startBackgroundSync()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(mockedEnrich).not.toHaveBeenCalled()
  })
})
