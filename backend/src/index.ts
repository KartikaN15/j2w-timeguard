import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { config } from './config.js'
import { connectDb } from './db.js'
import { ensureLeaveTypes } from './lib/seedUser.js'
import { getCompanyConfigDoc } from './models/CompanyConfig.js'
import { authRouter } from './routes/auth.js'
import { attendanceRouter } from './routes/attendance.js'
import { leavesRouter } from './routes/leaves.js'
import { adminRouter } from './routes/admin.js'

async function main() {
  await connectDb()
  // Ensure baseline data exists (idempotent).
  await ensureLeaveTypes()
  await getCompanyConfigDoc()

  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use(
    cors({
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true,
    }),
  )

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

  app.use('/api/auth', authRouter)
  app.use('/api', attendanceRouter)
  app.use('/api/leaves', leavesRouter)
  app.use('/api/admin', adminRouter)

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: (err as any).errors })
    }
    console.error('[error]', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  })

  app.listen(config.port, () => {
    console.log(`[api] J2W Timeguard backend listening on :${config.port}`)
  })
}

main().catch((err) => {
  console.error('[fatal] Failed to start server', err)
  process.exit(1)
})
