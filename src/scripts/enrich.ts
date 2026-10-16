import { sql } from '../db.js'
import { enrichPokemon } from '../services/enrichment.js'

/**
 * Backfills details for uncached pokemon so the UI has artwork without
 * waiting for first visits. Usage:
 *   npm run enrich -- 50     first 50 uncached by id
 *   npm run enrich -- --all everything
 * Pokemon are processed one at a time (their sub-requests already run
 * concurrently through the PokeAPI limiter) to stay polite upstream.
 */
async function main(): Promise<void> {
  const arg = process.argv[2] ?? '50'
  const limit = arg === '--all' ? undefined : Number(arg)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('Usage: npm run enrich -- <count | --all>')
  }

  const rows = limit
    ? await sql`select id from pokemon where not is_cached order by id limit ${limit}`
    : await sql`select id from pokemon where not is_cached order by id`

  console.log(`Enriching ${rows.length} pokemon...`)
  let ok = 0
  let failed = 0
  for (const [index, { id }] of rows.entries()) {
    try {
      await enrichPokemon(id)
      ok++
    } catch (err) {
      failed++
      console.error(`#${id}: ${err instanceof Error ? err.message : String(err)}`)
    }
    if ((index + 1) % 10 === 0) console.log(`  ${index + 1}/${rows.length}`)
  }
  console.log(`Done. enriched=${ok} failed=${failed} remaining-uncached-in-db=true`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => sql.end())
