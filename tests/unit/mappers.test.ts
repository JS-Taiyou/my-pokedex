import { describe, expect, it } from 'vitest'
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
} from '../../src/lib/mappers'
import { typeColorPair } from '../../src/lib/type-colors'

const res = (name: string) => ({ name, url: `https://pokeapi.co/api/v2/type/${name}/` })

describe('parseIdFromUrl', () => {
  it('extracts trailing ids', () => {
    expect(parseIdFromUrl('https://pokeapi.co/api/v2/pokemon/25/')).toBe(25)
    expect(parseIdFromUrl('https://pokeapi.co/api/v2/pokemon/10033')).toBe(10033)
  })
  it('rejects urls without an id', () => {
    expect(() => parseIdFromUrl('https://pokeapi.co/api/v2/pokemon/')).toThrow()
  })
})

describe('gendersFromRate', () => {
  it('maps every gender_rate convention', () => {
    expect(gendersFromRate(-1)).toEqual(['genderless'])
    expect(gendersFromRate(0)).toEqual(['male'])
    expect(gendersFromRate(8)).toEqual(['female'])
    expect(gendersFromRate(1)).toEqual(['male', 'female'])
    expect(gendersFromRate(4)).toEqual(['male', 'female'])
    expect(gendersFromRate(7)).toEqual(['male', 'female'])
  })
})

describe('statsFromApi', () => {
  it('flattens the nested stat shape', () => {
    expect(
      statsFromApi([
        { base_stat: 45, stat: { name: 'hp', url: 'x' } },
        { base_stat: 49, stat: { name: 'attack', url: 'x' } },
      ]),
    ).toEqual([
      { name: 'hp', value: 45 },
      { name: 'attack', value: 49 },
    ])
  })
})

describe('categoryFromGenera', () => {
  it('picks the english genus', () => {
    expect(
      categoryFromGenera([
        { genus: 'Samen-Pokémon', language: { name: 'de' } },
        { genus: 'Seed Pokémon', language: { name: 'en' } },
      ]),
    ).toBe('Seed Pokémon')
  })
  it('returns null when no english genus exists', () => {
    expect(categoryFromGenera([{ genus: 'Pokémon Graine', language: { name: 'fr' } }])).toBeNull()
  })
})

describe('flattenEvolutionChain', () => {
  it('walks the tree in display order, self included', () => {
    const chain = {
      species: { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon-species/1/' },
      evolves_to: [
        {
          species: { name: 'ivysaur', url: 'https://pokeapi.co/api/v2/pokemon-species/2/' },
          evolves_to: [
            {
              species: { name: 'venusaur', url: 'https://pokeapi.co/api/v2/pokemon-species/3/' },
              evolves_to: [],
            },
          ],
        },
      ],
    }
    expect(flattenEvolutionChain(chain)).toEqual([
      { id: 1, name: 'bulbasaur' },
      { id: 2, name: 'ivysaur' },
      { id: 3, name: 'venusaur' },
    ])
  })
})

describe('abilityDescription', () => {
  it('prefers the english short effect', () => {
    expect(
      abilityDescription({
        effect_entries: [
          { short_effect: 'Powers up Grass-type moves.', effect: 'long', language: { name: 'en' } },
        ],
        flavor_text_entries: [],
      }),
    ).toBe('Powers up Grass-type moves.')
  })
  it('falls back to flavor text with newlines stripped', () => {
    expect(
      abilityDescription({
        effect_entries: [],
        flavor_text_entries: [
          { flavor_text: 'line one\nline two', language: { name: 'en' } },
        ],
      }),
    ).toBe('line one line two')
  })
})

describe('weaknessMultipliers', () => {
  it('combines dual types multiplicatively and drops neutral results', () => {
    // grass/poison, using real PokeAPI relations (abbreviated)
    const grass = {
      name: 'grass',
      damage_relations: {
        double_damage_from: [res('flying'), res('poison'), res('bug'), res('fire'), res('ice')],
        half_damage_from: [res('ground'), res('water'), res('grass'), res('electric')],
        no_damage_from: [],
      },
    }
    const poison = {
      name: 'poison',
      damage_relations: {
        double_damage_from: [res('ground'), res('psychic')],
        half_damage_from: [
          res('fighting'),
          res('poison'),
          res('bug'),
          res('grass'),
          res('fairy'),
        ],
        no_damage_from: [],
      },
    }
    const result = weaknessMultipliers([grass, poison])
    expect(result.get('flying')).toBe(2)
    expect(result.get('fire')).toBe(2)
    expect(result.get('psychic')).toBe(2)
    // grass: 2x vs poison: 0.5x cancels out and disappears
    expect(result.has('poison')).toBe(false)
    expect(result.has('bug')).toBe(false)
    // grass: 0.5x vs poison: 2x cancels too
    expect(result.has('ground')).toBe(false)
  })
  it('handles immunities zeroing everything out', () => {
    // ground attacked by electric (immune) and grass (2x)
    const ground = {
      name: 'ground',
      damage_relations: {
        double_damage_from: [res('water'), res('grass'), res('ice')],
        half_damage_from: [res('poison'), res('rock')],
        no_damage_from: [res('electric')],
      },
    }
    const result = weaknessMultipliers([ground])
    expect(result.get('electric')).toBe(0)
    expect(result.get('water')).toBe(2)
    expect(result.get('rock')).toBe(0.5)
    // neutral types are left out entirely
    expect(result.has('normal')).toBe(false)
    expect(result.has('fire')).toBe(false)
  })
  it('formats modifiers as varchar-friendly strings', () => {
    expect(formatModifier(4)).toBe('4')
    expect(formatModifier(0.25)).toBe('0.25')
    expect(formatModifier(0)).toBe('0')
  })
})

describe('artworkUrl', () => {
  it('prefers official artwork and falls back to the front sprite', () => {
    expect(
      artworkUrl({
        front_default: 'front.png',
        other: { 'official-artwork': { front_default: 'artwork.png' } },
      }),
    ).toBe('artwork.png')
    expect(artworkUrl({ front_default: 'front.png', other: {} })).toBe('front.png')
    expect(artworkUrl({ front_default: null, other: {} })).toBeNull()
  })
})

describe('typeColorPair', () => {
  it('returns primary and a lighter tint', () => {
    const [primary, tint] = typeColorPair('fire')
    expect(primary).toBe('#E62829')
    expect(tint).toMatch(/^#[0-9A-F]{6}$/)
    expect(tint).not.toBe(primary)
  })
  it('falls back for unknown type names', () => {
    expect(typeColorPair('made-up')[0]).toBe('#68A090')
  })
})
