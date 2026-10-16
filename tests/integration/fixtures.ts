// Crafted PokeAPI payloads for integration tests. Small and deterministic —
// damage relations are chosen so expected weaknesses are unambiguous:
// grass(pokemon 1) is our test subject with fire ×2, water ×0.5, psychic ×2.

const u = (resource: string, id: number): string =>
  `https://pokeapi.co/api/v2/${resource}/${id}/`

export const BULBASAUR_ID = 1

export function pokemonPayload() {
  return {
    id: 1,
    name: 'bulbasaur',
    height: 7,
    weight: 69,
    sprites: {
      front_default: null,
      other: {
        'official-artwork': {
          front_default:
            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
        },
      },
    },
    stats: [
      { base_stat: 45, stat: { name: 'hp', url: u('stat', 1) } },
      { base_stat: 49, stat: { name: 'attack', url: u('stat', 2) } },
    ],
    types: [
      { slot: 1, type: { name: 'grass', url: u('type', 12) } },
      { slot: 2, type: { name: 'poison', url: u('type', 4) } },
    ],
    abilities: [
      { slot: 1, is_hidden: false, ability: { name: 'overgrow', url: u('ability', 65) } },
    ],
    species: { url: u('pokemon-species', 1) },
  }
}

export function speciesPayload() {
  return {
    gender_rate: 1,
    genera: [{ genus: 'Seed Pokémon', language: { name: 'en' } }],
    evolution_chain: { url: u('evolution-chain', 1) },
  }
}

export function chainPayload() {
  return {
    id: 1,
    chain: {
      species: { name: 'bulbasaur', url: u('pokemon-species', 1) },
      evolves_to: [
        {
          species: { name: 'ivysaur', url: u('pokemon-species', 2) },
          evolves_to: [
            { species: { name: 'venusaur', url: u('pokemon-species', 3) }, evolves_to: [] },
          ],
        },
      ],
    },
  }
}

export function grassTypePayload() {
  return {
    id: 12,
    name: 'grass',
    damage_relations: {
      double_damage_from: [{ name: 'fire', url: u('type', 10) }],
      half_damage_from: [{ name: 'water', url: u('type', 11) }],
      no_damage_from: [],
    },
    pokemon: [
      { pokemon: { name: 'bulbasaur', url: u('pokemon', 1) }, slot: 1 },
      { pokemon: { name: 'ivysaur', url: u('pokemon', 2) }, slot: 1 },
    ],
  }
}

export function poisonTypePayload() {
  return {
    id: 4,
    name: 'poison',
    damage_relations: {
      double_damage_from: [{ name: 'psychic', url: u('type', 14) }],
      half_damage_from: [],
      no_damage_from: [],
    },
    pokemon: [{ pokemon: { name: 'bulbasaur', url: u('pokemon', 1) }, slot: 2 }],
  }
}

export function abilityPayload() {
  return {
    id: 65,
    name: 'overgrow',
    effect_entries: [
      { short_effect: 'Powers up Grass moves.', effect: 'long', language: { name: 'en' } },
    ],
    flavor_text_entries: [],
  }
}

/** Master list covering every type name referenced by the crafted payloads. */
export function typeListPayload() {
  return {
    count: 5,
    next: null,
    previous: null,
    results: [
      { name: 'grass', url: u('type', 12) },
      { name: 'poison', url: u('type', 4) },
      { name: 'fire', url: u('type', 10) },
      { name: 'water', url: u('type', 11) },
      { name: 'psychic', url: u('type', 14) },
    ],
  }
}
