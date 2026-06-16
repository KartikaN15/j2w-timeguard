// Demo in-memory database — no Supabase required.
// Seeded fresh on every page load. Mutations persist within the same JS module lifetime.

export type Role = 'super_admin' | 'hr_admin' | 'account_manager' | 'reporting_manager' | 'employee'

export type DemoUser = {
  id: string
  email: string
  password: string
  full_name: string
  roles: Role[]
  client_company: string
}

export type EmployeeConfig = {
  user_id: string
  office_lat: number | null
  office_lng: number | null
  office_radius_m: number
  home_lat: number | null
  home_lng: number | null
  home_radius_m: number
  weekly_schedule: Record<string, 'WFO' | 'WFH' | 'OFF' | 'FLEX'>
}

export type Device = {
  id: string
  user_id: string
  fingerprint: string
  label: string | null
  user_agent: string | null
  approved_at: string
  approved_by: string | null
  created_at: string
}

export type PendingDevice = {
  id: string
  user_id: string
  fingerprint: string
  user_agent: string | null
  requested_at: string
}

export type AttendanceEvent = {
  id: string
  user_id: string
  device_fingerprint: string | null
  event_type: 'punch_in' | 'punch_out'
  ts_utc: string
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  geofence_status: 'inside_office' | 'inside_home' | 'outside' | 'no_config' | null
  mock_flag: boolean
  selfie_path: string | null
  anomaly_flags: string[]
}

export type LeaveType = {
  id: string
  name: string
  code: string
  is_paid: boolean
  days_per_year: number
  carry_forward_max: number
  sort_order: number
}

export type LeaveBalance = {
  id: string
  user_id: string
  leave_type_id: string
  year: number
  total_days: number
  used_days: number
  pending_days: number
}

