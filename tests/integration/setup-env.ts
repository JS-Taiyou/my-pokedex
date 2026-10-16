// Runs in each worker BEFORE test modules are imported: loads .env and pins
// the shared sql singleton (src/db.ts) to the isolated test schema.
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Integration tests need DATABASE_URL in .env — they run against a ' +
      'dedicated pokedex_test schema, never against public.',
  )
}

process.env.DB_SCHEMA = 'pokedex_test'
