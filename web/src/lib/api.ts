import type {
  PokemonDetail,
  PokemonListResponse,
  TypeBadge,
  UserView,
} from './types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * The one HTTP door to the outside world: every request stays same-origin
 * against our Hono backend. The browser never talks to PokeAPI.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON error body — keep the default message
    }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  listPokemon(params: {
    limit: number
    offset: number
    search?: string
    type?: string
    user?: string
  }): Promise<PokemonListResponse> {
    const query = new URLSearchParams({
      limit: String(params.limit),
      offset: String(params.offset),
    })
    if (params.search) query.set('search', params.search)
    if (params.type) query.set('type', params.type)
    if (params.user) query.set('user', params.user)
    return request(`/api/pokemon?${query.toString()}`)
  },

  pokemon(idOrName: string | number, user?: string): Promise<PokemonDetail> {
    const suffix = user ? `?user=${encodeURIComponent(user)}` : ''
    return request(`/api/pokemon/${idOrName}${suffix}`)
  },

  /** Report pattern-derived artworks that actually loaded, so the backend can persist them. */
  persistImageUrls(ids: number[]): Promise<{ persisted: number }> {
    return request('/api/pokemon/image-urls', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },

  types(): Promise<TypeBadge[]> {
    return request('/api/types')
  },

  createUser(name: string): Promise<UserView> {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  favorites(userId: string): Promise<PokemonListResponse> {
    return request(`/api/users/${userId}/favorites`)
  },

  addFavorite(userId: string, pokemonId: number): Promise<void> {
    return request(`/api/users/${userId}/favorites/${pokemonId}`, { method: 'PUT' })
  },

  removeFavorite(userId: string, pokemonId: number): Promise<void> {
    return request(`/api/users/${userId}/favorites/${pokemonId}`, { method: 'DELETE' })
  },
}
