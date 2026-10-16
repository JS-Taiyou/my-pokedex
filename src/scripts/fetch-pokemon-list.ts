import { mkdirSync, writeFileSync } from 'node:fs'
import { env } from '../env.js'
import { parseIdFromUrl } from '../lib/mappers.js'
import { pokeapi } from '../services/pokeapi.js'

/**
 * One-time snapshot of the full pokemon index: `data/pokemon-list.json`.
 * Reads `count`, asks for everything in a single request, and falls back to
 * chunked paging if the API truncates the response.
 */
async function main(): Promise<void> {
  const { count } = await pokeapi.listPokemon(1, 0)
  console.log(`PokeAPI reports ${count} pokemon`)

  let resources = []
  const single = await pokeapi.listPokemon(count, 0)
  if (single.results.length === count) {
    resources = single.results
  } else {
    console.log(
      `Single page returned ${single.results.length}/${count} — paging instead`,
    )
    let offset = 0
    while (offset < count) {
      const page = await pokeapi.listPokemon(Math.min(1000, count - offset), offset)
      resources.push(...page.results)
      offset += 1000
    }
  }

  const seen = new Set<number>()
  const results = resources
    .map((r) => ({ id: parseIdFromUrl(r.url), name: r.name, data_url: r.url }))
    .filter((r) => (seen.has(r.id) ? false : seen.add(r.id)))

  mkdirSync('data', { recursive: true })
  const payload = {
    count: results.length,
    source: `${env.POKEAPI_BASE_URL}/pokemon`,
    generated_at: new Date().toISOString(),
    results,
  }
  writeFileSync('data/pokemon-list.json', JSON.stringify(payload, null, 2))
  console.log(`Wrote data/pokemon-list.json (${results.length} entries)`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
