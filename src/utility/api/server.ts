import { serve } from '@hono/node-server'
import env from 'env-var'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { rateLimiter } from 'hono-rate-limiter'
import { baseLogger, MINUTE } from 'sleetcord-common'
import actionlogApp from '../../mod/actionlog/api.js'
import tokenApp from '../../utility/api/tokenApi.js'

const apiLogger = baseLogger.child({ module: 'api' })

export function startApiServer() {
  const PORT = env.get('WEB_API_PORT').required().asPortNumber()
  apiLogger.info(`Starting API server on port ${PORT}`)

  const app = new Hono()

  app.use(logger((msg, ...rest) => baseLogger.info(`${msg} %j`, rest)))

  app.use(
    '/api/*',
    cors({
      origin: '*',
      allowHeaders: ['Authorization'],
    }),
    bodyLimit({
      maxSize: 50 * 1024,
      onError: (c) => c.text('Payload too large', 413),
    }),
    rateLimiter({
      windowMs: 1 * MINUTE,
      limit: 60,
      standardHeaders: 'draft-7',
      keyGenerator: (c) =>
        c.req.header('Authorization') ||
        c.req.header('cf-connecting-ip') ||
        c.req.header('x-forwarded-for') ||
        'unknown',
    }),
  )

  app.route('/api/action-log', actionlogApp)
  app.route('/api/token', tokenApp)

  const server = serve({
    fetch: app.fetch,
    port: PORT,
  })

  server.on('listening', () => {
    apiLogger.info(`API server is listening on port ${PORT}`)
  })

  server.on('error', (err) => {
    apiLogger.error('Error in API server:', err)
  })

  // graceful shutdown
  process.on('SIGINT', () => {
    apiLogger.info('Received SIGINT, shutting down API server')
    server.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    apiLogger.info('Received SIGTERM, shutting down API server')
    server.close((err) => {
      if (err) {
        apiLogger.error(err)
        process.exit(1)
      }
      process.exit(0)
    })
  })
}
