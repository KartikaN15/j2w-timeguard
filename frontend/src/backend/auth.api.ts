import { api, setToken, clearToken, getToken } from '@/lib/api'

export type Role = 'super_admin' | 'hr_admin' | 'account_manager' | 'reporting_manager' | 'employee'

export type SessionUser = {
  id: string
  email: string
  user_metadata: { full_name: string }
  roles: Role[]
  client_company?: string
}

type AuthResponse = { token: string; user: SessionUser }

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const res = await api.post<AuthResponse>('/api/auth/signin', { email, password })
  setToken(res.token)
  return res.user
}

export async function signUp(email: string, password: string, full_name: string): Promise<SessionUser> {
  const res = await api.post<AuthResponse>('/api/auth/signup', { email, password, full_name })
  setToken(res.token)
  return res.user
}

export async function signOut(): Promise<void> {
  try {
    await api.post('/api/auth/signout')
  } catch {
    // ignore — sign-out is client-side regardless
  }
  clearToken()
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!getToken()) return null
  try {
    return await api.get<SessionUser | null>('/api/auth/me')
  } catch {
    return null
  }
}

export function getUserById(_id: string): SessionUser | null {
  // Cross-user lookups go through admin server endpoints, not this helper.
  return null
}
