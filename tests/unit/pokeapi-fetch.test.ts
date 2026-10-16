import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UpstreamError,
  UpstreamNotFoundError,
  pokeapi,
} from '../../src/services/pokeapi.js'

// These tests stub global fetch and use fake timers for the retry/backoff
// sleeps — no network. Module-level caches are shared across tests in this
// file, so every test uses fresh type names / urls to avoid bleed.

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('pokeapi fetch layer', () => {
  it('passes through successful json responses with accept header', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: 65, name: 'overgrow' }))
    const ability = await pokeapi.ability(65)
    expect(ability).toEqual({ id: 65, name: 'overgrow' })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://pokeapi.co/api/v2/ability/65',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    )
  })

  it('maps upstream 404s to UpstreamNotFoundError without retrying', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }))
    await expect(pokeapi.ability(999999)).rejects.toBeInstanceOf(UpstreamNotFoundError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries 429s honoring retry-after, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(okJson({ ok: true }))
    const pending = pokeapi.ability(1)
    const assertion = expect(pending).resolves.toEqual({ ok: true })
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries 5xx with backoff and eventually succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(okJson({ ok: true }))
    const pending = pokeapi.ability(2)
    await vi.advanceTimersByTimeAsync(5000) // first backoff is ~500-750ms
    await expect(pending).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after three failed attempts with UpstreamError', async () => {
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }))
    const pending = pokeapi.ability(3)
    const assertion = expect(pending).rejects.toBeInstanceOf(UpstreamError)
    // two backoffs: ~750ms and ~1250ms (plus jitter)
    await vi.advanceTimersByTimeAsync(20_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries network failures (fetch rejections)', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okJson({ ok: true }))
    const pending = pokeapi.ability(4)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('caches static type lookups in memory', async () => {
    fetchMock.mockResolvedValue(okJson({
      id: 1,
      name: 'cache-probe',
      damage_relations: { double_damage_from: [], half_damage_from: [], no_damage_from: [] },
      pokemon: [],
    }))
    const first = await pokeapi.typeByName('cache-probe')
    const second = await pokeapi.typeByName('cache-probe')
    expect(first.name).toBe('cache-probe')
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent identical requests into one fetch (single-flight)', async () => {
    let resolveFetch!: (r: Response) => void
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    )
    const a = pokeapi.typeByName('flight-probe')
    const b = pokeapi.typeByName('flight-probe')
    await vi.advanceTimersByTimeAsync(0) // let the fetch actually start
    resolveFetch(okJson({ id: 2, name: 'flight-probe', damage_relations: { double_damage_from: [], half_damage_from: [], no_damage_from: [] }, pokemon: [] }))
    const [ra, rb] = await Promise.all([a, b])
    expect(ra).toBe(rb)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses to fetch urls outside the configured PokeAPI base', () => {
    expect(() => pokeapi.species('https://evil.example.com/api/v2/pokemon-species/1/')).toThrow(
      /Refusing to fetch non-PokeAPI url/,
    )
  })
})
