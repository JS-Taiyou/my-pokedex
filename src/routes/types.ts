import { Hono } from 'hono'
import { sql } from '../db.js'
import type { TypeBadge } from './pokemon.js'

const app = new Hono()

/** GET /api/types — every type with our color palette, for filter chips and badges. */
app.get('/', async (c) => {
  const rows = await sql<TypeBadge[]>`select id, name, colors from types order by id`
  return c.json(rows)
})

export default app
