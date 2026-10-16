import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { sql } from './db.js'
import { ApiError } from './lib/errors.js'
import pokemonRoutes from './routes/pokemon.js'
import typesRoutes from './routes/types.js'
import userRoutes from './routes/users.js'

const WEB_DIST = path.resolve('web/dist')

export function createApp(): Hono {
  const app = new Hono()

  app.use(logger())
  // Not needed with the Vite dev proxy, but harmless insurance for anyone
  // pointing a dev server straight at the API port.
  app.use('/api/*', cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))

  app.get('/api/health', async (c) => {
    try {
      await sql`select 1`
      return c.json({ ok: true, db: 'up' })
    } catch {
      return c.json({ ok: false, db: 'down' }, 503)
    }
  })

  app.route('/api/pokemon', pokemonRoutes)
  app.route('/api/types', typesRoutes)
  app.route('/api/users', userRoutes)

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404)
    return c.text('Not found', 404)
  })

  if (existsSync(WEB_DIST)) {
    // Vite emits content-hashed filenames under /assets — safe to cache hard.
    app.use('/assets/*', async (c, next) => {
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
      await next()
    })
    app.use('*', serveStatic({ root: 'web/dist' }))
    // SPA fallback: unknown non-API paths render the client app.
    let indexHtml: string | null = null
    app.get('*', (c, next) => {
      if (c.req.path.startsWith('/api/')) return next()
      indexHtml ??= readFileSync(path.join(WEB_DIST, 'index.html'), 'utf8')
      return c.html(indexHtml)
    })
  }

  return app
}
