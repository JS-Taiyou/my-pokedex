import { sql } from '../db.js'
import { notFound } from '../lib/errors.js'
import {
  abilityDescription,
  artworkUrl,
  categoryFromGenera,
  flattenEvolutionChain,
  formatModifier,
  gendersFromRate,
  parseIdFromUrl,
  statsFromApi,
  weaknessMultipliers,
} from '../lib/mappers.js'
import { typeColorPair } from '../lib/type-colors.js'
import { pokeapi, type PokeType } from './pokeapi.js'

/**
 * Cache-miss enrichment: pulls everything we know about one pokemon from
 * PokeAPI and writes it to our database in a single transaction. After this
 * runs, that pokemon is served purely from Postgres — the client never waits
 * on (or talks to) PokeAPI again.
 *
 * Concurrency note: a process-wide single-flight map makes sure two parallel
 * requests for the same uncached pokemon trigger exactly one enrichment.
 */

const inflightEnrichments = new Map<number, Promise<void>>()

/**
 * postgres.js's JSONValue wants an index signature or a toJSON hook; our
 * mapper interfaces (StatView, EvolutionStage) have neither, so satisfy it
 * structurally. sql.json() serializes exactly once — never pre-stringify and
 * cast, that double-encodes into a jsonb string.
 */
const asJson = (value: unknown): { toJSON(): unknown } => value as { toJSON(): unknown }

export async function enrichPokemon(id: number): Promise<void> {
  const existing = inflightEnrichments.get(id)
  if (existing) return existing
  const pending = doEnrich(id).finally(() => inflightEnrichments.delete(id))
  inflightEnrichments.set(id, pending)
  return pending
}

const syncedTypes = new Set<string>()

/**
 * Make our database agree with a PokeAPI /type/{name} payload: replace that
 * type's pokemon membership wholesale (the payload is the complete,
 * authoritative list) and mark the type is_cached so filters can be served
 * purely from our database from then on. Links to OTHER types are never
 * touched — dual-type pokemon keep their other rows.
 *
 * Skips work that is already done: once per type per process in memory, and
 * across restarts via the types.is_cached flag.
 */
export async function syncTypeMembership(type: PokeType): Promise<void> {
  if (syncedTypes.has(type.name)) return

  const [known] = await sql`select is_cached from types where id = ${type.id}`
  if (known?.is_cached) {
    syncedTypes.add(type.name)
    return
  }

  const pokemonIds: number[] = []
  const slots: number[] = []
  for (const entry of type.pokemon) {
    pokemonIds.push(parseIdFromUrl(entry.pokemon.url))
    slots.push(entry.slot)
  }

  await sql.begin(async (tx) => {
    await tx`
      insert into types (id, name, colors)
      values (${type.id}, ${type.name}, ${tx.json(typeColorPair(type.name))})
      on conflict (id) do update set name = excluded.name
    `
    await tx`delete from pokemon_types where type_id = ${type.id}`
    await tx`
      insert into pokemon_types (pokemon_id, type_id, slot)
      select r.pokemon_id, ${type.id}, r.slot
      from unnest(${pokemonIds}::int[], ${slots}::int[]) as r(pokemon_id, slot)
      join pokemon p on p.id = r.pokemon_id
      on conflict (pokemon_id, type_id) do nothing
    `
    await tx`update types set is_cached = true, cached_at = now() where id = ${type.id}`
  })
  syncedTypes.add(type.name)
}

