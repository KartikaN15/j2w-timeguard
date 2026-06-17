import type { Request, Response, NextFunction } from 'express'
import { verifyToken, isAdminRoles } from '../lib/auth.js'
import type { Role } from '../models/User.js'

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; email: string; roles: Role[] }
    }
  }
}

// Requires a valid Bearer JWT. Attaches req.auth. Replaces Supabase RLS auth.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing Bearer token' })
  }
  const token = header.slice('Bearer '.length).trim()
  if (!token) return res.status(401).json({ error: 'Unauthorized: empty token' })

  try {
    const payload = verifyToken(token)
    req.auth = { userId: payload.sub, email: payload.email, roles: payload.roles }
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized: invalid token' })
  }
}

// Requires the authenticated user to be an admin (super_admin or hr_admin).
// Replaces the Postgres is_admin() RLS checks.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Unauthorized' })
  if (!isAdminRoles(req.auth.roles)) return res.status(403).json({ error: 'Forbidden' })
  next()
}
