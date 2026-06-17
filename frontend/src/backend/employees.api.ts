import { getDB, uid, type EmployeeConfig, type CompanyConfig, type Role } from './mock-db'
import { getUserById } from './auth.api'

export type EmployeeRow = {
  user_id: string
  full_name: string
  email: string
  client_company: string
  roles: string[]
  config: EmployeeConfig
}

export async function getEmployees(): Promise<EmployeeRow[]> {
  const db = getDB()
  return db.users.map((u) => {
    const config = db.employee_configs.find((c) => c.user_id === u.id) ?? {
      user_id: u.id,
      office_lat: null, office_lng: null, office_radius_m: 150,
      home_lat: null, home_lng: null, home_radius_m: 200,
      weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFO', fri: 'WFO', sat: 'OFF', sun: 'OFF' },
    }
    return {
      user_id: u.id,
      full_name: u.full_name,
      email: u.email,
      client_company: u.client_company,
      roles: u.roles,
      config: config as EmployeeConfig,
    }
  })
}

export async function getEmployeeConfig(userId: string): Promise<EmployeeConfig | null> {
  const db = getDB()
  return db.employee_configs.find((c) => c.user_id === userId) ?? null
}

export async function getCompanyConfig(): Promise<CompanyConfig> {
  const db = getDB()
  return db.company_configs[0]
}

export async function updateCompanyConfig(updates: Partial<Omit<CompanyConfig, 'id'>>): Promise<void> {
  const db = getDB()
  db.company_configs[0] = { ...db.company_configs[0], ...updates }
}

export async function createEmployee(data: {
  full_name: string
  email: string
  password: string
  client_company: string
  roles?: Role[]
  weekly_schedule?: Record<string, 'WFO' | 'WFH' | 'OFF' | 'FLEX'>
}): Promise<{ ok: boolean; user_id?: string; reason?: string }> {
  const db = getDB()
  if (db.users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
    return { ok: false, reason: 'Email already registered.' }
  }
  const userId = uid('user')
  db.users.push({
    id: userId,
    email: data.email,
    password: data.password,
    full_name: data.full_name,
    roles: data.roles ?? ['employee'],
    client_company: data.client_company,
  })
  db.employee_configs.push({
    user_id: userId,
    office_lat: null, office_lng: null, office_radius_m: 200,
    home_lat: null, home_lng: null, home_radius_m: 300,
    weekly_schedule: data.weekly_schedule ?? { mon: 'WFO', tue: 'WFO', wed: 'WFH', thu: 'WFO', fri: 'WFH', sat: 'OFF', sun: 'OFF' },
  })
  const year = new Date().getFullYear()
  const defaults = [
    { id: 'lt-cl', total: 12 },
    { id: 'lt-sl', total: 12 },
    { id: 'lt-pl', total: 18 },
    { id: 'lt-lop', total: 0 },
  ]
  for (const lt of defaults) {
    db.leave_balances.push({
      id: uid('lb'),
      user_id: userId,
      leave_type_id: lt.id,
      year,
      total_days: lt.total,
      used_days: 0,
      pending_days: 0,
    })
  }
  return { ok: true, user_id: userId }
}

export async function updateEmployeeConfig(
  userId: string,
  updates: Partial<Omit<EmployeeConfig, 'user_id'>>,
): Promise<void> {
  const db = getDB()
  const idx = db.employee_configs.findIndex((c) => c.user_id === userId)
  if (idx === -1) {
    db.employee_configs.push({ user_id: userId, office_lat: null, office_lng: null, office_radius_m: 150, home_lat: null, home_lng: null, home_radius_m: 200, weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFO', fri: 'WFO', sat: 'OFF', sun: 'OFF' }, ...updates })
  } else {
    db.employee_configs[idx] = { ...db.employee_configs[idx], ...updates }
  }
}
