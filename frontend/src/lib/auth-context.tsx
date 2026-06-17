import * as React from 'react'
import type { Role, SessionUser } from '@/backend/auth.api'
import { getCurrentUser, signOut as apiSignOut } from '@/backend/auth.api'

export type { Role }

type AuthState = {
  user: SessionUser | null
  roles: Role[]
  loading: boolean
  isAdmin: boolean
  signOut: () => Promise<void>
  refreshUser: () => void
}

const AuthContext = React.createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [loading, setLoading] = React.useState(true)

  const loadUser = React.useCallback(async () => {
    setLoading(true)
    const u = await getCurrentUser()
    setUser(u)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    loadUser()
    // Reload whenever the token changes (sign-in / sign-out), including from
    // another tab (the native `storage` event).
    const onAuth = () => loadUser()
    window.addEventListener('j2w-auth', onAuth)
    window.addEventListener('storage', onAuth)
    return () => {
      window.removeEventListener('j2w-auth', onAuth)
      window.removeEventListener('storage', onAuth)
    }
  }, [loadUser])

  const value = React.useMemo<AuthState>(
    () => ({
      user,
      roles: user?.roles ?? [],
      loading,
      isAdmin: (user?.roles ?? []).some((r: Role) => r === 'super_admin' || r === 'hr_admin'),
      signOut: async () => { await apiSignOut(); setUser(null) },
      refreshUser: loadUser,
    }),
    [user, loading, loadUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
