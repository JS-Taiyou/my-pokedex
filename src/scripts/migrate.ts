import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sql } from '../db.js'

/** Applies supabase/migrations/*.sql in filename order, exactly once each. */
async function main(): Promise<void> {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `
  const dir = path.resolve('supabase/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const applied = new Set(
    (await sql`select name from schema_migrations`).map((r) => r.name as string),
  )

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (already applied)`)
      continue
    }
    const content = readFileSync(path.join(dir, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(content)
      await tx`insert into schema_migrations (name) values (${file})`
    })
    console.log(`+ ${file}`)
  }
  console.log('Migrations complete.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => sql.end())
