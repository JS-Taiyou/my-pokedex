import { env } from '../env.js'
import type {
  ApiChainNode,
  ApiNamedResource,
  ApiTypeDamageRelations,
} from '../lib/mappers.js'

/**
 * Backend-only PokeAPI client.
 *
 * Fair-use rules say don't hammer the API, so every outbound request goes
 * through a concurrency-limited queue with retries, identical in-flight urls
 * are coalesced into one network call, and static resources (types) are kept
 * in a long-lived in-memory cache. Combined with persisting every response to
 * our own database, each unique resource is fetched at most once per process
 * lifetime (and at most once ever for pokemon details).
 */

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamError'
  }
}

export class UpstreamNotFoundError extends Error {
  constructor(url: string) {
    super(`PokeAPI has no resource at ${url}`)
    this.name = 'UpstreamNotFoundError'
  }
}

const REQUEST_TIMEOUT_MS = 10_000
const MAX_ATTEMPTS = 3
const STATIC_TTL_MS = 24 * 60 * 60 * 1000

export class Limiter {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++
      return Promise.resolve()
    }
    // A handed-off slot is transferred by release() itself: active stays
    // counted and the waiter must NOT increment again, or every handoff
    // leaks a slot and the limiter eventually deadlocks.
    return new Promise((resolve) => this.waiting.push(resolve))
  }

  private release(): void {
    const next = this.waiting.shift()
    if (next) next()
    else this.active--
  }
}

const limiter = new Limiter(env.POKEAPI_CONCURRENCY)
const inflight = new Map<string, Promise<unknown>>()
const memoryCache = new Map<string, { expires: number; value: unknown }>()

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt + Math.random() * 250
}

async function fetchJsonWithRetries(url: string): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1))
    let response: Response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      lastError = new UpstreamError(`Request to ${url} failed: ${String(cause)}`)
      continue
    }
    if (response.status === 404) throw new UpstreamNotFoundError(url)
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get('retry-after'))
      lastError = new UpstreamError(`PokeAPI responded ${response.status} for ${url}`)
      await sleep(retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt))
      continue
    }
    if (!response.ok) throw new UpstreamError(`PokeAPI responded ${response.status} for ${url}`)
    return (await response.json()) as unknown
  }
  throw lastError ?? new UpstreamError(`Request to ${url} failed`)
}

function pokeGet<T>(url: string, ttlMs?: number): Promise<T> {
  if (!url.startsWith(env.POKEAPI_BASE_URL)) {
    throw new Error(`Refusing to fetch non-PokeAPI url: ${url}`)
  }
  if (ttlMs !== undefined) {
    const hit = memoryCache.get(url)
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T)
  }
  const existing = inflight.get(url)
  if (existing) return existing as Promise<T>
  const pending = limiter
    .run(() => fetchJsonWithRetries(url))
    .then((value) => {
      if (ttlMs !== undefined) memoryCache.set(url, { expires: Date.now() + ttlMs, value })
      return value
    })
    .finally(() => inflight.delete(url))
  inflight.set(url, pending)
  return pending as Promise<T>
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields we consume)
// ---------------------------------------------------------------------------

export interface PokeListPage {
  count: number
  next: string | null
  previous: string | null
  results: ApiNamedResource[]
}

export interface PokePokemon {
  id: number
  name: string
  height: number
  weight: number
  sprites: {
    front_default: string | null
    other?: Record<string, { front_default?: string | null } | undefined>
  }
  stats: Array<{ base_stat: number; stat: ApiNamedResource }>
  types: Array<{ slot: number; type: ApiNamedResource }>
  abilities: Array<{ slot: number; is_hidden: boolean; ability: ApiNamedResource }>
  species: { url: string }
}

export interface PokeSpecies {
  gender_rate: number
  genera: Array<{ genus: string; language: { name: string } }>
  evolution_chain: { url: string }
}

export interface PokeType {
  id: number
  name: string
  damage_relations: ApiTypeDamageRelations
  pokemon: Array<{ pokemon: ApiNamedResource; slot: number }>
}

export interface PokeAbility {
  id: number
  name: string
  effect_entries: Array<{
    short_effect?: string
    effect: string
    language: { name: string }
  }>
  flavor_text_entries: Array<{ flavor_text: string; language: { name: string } }>
}

export interface PokeEvolutionChain {
  id: number
  chain: ApiChainNode
}

export const pokeapi = {
  listPokemon(limit: number, offset: number): Promise<PokeListPage> {
    return pokeGet<PokeListPage>(
      `${env.POKEAPI_BASE_URL}/pokemon?limit=${limit}&offset=${offset}`,
    )
  },
  pokemon(idOrName: number | string): Promise<PokePokemon> {
    return pokeGet<PokePokemon>(`${env.POKEAPI_BASE_URL}/pokemon/${idOrName}`)
  },
  species(url: string): Promise<PokeSpecies> {
    return pokeGet<PokeSpecies>(url)
  },
  evolutionChain(url: string): Promise<PokeEvolutionChain> {
    return pokeGet<PokeEvolutionChain>(url)
  },
  typeByName(name: string): Promise<PokeType> {
    // Types never change — safe to keep these in memory for a day.
    return pokeGet<PokeType>(`${env.POKEAPI_BASE_URL}/type/${name}`, STATIC_TTL_MS)
  },
  listTypes(): Promise<PokeListPage> {
    return pokeGet<PokeListPage>(`${env.POKEAPI_BASE_URL}/type?limit=60`, STATIC_TTL_MS)
  },
  ability(id: number): Promise<PokeAbility> {
    return pokeGet<PokeAbility>(`${env.POKEAPI_BASE_URL}/ability/${id}`)
  },
}
