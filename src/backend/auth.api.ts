import { getDB, uid, type DemoUser, type Role } from './mock-db'

export type { Role }

export type SessionUser = {
  id: string
  email: string
  user_metadata: { full_name: string }
  roles: Role[]
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const db = getDB()
  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
  )
  if (!user) throw new Error('Invalid email or password.')
  db.session_user_id = user.id
  return toSessionUser(user)
}

export async function signOut(): Promise<void> {
  const db = getDB()
  db.session_user_id = null
}

export async function signUp(
  email: string,
  password: string,
  full_name: string,
): Promise<SessionUser> {
  const db = getDB()
  if (db.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('An account with this email already exists.')
  }
  const newUser: DemoUser = {
    id: uid('user'),
    email,
    password,
    full_name,
    roles: ['employee'],
    client_company: 'Unassigned',
  }
  db.users.push(newUser)
  // Seed default leave balances
  const year = new Date().getFullYear()
  db.leave_types
    .filter((lt) => lt.code !== 'LOP')
    .forEach((lt) => {
      db.leave_balances.push({
        id: uid('lb'),
        user_id: newUser.id,
        leave_type_id: lt.id,
        year,
        total_days: lt.days_per_year,
        used_days: 0,
        pending_days: 0,
      })
    })
  // Default employee config
  db.employee_configs.push({
    user_id: newUser.id,
    office_lat: null, office_lng: null, office_radius_m: 150,
    home_lat: null, home_lng: null, home_radius_m: 200,
    weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFO', fri: 'WFO', sat: 'OFF', sun: 'OFF' },
  })
  db.session_user_id = newUser.id
  return toSessionUser(newUser)
}

export function getCurrentUser(): SessionUser | null {
  const db = getDB()
  if (!db.session_user_id) return null
  const user = db.users.find((u) => u.id === db.session_user_id)
  if (!user) return null
  return toSessionUser(user)
}

export function getUserById(id: string): SessionUser | null {
  const db = getDB()
  const user = db.users.find((u) => u.id === id)
  if (!user) return null
  return toSessionUser(user)
}

function toSessionUser(u: DemoUser): SessionUser {
  return {
    id: u.id,
    email: u.email,
    user_metadata: { full_name: u.full_name },
    roles: u.roles,
  }
}
