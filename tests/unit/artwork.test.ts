import { describe, expect, it } from 'vitest'
import {
  SPRITELESS_IDS,
  provisionalArtworkFor,
  provisionalArtworkUrl,
  withProvisionalArtwork,
} from '../../src/lib/artwork'

describe('provisionalArtworkUrl', () => {
  it('matches the official-artwork pattern (id 1000 example from the API)', () => {
    expect(provisionalArtworkUrl(1000)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1000.png',
    )
    expect(provisionalArtworkUrl(1)).toBe(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
    )
  })
  it('returns null for pokemon verified to have no artwork upstream', () => {
    for (const id of SPRITELESS_IDS) {
      expect(provisionalArtworkFor(id)).toBeNull()
    }
    expect(provisionalArtworkFor(25)).toBe(provisionalArtworkUrl(25))
  })
})

describe('withProvisionalArtwork', () => {
  it('derives a provisional url for rows without artwork', () => {
    expect(withProvisionalArtwork({ id: 25, image_url: null })).toEqual({
      id: 25,
      image_url: provisionalArtworkUrl(25),
      image_provisional: true,
    })
  })
  it('keeps persisted artwork untouched', () => {
    const real = 'https://example.com/real.png'
    expect(withProvisionalArtwork({ id: 25, image_url: real })).toEqual({
      id: 25,
      image_url: real,
      image_provisional: false,
    })
  })
  it('leaves spriteless pokemon without any derived url', () => {
    expect(withProvisionalArtwork({ id: 10264, image_url: null })).toEqual({
      id: 10264,
      image_url: null,
      image_provisional: false,
    })
  })
})
