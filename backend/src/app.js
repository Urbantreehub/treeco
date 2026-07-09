import express from 'express'
import cors from 'cors'

import jobsRouter from './routes/jobs.js'
import clientsRouter from './routes/clients.js'
import scheduleRouter from './routes/schedule.js'
import quotesRouter from './routes/quotes.js'

// Builds the Express app without starting a listener, so tests (supertest) can
// import it directly. server.js wraps this and calls listen().
export function createApp() {
  const app = express()

  app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }))
  app.use(express.json({ limit: '10mb' }))

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // API routes
  app.use('/api/jobs', jobsRouter)
  app.use('/api/clients', clientsRouter)
  app.use('/api/schedule', scheduleRouter)
  app.use('/api/quotes', quotesRouter)

  // Public quote routes (no auth — client-facing)
  app.use('/q', quotesRouter)

  return app
}
