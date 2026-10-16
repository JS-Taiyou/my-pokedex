/**
 * Pure mapping helpers that turn raw PokeAPI payloads into the shapes we store
 * in Postgres. No I/O here on purpose — everything is unit-testable.
 */

export interface StatView {
  name: string
  value: number
}

export interface EvolutionStage {
  id: number
  name: string
}

export interface ApiNamedResource {
  name: string
  url: string
}

export interface ApiChainNode {
  species: ApiNamedResource
  evolves_to: ApiChainNode[]
}

export interface ApiTypeDamageRelations {
  double_damage_from: ApiNamedResource[]
  half_damage_from: ApiNamedResource[]
  no_damage_from: ApiNamedResource[]
}

export interface ApiTypeWithRelations {
  name: string
  damage_relations: ApiTypeDamageRelations
}

/** Pull the numeric id out of `.../pokemon/25/`-style resource urls. */
export function parseIdFromUrl(url: string): number {
  const match = url.match(/\/(\d+)\/?$/)
  if (!match) throw new Error(`Cannot parse id from url: ${url}`)
  return Number(match[1])
}

/**
 * PokeAPI `gender_rate` is the chance of being female in eighths:
 * -1 = genderless, 0 = always male, 8 = always female, 1..7 = both.
 */
export function gendersFromRate(rate: number): string[] {
  if (rate < 0) return ['genderless']
  if (rate === 0) return ['male']
  if (rate >= 8) return ['female']
  return ['male', 'female']
}

export function statsFromApi(stats: Array<{ base_stat: number; stat: ApiNamedResource }>): StatView[] {
  return stats.map((s) => ({ name: s.stat.name, value: s.base_stat }))
}

/** English genus, e.g. "Seed Pokémon" — what the games call the category. */
export function categoryFromGenera(
  genera: Array<{ genus: string; language: { name: string } }>,
): string | null {
  return genera.find((g) => g.language.name === 'en')?.genus ?? null
}

/** Flatten the nested evolution chain (self included) into display order. */
export function flattenEvolutionChain(chain: ApiChainNode): EvolutionStage[] {
  const stages: EvolutionStage[] = []
  const walk = (node: ApiChainNode): void => {
    stages.push({ id: parseIdFromUrl(node.species.url), name: node.species.name })
    for (const next of node.evolves_to) walk(next)
  }
  walk(chain)
  return stages
}

export function abilityDescription(ability: {
  effect_entries: Array<{ short_effect?: string; effect: string; language: { name: string } }>
  flavor_text_entries: Array<{ flavor_text: string; language: { name: string } }>
}): string | null {
  const effect = ability.effect_entries.find((e) => e.language.name === 'en')
  if (effect) return effect.short_effect ?? effect.effect
  const flavor = ability.flavor_text_entries.find((f) => f.language.name === 'en')
  return flavor ? flavor.flavor_text.replaceAll('\n', ' ') : null
}

/**
 * Damage multipliers for every attacking type against a pokemon whose own
 * types are described by `relations`. Dual types multiply (2 x 0.5 = 1, etc.),
 * and any type that nets out to 1x is left out of the result.
 */
export function weaknessMultipliers(relations: ApiTypeWithRelations[]): Map<string, number> {
  const multipliers = new Map<string, number>()
  const apply = (type: string, factor: number): void => {
    multipliers.set(type, (multipliers.get(type) ?? 1) * factor)
  }
  for (const rel of relations) {
    for (const t of rel.damage_relations.double_damage_from) apply(t.name, 2)
    for (const t of rel.damage_relations.half_damage_from) apply(t.name, 0.5)
    for (const t of rel.damage_relations.no_damage_from) apply(t.name, 0)
  }
  for (const [type, multiplier] of multipliers) {
    if (multiplier === 1) multipliers.delete(type)
  }
  return multipliers
}

/** '4' | '2' | '0.5' | '0.25' | '0' — stored as varchar(255) per the schema. */
export function formatModifier(multiplier: number): string {
  return String(multiplier)
}

/** Official artwork first, front sprite as fallback. */
export function artworkUrl(sprites: {
  front_default: string | null
  other?: Record<string, { front_default?: string | null } | undefined>
}): string | null {
  return sprites.other?.['official-artwork']?.front_default ?? sprites.front_default ?? null
}