async function doEnrich(id: number): Promise<void> {
  const [row] = await sql`select id from pokemon where id = ${id}`
  if (!row) throw notFound(`pokemon ${id}`)

  const pokemon = await pokeapi.pokemon(id)

  // Only the evolution chain truly depends on the species payload; types,
  // abilities and the type directory fan out in parallel with it instead of
  // waiting for it serially.
  const [species, ownTypes, abilities, typeDirectory] = await Promise.all([
    // Forms (mega, gmax, ...) have no /pokemon-species/{id} of their own —
    // the species link on the pokemon payload is always the right target.
    pokeapi.species(pokemon.species.url),
    Promise.all(pokemon.types.map((t) => pokeapi.typeByName(t.type.name))),
    Promise.all(
      pokemon.abilities.map((a) => pokeapi.ability(parseIdFromUrl(a.ability.url))),
    ),
    pokeapi.listTypes(),
  ])
  const chain = await pokeapi.evolutionChain(species.evolution_chain.url)

  // Weaknesses: combine damage relations of the pokemon's own types and
  // resolve every attacking type name to its id via the master type list.
  const weaknesses = weaknessMultipliers(ownTypes)
  const nameToId = new Map(typeDirectory.results.map((r) => [r.name, parseIdFromUrl(r.url)]))
  const missingType = [...weaknesses.keys()].find((name) => !nameToId.has(name))
  if (missingType) throw new Error(`Unknown attacking type from PokeAPI: ${missingType}`)

  const stats = statsFromApi(pokemon.stats)
  const evolutions = flattenEvolutionChain(chain.chain)
  const category = categoryFromGenera(species.genera)

  // Precompute every write payload so the transaction below is a handful of
  // set-based statements instead of a per-row loop of round trips — shorter
  // transactions also hold their row locks for less time.
  const referencedTypes = new Map<number, string>()
  for (const t of ownTypes) referencedTypes.set(t.id, t.name)
  for (const name of weaknesses.keys()) {
    const typeId = nameToId.get(name)!
    if (!referencedTypes.has(typeId)) referencedTypes.set(typeId, name)
  }
  const typeIds = [...referencedTypes.keys()]
  const typeNames = [...referencedTypes.values()]
  const typeColors = typeNames.map((name) => JSON.stringify(typeColorPair(name)))

  const typeLinks = pokemon.types.map((t) => ({
    typeId: ownTypes.find((ot) => ot.name === t.type.name)!.id,
    slot: t.slot,
  }))
  const abilityRows = pokemon.abilities.map((slotInfo) => {
    const ability = abilities.find((a) => a.name === slotInfo.ability.name)!
    return {
      id: ability.id,
      name: ability.name,
      description: abilityDescription(ability),
      isHidden: slotInfo.is_hidden,
      slot: slotInfo.slot,
    }
  })
  const weaknessRows = [...weaknesses.entries()].map(([typeName, multiplier]) => ({
    typeId: nameToId.get(typeName)!,
    modifier: formatModifier(multiplier),
  }))

  await sql.begin(async (tx) => {
    // Make sure every type we are about to reference exists (self-healing in
    // case the types table was not pre-seeded) — one statement for all of them.
    await tx`
      insert into types (id, name, colors)
      select r.id, r.name, r.colors::jsonb
      from unnest(${typeIds}::int[], ${typeNames}::text[], ${typeColors}::text[]) as r(id, name, colors)
      on conflict (id) do update set name = excluded.name
    `

    await tx`
      update pokemon set
        image_url = ${artworkUrl(pokemon.sprites)},
        height = ${pokemon.height},
        weight = ${pokemon.weight},
        stats = ${tx.json(asJson(stats))},
        genders = ${tx.json(gendersFromRate(species.gender_rate))},
        category = ${category},
        evolutions = ${tx.json(asJson(evolutions))},
        is_cached = true,
        cached_at = now()
      where id = ${id}
    `

    await tx`delete from pokemon_types where pokemon_id = ${id}`
    await tx`
      insert into pokemon_types (pokemon_id, type_id, slot)
      select ${id}, r.type_id, r.slot
      from unnest(${typeLinks.map((l) => l.typeId)}::int[], ${typeLinks.map((l) => l.slot)}::int[]) as r(type_id, slot)
      on conflict (pokemon_id, type_id) do update set slot = excluded.slot
    `

    await tx`delete from pokemon_abilities where pokemon_id = ${id}`
    await tx`
      insert into abilities (id, name, description)
      select r.id, r.name, r.description
      from unnest(
        ${abilityRows.map((a) => a.id)}::int[],
        ${abilityRows.map((a) => a.name)}::text[],
        ${abilityRows.map((a) => a.description)}::text[]
      ) as r(id, name, description)
      on conflict (id) do update set
        name = excluded.name,
        description = coalesce(excluded.description, abilities.description)
    `
    await tx`
      insert into pokemon_abilities (pokemon_id, ability_id, is_hidden, slot)
      select ${id}, r.ability_id, r.is_hidden::boolean, r.slot
      from unnest(
        ${abilityRows.map((a) => a.id)}::int[],
        ${abilityRows.map((a) => (a.isHidden ? 1 : 0))}::int[],
        ${abilityRows.map((a) => a.slot)}::int[]
      ) as r(ability_id, is_hidden, slot)
      on conflict (pokemon_id, ability_id) do update set
        is_hidden = excluded.is_hidden,
        slot = excluded.slot
    `

    await tx`delete from pokemon_weaknesses where pokemon_id = ${id}`
    if (weaknessRows.length > 0) {
      await tx`
        insert into pokemon_weaknesses (pokemon_id, type_id, modifier)
        select ${id}, r.type_id, r.modifier
        from unnest(
          ${weaknessRows.map((w) => w.typeId)}::int[],
          ${weaknessRows.map((w) => w.modifier)}::text[]
        ) as r(type_id, modifier)
        on conflict (pokemon_id, type_id) do update set modifier = excluded.modifier
      `
    }
  })
}
