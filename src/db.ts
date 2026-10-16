import postgres from 'postgres'
import { env } from './env.js'

if (!env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and paste your Supabase ' +
      'session-pooler connection string (Dashboard -> Connect -> Session pooler).',
  )
}

const isSupabase = env.DATABASE_URL.includes('supabase')

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Supabase requires TLS; the session pooler also dislikes client-side
  // prepared statements, so keep them off for portability across poolers.
  ssl: isSupabase ? 'require' : undefined,
  prepare: false,
  // Startup parameter applied to every pooled connection: unqualified SQL
  // resolves against DB_SCHEMA. Integration tests use this to run inside an
  // isolated schema on the same server.
  connection: env.DB_SCHEMA ? { search_path: env.DB_SCHEMA } : undefined,
})
