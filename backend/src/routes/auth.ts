import { Router } from 'express'
import { z } from 'zod'
import { User } from '../models/User.js'
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js'
import { provisionNewUser } from '../lib/seedUser.js'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'

export const authRouter = Router()

// Shape returned to the frontend (matches SessionUser).
function sessionUser(u: { _id: any; email: string; full_name: string; roles: string[]; client_company: string }) {
  return {
    id: u._id.toString(),
    email: u.email,
    user_metadata: { full_name: u.full_name },
    roles: u.roles,
    client_company: u.client_company,
  }
}

const signInSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

authRouter.post(
  '/signin',
  asyncHandler(async (req, res) => {
    const { email, password } = signInSchema.parse(req.body)
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = signToken({ sub: user._id.toString(), email: user.email, roles: user.roles as any })
    res.json({ token, user: sessionUser(user as any) })
  }),
)

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
})

authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { email, password, full_name } = signUpSchema.parse(req.body)
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' })

    // First-ever user becomes super_admin + hr_admin (mirrors handle_new_user).
    const userCount = await User.estimatedDocumentCount()
    const roles = userCount === 0 ? ['super_admin', 'hr_admin', 'employee'] : ['employee']

    const user = await User.create({
      email: email.toLowerCase(),
      password_hash: await hashPassword(password),
      full_name,
      roles,
    })
    await provisionNewUser(user._id)

    const token = signToken({ sub: user._id.toString(), email: user.email, roles: user.roles as any })
    res.status(201).json({ token, user: sessionUser(user as any) })
  }),
)

// Stateless JWT: sign-out is handled client-side by discarding the token.
authRouter.post('/signout', (_req, res) => res.json({ ok: true }))

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId)
    if (!user) return res.json(null)
    res.json(sessionUser(user as any))
  }),
)
