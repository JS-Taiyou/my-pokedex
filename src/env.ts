import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  // Optional so helper scripts (fetch:list) can run without a database,
  // but the server and any db-touching script require it at use time.
  DATABASE_URL: z.string().min(1).optional(),
  // When set, all unqualified SQL resolves against this schema instead of
  // public — used by the integration tests for search_path isolation.
  DB_SCHEMA: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  POKEAPI_BASE_URL: z.string().url().default('https://pokeapi.co/api/v2'),
  POKEAPI_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
