// Runs once before all integration tests: rebuilds the isolated test schema
// from scratch (drop + create + apply supabase/migrations). Uses its own
// single connection with the same search_path isolation.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import 'dotenv/config'
import postgres from 'postgres'

const SCHEMA = 'pokedex_test'

export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const sql = postgres(url, {
    max: 1,
    ssl: url.includes('supabase') ? 'require' : undefined,
    prepare: false,
    connection: { search_path: SCHEMA },
  })

  try {
    await sql.unsafe(`drop schema if exists ${SCHEMA} cascade`)
    await sql.unsafe(`create schema ${SCHEMA}`)
    const dir = path.resolve('supabase/migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      await sql.unsafe(readFileSync(path.join(dir, file), 'utf8'))
    }
    console.log(`[integration] ${SCHEMA} rebuilt, ${files.length} migrations applied`)
  } finally {
    await sql.end()
  }
}
