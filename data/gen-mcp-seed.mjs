// One-off generator: builds SQL files that seed the Supabase project without
// a local DATABASE_URL (e.g. via the Supabase MCP execute_sql tool). Produces
// the same content `npm run db:seed` would insert — including the
// pattern-derived artwork urls, with a coalesce guard so re-runs never
// overwrite existing (possibly enriched) artwork.
//
// Keep SPRITELESS_IDS in sync with src/lib/artwork.ts.
import { readFileSync, writeFileSync } from 'node:fs'

const TYPE_COLORS = {
  normal: '#9FA19F', fire: '#E62829', water: '#2980EF', electric: '#FAC000',
  grass: '#3FA129', ice: '#3DCEF3', fighting: '#FF8000', poison: '#9141CB',
  ground: '#915121', flying: '#81B9EF', psychic: '#EF4179', bug: '#91A119',
  rock: '#AFA981', ghost: '#704170', dragon: '#5060E1', dark: '#624D4E',
  steel: '#60A1B8', fairy: '#EF70EF', stellar: '#40B5A5', unknown: '#68A090',
  shadow: '#705898',
}
const FALLBACK = '#68A090'
const ARTWORK_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
// Form ids verified to have no artwork upstream at all — skip the pattern.
const SPRITELESS_IDS = new Set([10264, 10266, 10268, 10270])

const mixWithWhite = (hex, amount) => {
  const mix = (c) => Math.round(c + (255 - c) * amount)
  return '#' + [1, 3, 5]
    .map((i) => mix(parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
const colorPair = (name) => {
  const primary = TYPE_COLORS[name] ?? FALLBACK
  return [primary, mixWithWhite(primary, 0.35)]
}
const esc = (s) => s.replaceAll("'", "''")
const artwork = (id) => (SPRITELESS_IDS.has(id) ? null : `${ARTWORK_BASE}/${id}.png`)

const typeList = await fetch('https://pokeapi.co/api/v2/type?limit=60').then((r) => r.json())
const typeRows = typeList.results.map((r) => {
  const id = Number(r.url.match(/\/(\d+)\/?$/)[1])
  const [primary, tint] = colorPair(r.name)
  return `(${id}, '${r.name}', '["${primary}", "${tint}"]'::jsonb)`
})
writeFileSync(
  'data/seed-types.sql',
  `insert into types (id, name, colors) values\n  ${typeRows.join(',\n  ')}\non conflict (id) do update set name = excluded.name, colors = excluded.colors;\n`,
)
console.log(`types: ${typeRows.length} rows -> data/seed-types.sql`)

const entries = JSON.parse(readFileSync('data/pokemon-list.json', 'utf8')).results
const tuples = entries.map((e) => {
  const url = artwork(e.id)
  return `(${e.id}, '${esc(e.name)}', '${esc(e.data_url)}'${url ? `, '${url}'` : ', null'})`
})
// split into chunks so each execute_sql payload stays reasonable
const CHUNK = 450
for (let i = 0, part = 1; i < tuples.length; i += CHUNK, part++) {
  writeFileSync(
    `data/seed-pokemon-${part}.sql`,
    `insert into pokemon (id, name, data_url, image_url) values\n  ${tuples.slice(i, i + CHUNK).join(',\n  ')}\non conflict (id) do update set\n  name = excluded.name,\n  data_url = excluded.data_url,\n  image_url = coalesce(pokemon.image_url, excluded.image_url);\n`,
  )
}
console.log(`pokemon: ${tuples.length} rows -> ${Math.ceil(tuples.length / CHUNK)} chunk files`)
