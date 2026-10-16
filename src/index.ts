import { serve } from '@hono/node-server'
import { env } from './env.js'
import { createApp } from './app.js'
import { startBackgroundSync } from './services/background.js'

const app = createApp()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
  startBackgroundSync()
})