export type LeaveRequest = {
  id: string
  user_id: string
  leave_type_id: string
  from_date: string
  to_date: string
  day_type: 'full' | 'first_half' | 'second_half'
  total_days: number
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export type CompanyConfig = {
  id: string
  company_name: string
  office_name: string
  office_lat: number | null
  office_lng: number | null
  office_radius_m: number
  standard_shift_hours: number  // e.g. 9
  late_threshold_min: number    // minutes after shift start to count as late (e.g. 30 = 9:30 AM)
  shift_start: string           // "09:30"
  shift_end: string             // "18:30"
}

export type AuditEvent = {
  id: string
  actor_id: string
  action: string
  target: string | null
  payload: Record<string, unknown>
  ts: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let _uid = 0
export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now()}-${++_uid}`
}

function daysAgo(n: number, hour = 9, min = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}

function dateStr(daysOffset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return d.toISOString().split('T')[0]
}

// ── Seed Data ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'user-admin'
const HRBP_ID = 'user-hrbp'
const ARJUN_ID = 'user-arjun'
const PRIYA_ID = 'user-priya'
const RAVI_ID = 'user-ravi'
const JOHN_ID = 'user-john'

const LEAVE_TYPE_IDS = { CL: 'lt-cl', SL: 'lt-sl', PL: 'lt-pl', LOP: 'lt-lop' }

function buildSeedData() {
  const company_configs: CompanyConfig[] = [
    {
      id: 'cc-j2w',
      company_name: 'J2W Business Solutions',
      office_name: 'J2W Head Office – Bangalore',
      office_lat: null,   // HR must set this via Admin → Employees → Setup GPS
      office_lng: null,
      office_radius_m: 2000,
      standard_shift_hours: 9,
      late_threshold_min: 30,
      shift_start: '09:30',
      shift_end: '18:30',
    },
  ]

  const users: DemoUser[] = [
    {
      id: ADMIN_ID,
      email: 'admin@j2w.in',
      password: 'demo@123',
      full_name: 'Vikram Nair (Super Admin)',
      roles: ['super_admin', 'hr_admin', 'employee'],
      client_company: 'J2W Business Solutions',
    },
    {
      id: HRBP_ID,
      email: 'hrbp@joulestowatts.com',
      password: 'demo@123',
      full_name: 'Preethi Sharma (HRBP)',
      roles: ['hr_admin', 'employee'],
      client_company: 'J2W Business Solutions',
    },
    {
      id: ARJUN_ID,
      email: 'arjun.mehta@ge.com',
      password: 'demo@123',
      full_name: 'Arjun Mehta',
      roles: ['employee'],
      client_company: 'GE Healthcare',
    },
    {
      id: PRIYA_ID,
      email: 'priya.nair@ge.com',
      password: 'demo@123',
      full_name: 'Priya Nair',
      roles: ['employee'],
      client_company: 'GE Healthcare',
    },
    {
      id: RAVI_ID,
      email: 'ravi.kumar@tcs.com',
      password: 'demo@123',
      full_name: 'Ravi Kumar',
      roles: ['employee'],
      client_company: 'TCS',
    },
    {
      id: JOHN_ID,
      email: 'john@joulestowatts.com',
      password: 'demo@123',
      full_name: 'John Mathew',
      roles: ['employee'],
      client_company: 'J2W Business Solutions',
    },
  ]

  const employee_configs: EmployeeConfig[] = [
    {
      user_id: ADMIN_ID,
      office_lat: null, office_lng: null, office_radius_m: 200,
      home_lat: null, home_lng: null, home_radius_m: 300,
      weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFH', thu: 'WFO', fri: 'WFH', sat: 'OFF', sun: 'OFF' },
    },
    {
      user_id: HRBP_ID,
      office_lat: null, office_lng: null, office_radius_m: 200,
      home_lat: null, home_lng: null, home_radius_m: 300,
      weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFO', fri: 'WFO', sat: 'OFF', sun: 'OFF' },
    },
    {
      user_id: ARJUN_ID,
      office_lat: null, office_lng: null, office_radius_m: 200,
      home_lat: 12.9082, home_lng: 77.6476, home_radius_m: 300,
      weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFH', thu: 'WFH', fri: 'WFO', sat: 'OFF', sun: 'OFF' },
    },
    {
      user_id: PRIYA_ID,
      office_lat: null, office_lng: null, office_radius_m: 200,
      home_lat: 13.0358, home_lng: 77.5970, home_radius_m: 300,
      weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFH', fri: 'WFH', sat: 'OFF', sun: 'OFF' },
    },
    {
      user_id: RAVI_ID,
      office_lat: null, office_lng: null, office_radius_m: 150,
      home_lat: null, home_lng: null, home_radius_m: 200,
      weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFO', fri: 'WFO', sat: 'OFF', sun: 'OFF' },
    },
    {
      user_id: JOHN_ID,
      office_lat: null, office_lng: null, office_radius_m: 2000,
      home_lat: null, home_lng: null, home_radius_m: 300,
      weekly_schedule: { mon: 'WFO', tue: 'WFO', wed: 'WFH', thu: 'WFO', fri: 'WFH', sat: 'OFF', sun: 'OFF' },
    },
  ]

  const devices: Device[] = [
    {
      id: 'dev-arjun-1', user_id: ARJUN_ID, fingerprint: 'fp-arjun-001',
      label: 'Work Laptop', user_agent: 'Chrome 124 / Windows 11',
      approved_at: daysAgo(30), approved_by: ADMIN_ID, created_at: daysAgo(30),
    },
    {
      id: 'dev-priya-1', user_id: PRIYA_ID, fingerprint: 'fp-priya-001',
      label: 'MacBook Pro', user_agent: 'Chrome 124 / macOS 14',
      approved_at: daysAgo(20), approved_by: ADMIN_ID, created_at: daysAgo(20),
    },
    {
      id: 'dev-ravi-1', user_id: RAVI_ID, fingerprint: 'fp-ravi-001',
      label: 'Dell Laptop', user_agent: 'Firefox 126 / Windows 11',
      approved_at: daysAgo(15), approved_by: ADMIN_ID, created_at: daysAgo(15),
    },
  ]

  const pending_devices: PendingDevice[] = [
    {
      id: 'pd-arjun-2', user_id: ARJUN_ID, fingerprint: 'fp-arjun-002',
      user_agent: 'Chrome 124 / Android 14 (Pixel 8)', requested_at: daysAgo(1),
    },
    {
      id: 'pd-ravi-2', user_id: RAVI_ID, fingerprint: 'fp-ravi-002',
      user_agent: 'Safari 17 / iPhone 15', requested_at: daysAgo(0, 8, 30),
    },
  ]

  // Seed attendance events for the last 5 days
  const attendance_events: AttendanceEvent[] = [
    // Today — 2 employees punched in, none out yet
    { id: uid('ae'), user_id: ARJUN_ID, device_fingerprint: 'fp-arjun-001', event_type: 'punch_in', ts_utc: daysAgo(0, 9, 12), lat: 12.9716, lng: 77.5946, accuracy_m: 8, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },
    { id: uid('ae'), user_id: PRIYA_ID, device_fingerprint: 'fp-priya-001', event_type: 'punch_in', ts_utc: daysAgo(0, 9, 47), lat: 12.9716, lng: 77.5946, accuracy_m: 12, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },

    // Yesterday — all 3 punched in & out
    { id: uid('ae'), user_id: ARJUN_ID, device_fingerprint: 'fp-arjun-001', event_type: 'punch_in', ts_utc: daysAgo(1, 9, 5), lat: 12.9716, lng: 77.5946, accuracy_m: 10, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },
    { id: uid('ae'), user_id: ARJUN_ID, device_fingerprint: 'fp-arjun-001', event_type: 'punch_out', ts_utc: daysAgo(1, 18, 22), lat: 12.9716, lng: 77.5946, accuracy_m: 10, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },
    { id: uid('ae'), user_id: PRIYA_ID, device_fingerprint: 'fp-priya-001', event_type: 'punch_in', ts_utc: daysAgo(1, 9, 55), lat: 12.9716, lng: 77.5946, accuracy_m: 14, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },
    { id: uid('ae'), user_id: PRIYA_ID, device_fingerprint: 'fp-priya-001', event_type: 'punch_out', ts_utc: daysAgo(1, 17, 48), lat: 12.9716, lng: 77.5946, accuracy_m: 14, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },
    { id: uid('ae'), user_id: RAVI_ID, device_fingerprint: 'fp-ravi-001', event_type: 'punch_in', ts_utc: daysAgo(1, 8, 58), lat: null, lng: null, accuracy_m: null, geofence_status: 'no_config', mock_flag: false, selfie_path: null, anomaly_flags: [] },
    { id: uid('ae'), user_id: RAVI_ID, device_fingerprint: 'fp-ravi-001', event_type: 'punch_out', ts_utc: daysAgo(1, 18, 0), lat: null, lng: null, accuracy_m: null, geofence_status: 'no_config', mock_flag: false, selfie_path: null, anomaly_flags: [] },

    // 2 days ago — WFH day anomaly: Arjun punched from outside home radius
    { id: uid('ae'), user_id: ARJUN_ID, device_fingerprint: 'fp-arjun-001', event_type: 'punch_in', ts_utc: daysAgo(2, 10, 34), lat: 13.2, lng: 77.7, accuracy_m: 18, geofence_status: 'outside', mock_flag: false, selfie_path: null, anomaly_flags: ['geofence_outside_on_wfh'] },
    { id: uid('ae'), user_id: ARJUN_ID, device_fingerprint: 'fp-arjun-001', event_type: 'punch_out', ts_utc: daysAgo(2, 17, 10), lat: 13.2, lng: 77.7, accuracy_m: 18, geofence_status: 'outside', mock_flag: false, selfie_path: null, anomaly_flags: ['geofence_outside_on_wfh'] },
    { id: uid('ae'), user_id: PRIYA_ID, device_fingerprint: 'fp-priya-001', event_type: 'punch_in', ts_utc: daysAgo(2, 9, 20), lat: 12.9716, lng: 77.5946, accuracy_m: 9, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },
    { id: uid('ae'), user_id: PRIYA_ID, device_fingerprint: 'fp-priya-001', event_type: 'punch_out', ts_utc: daysAgo(2, 18, 5), lat: 12.9716, lng: 77.5946, accuracy_m: 9, geofence_status: 'inside_office', mock_flag: false, selfie_path: null, anomaly_flags: [] },
  ]

  const leave_types: LeaveType[] = [
    { id: LEAVE_TYPE_IDS.CL, name: 'Casual Leave', code: 'CL', is_paid: true, days_per_year: 12, carry_forward_max: 0, sort_order: 1 },
    { id: LEAVE_TYPE_IDS.SL, name: 'Sick Leave', code: 'SL', is_paid: true, days_per_year: 12, carry_forward_max: 30, sort_order: 2 },
    { id: LEAVE_TYPE_IDS.PL, name: 'Privilege Leave', code: 'PL', is_paid: true, days_per_year: 18, carry_forward_max: 45, sort_order: 3 },
    { id: LEAVE_TYPE_IDS.LOP, name: 'Loss of Pay', code: 'LOP', is_paid: false, days_per_year: 0, carry_forward_max: 0, sort_order: 4 },
  ]

  const year = new Date().getFullYear()
  const leave_balances: LeaveBalance[] = [
    { id: uid('lb'), user_id: ARJUN_ID, leave_type_id: LEAVE_TYPE_IDS.CL, year, total_days: 12, used_days: 2, pending_days: 1 },
    { id: uid('lb'), user_id: ARJUN_ID, leave_type_id: LEAVE_TYPE_IDS.SL, year, total_days: 12, used_days: 1, pending_days: 0 },
    { id: uid('lb'), user_id: ARJUN_ID, leave_type_id: LEAVE_TYPE_IDS.PL, year, total_days: 18, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: PRIYA_ID, leave_type_id: LEAVE_TYPE_IDS.CL, year, total_days: 12, used_days: 4, pending_days: 2 },
    { id: uid('lb'), user_id: PRIYA_ID, leave_type_id: LEAVE_TYPE_IDS.SL, year, total_days: 12, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: PRIYA_ID, leave_type_id: LEAVE_TYPE_IDS.PL, year, total_days: 18, used_days: 5, pending_days: 0 },
    { id: uid('lb'), user_id: RAVI_ID, leave_type_id: LEAVE_TYPE_IDS.CL, year, total_days: 12, used_days: 3, pending_days: 0 },
    { id: uid('lb'), user_id: RAVI_ID, leave_type_id: LEAVE_TYPE_IDS.SL, year, total_days: 12, used_days: 2, pending_days: 1 },
    { id: uid('lb'), user_id: RAVI_ID, leave_type_id: LEAVE_TYPE_IDS.PL, year, total_days: 18, used_days: 3, pending_days: 0 },
    { id: uid('lb'), user_id: ADMIN_ID, leave_type_id: LEAVE_TYPE_IDS.CL, year, total_days: 12, used_days: 1, pending_days: 0 },
    { id: uid('lb'), user_id: ADMIN_ID, leave_type_id: LEAVE_TYPE_IDS.SL, year, total_days: 12, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: ADMIN_ID, leave_type_id: LEAVE_TYPE_IDS.PL, year, total_days: 18, used_days: 2, pending_days: 0 },
    { id: uid('lb'), user_id: HRBP_ID, leave_type_id: LEAVE_TYPE_IDS.CL, year, total_days: 12, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: HRBP_ID, leave_type_id: LEAVE_TYPE_IDS.SL, year, total_days: 12, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: HRBP_ID, leave_type_id: LEAVE_TYPE_IDS.PL, year, total_days: 18, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: JOHN_ID, leave_type_id: LEAVE_TYPE_IDS.CL, year, total_days: 12, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: JOHN_ID, leave_type_id: LEAVE_TYPE_IDS.SL, year, total_days: 12, used_days: 0, pending_days: 0 },
    { id: uid('lb'), user_id: JOHN_ID, leave_type_id: LEAVE_TYPE_IDS.PL, year, total_days: 18, used_days: 0, pending_days: 0 },
  ]

  const leave_requests: LeaveRequest[] = [
    // Arjun — 1 pending, 2 approved
    {
      id: uid('lr'), user_id: ARJUN_ID, leave_type_id: LEAVE_TYPE_IDS.SL,
      from_date: dateStr(3), to_date: dateStr(3), day_type: 'full', total_days: 1,
      reason: 'Feeling unwell, doctor visit', status: 'pending',
      reviewed_by: null, reviewed_at: null, rejection_reason: null,
      created_at: daysAgo(0, 8, 0), updated_at: daysAgo(0, 8, 0),
    },
    {
      id: uid('lr'), user_id: ARJUN_ID, leave_type_id: LEAVE_TYPE_IDS.CL,
      from_date: dateStr(-14), to_date: dateStr(-13), day_type: 'full', total_days: 2,
      reason: 'Personal work', status: 'approved',
      reviewed_by: ADMIN_ID, reviewed_at: daysAgo(16, 14, 0), rejection_reason: null,
      created_at: daysAgo(17, 10, 0), updated_at: daysAgo(16, 14, 0),
    },
    // Priya — 1 pending (2 days), 4 approved
    {
      id: uid('lr'), user_id: PRIYA_ID, leave_type_id: LEAVE_TYPE_IDS.CL,
      from_date: dateStr(5), to_date: dateStr(6), day_type: 'full', total_days: 2,
      reason: 'Family function', status: 'pending',
      reviewed_by: null, reviewed_at: null, rejection_reason: null,
      created_at: daysAgo(1, 16, 0), updated_at: daysAgo(1, 16, 0),
    },
    {
      id: uid('lr'), user_id: PRIYA_ID, leave_type_id: LEAVE_TYPE_IDS.CL,
      from_date: dateStr(-30), to_date: dateStr(-28), day_type: 'full', total_days: 3,
      reason: 'Travel', status: 'approved',
      reviewed_by: ADMIN_ID, reviewed_at: daysAgo(32, 10, 0), rejection_reason: null,
      created_at: daysAgo(35, 9, 0), updated_at: daysAgo(32, 10, 0),
    },
    {
      id: uid('lr'), user_id: PRIYA_ID, leave_type_id: LEAVE_TYPE_IDS.PL,
      from_date: dateStr(-60), to_date: dateStr(-56), day_type: 'full', total_days: 5,
      reason: 'Annual vacation', status: 'approved',
      reviewed_by: ADMIN_ID, reviewed_at: daysAgo(62, 11, 0), rejection_reason: null,
      created_at: daysAgo(65, 9, 0), updated_at: daysAgo(62, 11, 0),
    },
    // Ravi — 1 pending SL, 1 rejected CL
    {
      id: uid('lr'), user_id: RAVI_ID, leave_type_id: LEAVE_TYPE_IDS.SL,
      from_date: dateStr(1), to_date: dateStr(2), day_type: 'full', total_days: 2,
      reason: 'Fever and cold', status: 'pending',
      reviewed_by: null, reviewed_at: null, rejection_reason: null,
      created_at: daysAgo(0, 11, 0), updated_at: daysAgo(0, 11, 0),
    },
    {
      id: uid('lr'), user_id: RAVI_ID, leave_type_id: LEAVE_TYPE_IDS.CL,
      from_date: dateStr(-5), to_date: dateStr(-3), day_type: 'full', total_days: 3,
      reason: 'Extended weekend', status: 'rejected',
      reviewed_by: ADMIN_ID, reviewed_at: daysAgo(6, 15, 0),
      rejection_reason: 'Insufficient notice period. Please apply at least 3 days in advance.',
      created_at: daysAgo(7, 9, 0), updated_at: daysAgo(6, 15, 0),
    },
    // Ravi — approved CL (older)
    {
      id: uid('lr'), user_id: RAVI_ID, leave_type_id: LEAVE_TYPE_IDS.CL,
      from_date: dateStr(-45), to_date: dateStr(-43), day_type: 'full', total_days: 3,
      reason: 'Personal reason', status: 'approved',
      reviewed_by: ADMIN_ID, reviewed_at: daysAgo(47, 11, 0), rejection_reason: null,
      created_at: daysAgo(50, 9, 0), updated_at: daysAgo(47, 11, 0),
    },
  ]

  const audit_events: AuditEvent[] = []

  return {
    users,
    company_configs,
    employee_configs,
    devices,
    pending_devices,
    attendance_events,
    leave_types,
    leave_balances,
    leave_requests,
    audit_events,
    session_user_id: null as string | null,
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _db: ReturnType<typeof buildSeedData> | null = null

export function getDB() {
  if (!_db) _db = buildSeedData()
  return _db
}

export function resetDB() {
  _db = buildSeedData()
}
