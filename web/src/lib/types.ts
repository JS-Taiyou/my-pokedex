// Mirrors the backend's REST API shapes.

export interface TypeBadge {
  id: number
  name: string
  colors: string[]
}

export interface PokemonCardData {
  id: number
  name: string
  image_url: string | null
  /** True when image_url is the server's pattern-derived guess; a successful load should be reported for persistence. */
  image_provisional: boolean
  is_cached: boolean
  types: TypeBadge[]
  is_favorite: boolean
}

export interface PokemonListResponse {
  count: number
  next: string | null
  previous: string | null
  results: PokemonCardData[]
}

export interface StatView {
  name: string
  value: number
}

export interface AbilityView {
  id: number
  name: string
  description: string | null
  is_hidden: boolean
  slot: number
}

export interface WeaknessView {
  type: TypeBadge
  modifier: string
}

export interface EvolutionStageView {
  id: number
  name: string
  image_url: string | null
  is_cached: boolean
}

export interface PokemonDetail {
  id: number
  name: string
  data_url: string
  image_url: string | null
  is_cached: boolean
  genders: string[]
  category: string | null
  height: number | null
  weight: number | null
  stats: StatView[]
  types: TypeBadge[]
  abilities: AbilityView[]
  weaknesses: WeaknessView[]
  evolutions: EvolutionStageView[]
  is_favorite: boolean
}

export interface UserView {
  id: string
  name: string
  created_at: string
}
