/**
 * PokeAPI exposes no colors for types, so we keep our own palette.
 * The second entry of each pair is a lighter tint used for gradients.
 */
export const TYPE_COLORS: Record<string, string> = {
  normal: '#9FA19F',
  fire: '#E62829',
  water: '#2980EF',
  electric: '#FAC000',
  grass: '#3FA129',
  ice: '#3DCEF3',
  fighting: '#FF8000',
  poison: '#9141CB',
  ground: '#915121',
  flying: '#81B9EF',
  psychic: '#EF4179',
  bug: '#91A119',
  rock: '#AFA981',
  ghost: '#704170',
  dragon: '#5060E1',
  dark: '#624D4E',
  steel: '#60A1B8',
  fairy: '#EF70EF',
  stellar: '#40B5A5',
  unknown: '#68A090',
  shadow: '#705898',
}

const FALLBACK_COLOR = '#68A090'

function mixWithWhite(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (channel: number): number =>
    Math.round(channel + (255 - channel) * amount)
  return (
    '#' +
    [mix(r), mix(g), mix(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

/** `[primary, tint]` pair stored in `types.colors` as jsonb. */
export function typeColorPair(typeName: string): string[] {
  const primary = TYPE_COLORS[typeName] ?? FALLBACK_COLOR
  return [primary, mixWithWhite(primary, 0.35)]
}
