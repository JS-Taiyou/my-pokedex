import { sql } from '../db.js'
import { enrichPokemon, syncTypeMembership } from './enrichment.js'
import { pokeapi } from './pokeapi.js'
import { typeColorPair } from '../lib/type-colors.js'
import { parseIdFromUrl } from '../lib/mappers.js'

/**
 * Server-side background sync, started when the server boots:
 *
 * - Type sweep: repeatedly takes one type with is_cached = false from our
 *   database (so restarts resume where they left off), fetches it from
 *   PokeAPI, and syncs its full membership. One type every 5s; a complete
 *   sweep over all 21 types takes ~2 minutes, after which every type filter
 *   is served purely from Postgres.
 *
 * - Enricher: every 5s, enrich the single oldest un-enriched pokemon
 *   (select ... where is_cached = false order by id limit 1). Everything
 *   flows through the shared upstream limiter, so the two loops combined
 *   stay well within our politeness budget.
 */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const MAX_FAILURES_PER_POKEMON = 3

export function startBackgroundSync(): void {
  void runTypesSweep()
  void runEnricherLoop()
  console.log('[sync] background type sweep and enricher started (5s spacing)')
}

/** Seed the types table from PokeAPI if it is empty (fresh install). */
async function ensureTypeRowsExist(): Promise<void> {
  const [{ count }] = await sql`select count(*)::int as count from types`
  if (count > 0) return
  const list = await pokeapi.listTypes()
  for (const resource of list.results) {
    const id = parseIdFromUrl(resource.url)
    await sql`
      insert into types (id, name, colors)
      values (${id}, ${resource.name}, ${sql.json(typeColorPair(resource.name))})
      on conflict (id) do update set name = excluded.name
    `
  }
}

async function runTypesSweep(): Promise<void> {
  let failuresInARow = 0
  for (;;) {
    try {
      await ensureTypeRowsExist()
      const [row] = await sql`
        select id, name from types where not is_cached order by id limit 1
      `
      if (!row) {
        console.log('[sync] type sweep complete — all types cached')
        return
      }
      const type = await pokeapi.typeByName(row.name as string)
      await syncTypeMembership(type)
      console.log(`[sync] type synced: ${row.name as string}`)
      failuresInARow = 0
    } catch (err) {
      failuresInARow++
      console.error(
        `[sync] type sweep step failed (${failuresInARow}):`,
        err instanceof Error ? err.message : err,
      )
      if (failuresInARow >= 5) return // give up this sweep; restart or filter hit retries
    }
    await sleep(5000)
  }
}

async function runEnricherLoop(): Promise<void> {
  // Pokemon that keep failing enrichment are skipped for the rest of the
  // process lifetime so one bad row can't stall the queue forever.
  const blacklisted = new Set<number>()
  const failures = new Map<number, number>()
  let enrichedCount = 0

  for (;;) {
    await sleep(5000)
    try {
      const excluded = blacklisted.size > 0 ? [...blacklisted] : null
      const [row] = await sql`
        select id from pokemon
        where not is_cached
          and (${excluded}::int[] is null or id <> all(${excluded}))
        order by id
        limit 1
      `
      if (!row) continue

      try {
        await enrichPokemon(row.id as number)
        failures.delete(row.id as number)
        enrichedCount++
        if (enrichedCount % 25 === 0) {
          console.log(`[sync] enricher progress: ${enrichedCount} pokemon enriched`)
        }
      } catch (err) {
        const count = (failures.get(row.id as number) ?? 0) + 1
        failures.set(row.id as number, count)
        if (count >= MAX_FAILURES_PER_POKEMON) blacklisted.add(row.id as number)
        console.error(
          `[sync] enrich #${row.id} failed (${count}/${MAX_FAILURES_PER_POKEMON}):`,
          err instanceof Error ? err.message : err,
        )
      }
    } catch (err) {
      console.error(
        '[sync] enricher select failed:',
        err instanceof Error ? err.message : err,
      )
    }
  }
}
