import { beforeAll, describe, expect, it, vi } from 'vitest'

// PokeAPI is mocked: these tests exercise the real SQL write path of
// enrichment (the jsonb encoding, link tables, weaknesses) against the
// isolated pokedex_test schema, without any network.
vi.mock('../../src/services/pokeapi.js', async () => {
  const f = await import('./fixtures.js')
  class UpstreamNotFoundError extends Error {}
  return {
    UpstreamNotFoundError,
    pokeapi: {
      pokemon: vi.fn(async () => f.pokemonPayload()),
      species: vi.fn(async () => f.speciesPayload()),
      evolutionChain: vi.fn(async () => f.chainPayload()),
      typeByName: vi.fn(async (name: string) =>
        name === 'grass' ? f.grassTypePayload() : f.poisonTypePayload(),
      ),
      listTypes: vi.fn(async () => f.typeListPayload()),
      ability: vi.fn(async () => f.abilityPayload()),
    },
  }
})

import { enrichPokemon, syncTypeMembership } from '../../src/services/enrichment.js'
import { grassTypePayload } from './fixtures.js'
import { sql } from '../../src/db.js'

describe('enrichPokemon (integration)', () => {
  beforeAll(async () => {
    await sql`
      insert into pokemon (id, name, data_url)
      values (1, 'bulbasaur', 'https://pokeapi.co/api/v2/pokemon/1/'),
             (2, 'ivysaur', 'https://pokeapi.co/api/v2/pokemon/2/')
      on conflict (id) do update set name = excluded.name
    `
  })

  it('throws 404 for a pokemon that is not in the index', async () => {
    await expect(enrichPokemon(999999)).rejects.toThrow(/not found/i)
  })

  it('enriches and stores properly-typed jsonb (double-encoding regression)', async () => {
    await enrichPokemon(1)

    const [row] = await sql`
      select is_cached, image_url, height, weight, category, stats, genders, evolutions, cached_at,
             jsonb_typeof(stats) as stats_kind,
             jsonb_typeof(genders) as genders_kind,
             jsonb_typeof(evolutions) as evolutions_kind
      from pokemon where id = 1
    `
    // The historic bug stored these as jsonb *strings* (double-encoded).
    expect(row.stats_kind).toBe('array')
    expect(row.genders_kind).toBe('array')
    expect(row.evolutions_kind).toBe('array')

    expect(row.is_cached).toBe(true)
    expect(row.cached_at).not.toBeNull()
    expect(row.height).toBe(7)
    expect(row.weight).toBe(69)
    expect(row.category).toBe('Seed Pokémon')
    expect(row.image_url).toContain('official-artwork/1.png')
    expect(row.stats).toEqual([
      { name: 'hp', value: 45 },
      { name: 'attack', value: 49 },
    ])
    expect(row.genders).toEqual(['male', 'female']) // gender_rate 1 = both
    expect(row.evolutions).toEqual([
      { id: 1, name: 'bulbasaur' },
      { id: 2, name: 'ivysaur' },
      { id: 3, name: 'venusaur' },
    ])
  })

  it('writes type, ability and weakness links with correct slots', async () => {
    const typeLinks = await sql`
      select t.name, pt.slot from pokemon_types pt
      join types t on t.id = pt.type_id where pt.pokemon_id = 1 order by pt.slot
    `
    expect(typeLinks).toEqual([
      { name: 'grass', slot: 1 },
      { name: 'poison', slot: 2 },
    ])

    const abilities = await sql`
      select a.name, a.description, pa.is_hidden, pa.slot
      from pokemon_abilities pa join abilities a on a.id = pa.ability_id
      where pa.pokemon_id = 1
    `
    expect(abilities).toEqual([
      { name: 'overgrow', description: 'Powers up Grass moves.', is_hidden: false, slot: 1 },
    ])

    // grass: fire ×2, water ×0.5 · poison: psychic ×2 — neutral types absent
    const weaknesses = await sql`
      select t.name, w.modifier from pokemon_weaknesses w
      join types t on t.id = w.type_id where w.pokemon_id = 1
      order by (w.modifier::numeric) desc, t.name
    `
    expect(weaknesses).toEqual([
      { name: 'fire', modifier: '2' },
      { name: 'psychic', modifier: '2' },
      { name: 'water', modifier: '0.5' },
    ])
  })

  it('is idempotent: re-enriching replaces links without duplication', async () => {
    await enrichPokemon(1)
    const [counts] = await sql`
      select
        (select count(*) from pokemon_types where pokemon_id = 1) as types,
        (select count(*) from pokemon_abilities where pokemon_id = 1) as abilities,
        (select count(*) from pokemon_weaknesses where pokemon_id = 1) as weaknesses
    `
    expect(counts).toEqual({ types: '2', abilities: '1', weaknesses: '3' })
  })
})

describe('syncTypeMembership (integration)', () => {
  it('replaces membership wholesale and flags the type is_cached', async () => {
    await syncTypeMembership(grassTypePayload())

    const [type] = await sql`select is_cached, cached_at from types where id = 12`
    expect(type.is_cached).toBe(true)
    expect(type.cached_at).not.toBeNull()

    const members = await sql`
      select p.id, pt.slot from pokemon_types pt
      join pokemon p on p.id = pt.pokemon_id where pt.type_id = 12 order by p.id
    `
    expect(members).toEqual([
      { id: 1, slot: 1 },
      { id: 2, slot: 1 },
    ])
  })

  it('never touches other types’ links for the same pokemon', async () => {
    // bulbasaur keeps its poison link from the enrichment tests
    const [row] = await sql`
      select count(*) as poison_links from pokemon_types where pokemon_id = 1 and type_id = 4
    `
    expect(row.poison_links).toBe('1')
  })

  it('skips re-syncing within the process (in-memory guard)', async () => {
    await sql`delete from pokemon_types where type_id = 12 and pokemon_id = 2`
    await syncTypeMembership(grassTypePayload()) // early-exits, no rewrite
    const [row] = await sql`
      select count(*) as grass_ivysaur from pokemon_types where type_id = 12 and pokemon_id = 2
    `
    expect(row.grass_ivysaur).toBe('0')
  })
})
