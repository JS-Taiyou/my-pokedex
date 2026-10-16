import { existsSync, readFileSync } from 'node:fs'
import { sql } from '../db.js'
import { parseIdFromUrl } from '../lib/mappers.js'
import { provisionalArtworkFor } from '../lib/artwork.js'
import { typeColorPair } from '../lib/type-colors.js'
import { pokeapi } from '../services/pokeapi.js'

interface ListEntry {
  id: number
  name: string
  data_url: string
}

/**
 * Seeds types (from PokeAPI names + our color palette) and the pokemon index
 * from data/pokemon-list.json. Pokemon rows land with is_cached = false;
 * details arrive later via lazy enrichment or `npm run enrich`.
 */
async function main(): Promise<void> {
  const typeList = await pokeapi.listTypes()
  for (const resource of typeList.results) {
    const id = parseIdFromUrl(resource.url)
    await sql`
      insert into types (id, name, colors)
      values (${id}, ${resource.name}, ${sql.json(typeColorPair(resource.name))})
      on conflict (id) do update set
        name = excluded.name,
        colors = excluded.colors
    `
  }
  console.log(`types: upserted ${typeList.results.length}`)

  if (!existsSync('data/pokemon-list.json')) {
    throw new Error('data/pokemon-list.json is missing — run `npm run fetch:list` first')
  }
  const entries = (JSON.parse(readFileSync('data/pokemon-list.json', 'utf8')) as {
    results: ListEntry[]
  }).results

  // Bulk upsert with explicit placeholders — 4 params per row, well under the
  // 65535-parameter statement limit at 500 rows per chunk. Artwork is the
  // pattern-derived best effort (null for pokemon known to have none); on
  // conflict it only fills rows still missing artwork, so enriched
  // (authoritative) urls are never overwritten.
  const CHUNK = 500
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK)
    const placeholders: string[] = []
    const params: Array<number | string | null> = []
    chunk.forEach((entry, j) => {
      const base = j * 4
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`)
      params.push(entry.id, entry.name, entry.data_url, provisionalArtworkFor(entry.id))
    })
    await sql.unsafe(
      `insert into pokemon (id, name, data_url, image_url) values ${placeholders.join(', ')}
       on conflict (id) do update set
         name = excluded.name,
         data_url = excluded.data_url,
         image_url = coalesce(pokemon.image_url, excluded.image_url)`,
      params,
    )
  }
  console.log(`pokemon: upserted ${entries.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => sql.end())
