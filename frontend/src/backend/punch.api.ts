import { getDB, uid, type AttendanceEvent } from './mock-db'
import { evaluateGeofence } from '../lib/geo'
import { getUserById } from './auth.api'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type PunchInput = {
  user_id: string
  event_type: 'punch_in' | 'punch_out'
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  fingerprint: string
  mock_flag?: boolean
  client_anomalies?: string[]
}

export type PunchResult =
  | { ok: true; event: AttendanceEvent; geofence: string; schedule_type: string; warning?: string }
  | { ok: false; reason: string }

export async function submitPunch(input: PunchInput): Promise<PunchResult> {
  const db = getDB()
  const anomalies: string[] = [...(input.client_anomalies ?? [])]

  // 1. Device must be approved
  const device = db.devices.find(
    (d) => d.user_id === input.user_id && d.fingerprint === input.fingerprint,
  )
  if (!device) {
    return { ok: false, reason: 'This device is not approved. Submit it for HR approval first.' }
  }

  // 2. Consecutive punch guard — no two punch_ins or punch_outs in a row
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const todayEventsForUser = db.attendance_events
    .filter((e) => e.user_id === input.user_id && new Date(e.ts_utc) >= dayStart)
    .sort((a, b) => new Date(a.ts_utc).getTime() - new Date(b.ts_utc).getTime())
  const lastEvent = todayEventsForUser[todayEventsForUser.length - 1]
  if (lastEvent && lastEvent.event_type === input.event_type) {
    if (input.event_type === 'punch_in') {
      return { ok: false, reason: 'You are already punched in. Please punch out first.' }
    } else {
      return { ok: false, reason: 'You are already punched out. Please punch in first.' }
    }
  }

  // 3. Mock location check
  if (input.mock_flag) {
    anomalies.push('mock_location_suspected')
    db.audit_events.push({
      id: uid('audit'),
      actor_id: input.user_id,
      action: 'punch_blocked_mock_location',
      target: 'attendance',
      payload: { lat: input.lat, lng: input.lng, fingerprint: input.fingerprint },
      ts: new Date().toISOString(),
    })
    return { ok: false, reason: 'Mock/simulated location detected. Punch blocked and flagged.' }
  }

  // 3. GPS accuracy gate
  // Production: hard-block if accuracy > 100m.
  // Demo mode: flag as anomaly + warn, but allow through so the demo works indoors.
  if (input.accuracy_m !== null && input.accuracy_m > 100) {
    anomalies.push('low_gps_accuracy')
  }

  // 4. Employee config & schedule
  const cfg = db.employee_configs.find((c) => c.user_id === input.user_id)
  if (!cfg) {
    return { ok: false, reason: 'No schedule configured. Contact HR.' }
  }

  const dayKey = DAY_KEYS[new Date().getDay()]
  const scheduleType = (cfg.weekly_schedule[dayKey] ?? 'WFO') as 'WFO' | 'WFH' | 'OFF' | 'FLEX'

  if (scheduleType === 'OFF') {
    return { ok: false, reason: 'Today is a non-working day per your schedule.' }
  }

  // 5. Geofence evaluation — office from company config, home from employee config
  const companyCfg = db.company_configs[0]
  let geofenceStatus: AttendanceEvent['geofence_status'] = 'no_config'
  let warning: string | undefined

  if (input.lat !== null && input.lng !== null) {
    const geo = evaluateGeofence(input.lat, input.lng, {
      office_lat: companyCfg?.office_lat ?? null,
      office_lng: companyCfg?.office_lng ?? null,
      office_radius_m: companyCfg?.office_radius_m ?? 200,
      home_lat: cfg.home_lat,
      home_lng: cfg.home_lng,
      home_radius_m: cfg.home_radius_m,
    })
    geofenceStatus = geo.status

    // Schedule-aware geofence enforcement
    if (scheduleType === 'WFO' && geo.status !== 'inside_office') {
      if (geo.status === 'no_config') {
        // Office not configured — punch through silently, HR dashboard will surface this
      } else {
        const nearestM = geo.status === 'outside' ? Math.round(geo.nearest_m) : 0
        anomalies.push('geofence_outside_on_wfo')
        // Flag and warn — don't hard-block (GPS drift in urban areas can push legitimate punches outside the radius)
        warning = `WFO location flagged: ${nearestM}m from ${companyCfg?.office_name ?? 'office'} zone. Punch recorded and flagged for HR review.`
      }
    }

    if (scheduleType === 'WFH') {
      // WFH check: must be within 100km of office (city-level — prevents marking WFH from another city)
      if (companyCfg?.office_lat != null && companyCfg?.office_lng != null) {
        const { haversineMeters } = await import('../lib/geo')
        const distFromOffice = haversineMeters(input.lat!, input.lng!, companyCfg.office_lat, companyCfg.office_lng)
        if (distFromOffice > 100_000) {
          anomalies.push('wfh_outside_city_range')
          warning = `WFH flagged: you are ${Math.round(distFromOffice / 1000)}km from office — expected within 100km. Punch recorded but flagged for HR review.`
        }
      }
      // no_config on WFH = office not set yet, punch through silently
    }

    if (scheduleType === 'FLEX') {
      if (geo.status === 'outside') {
        anomalies.push('geofence_outside_on_flex')
        warning = 'Punched from outside both office and home zones — flagged for HR review.'
      }
    }
  } else {
    geofenceStatus = 'no_config'
    // No GPS available — punch through, anomaly flag is sufficient for HR to review
  }

  // Surface accuracy warning (after geofence so it can override)
  if (input.accuracy_m !== null && input.accuracy_m > 100) {
    const accMsg = `Low GPS accuracy (±${Math.round(input.accuracy_m)}m) — punch recorded but flagged. Move outdoors for better signal.`
    warning = warning ? `${accMsg} ${warning}` : accMsg
  }

  // 6. Insert append-only event
  const event: AttendanceEvent = {
    id: uid('ae'),
    user_id: input.user_id,
    device_fingerprint: input.fingerprint,
    event_type: input.event_type,
    ts_utc: new Date().toISOString(),
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracy_m,
    geofence_status: geofenceStatus,
    mock_flag: input.mock_flag ?? false,
    selfie_path: null,
    anomaly_flags: anomalies,
  }
  db.attendance_events.push(event)

  return { ok: true, event, geofence: geofenceStatus, schedule_type: scheduleType, warning }
}

export async function getTodayEvents(userId: string): Promise<AttendanceEvent[]> {
  const db = getDB()
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  return db.attendance_events
    .filter((e) => e.user_id === userId && new Date(e.ts_utc) >= dayStart)
    .sort((a, b) => new Date(a.ts_utc).getTime() - new Date(b.ts_utc).getTime())
}

export async function getHistory(userId: string, limit = 100): Promise<AttendanceEvent[]> {
  const db = getDB()
  return db.attendance_events
    .filter((e) => e.user_id === userId)
    .sort((a, b) => new Date(b.ts_utc).getTime() - new Date(a.ts_utc).getTime())
    .slice(0, limit)
}

export type AttendanceStats = {
  streak: number        // consecutive present days (today counted if punched in)
  lateThisMonth: number // punch-ins after 09:30 this month
  presentThisMonth: number
  totalPunchesAllTime: number
}

export async function getAttendanceStats(userId: string): Promise<AttendanceStats> {
  const db = getDB()
  const userEvents = db.attendance_events.filter((e) => e.user_id === userId && e.event_type === 'punch_in')
  const now = new Date()

  // Group punch-ins by calendar date string
  const byDate = new Map<string, Date[]>()
  for (const e of userEvents) {
    const d = new Date(e.ts_utc)
    const key = d.toISOString().slice(0, 10)
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(d)
  }

  // Streak: count backwards from today
  let streak = 0
  const today = now.toISOString().slice(0, 10)
  let checkDate = new Date(now)
  checkDate.setHours(0, 0, 0, 0)
  while (true) {
    const key = checkDate.toISOString().slice(0, 10)
    const isWeekend = checkDate.getDay() === 0 || checkDate.getDay() === 6
    if (isWeekend) { checkDate.setDate(checkDate.getDate() - 1); continue }
    if (byDate.has(key)) { streak++; checkDate.setDate(checkDate.getDate() - 1) }
    else if (key === today) { checkDate.setDate(checkDate.getDate() - 1) } // today not punched yet = don't break streak
    else break
    if (streak > 365) break // safety
  }

  // Late this month = punch-in after 09:30 in current calendar month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  let lateThisMonth = 0
  for (const e of userEvents) {
    const d = new Date(e.ts_utc)
    if (d < monthStart) continue
    if (d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() >= 30)) lateThisMonth++
  }

  // Present days this month = unique dates with a punch-in
  const presentThisMonth = new Set(
    userEvents
      .filter((e) => new Date(e.ts_utc) >= monthStart)
      .map((e) => new Date(e.ts_utc).toISOString().slice(0, 10))
  ).size

  return { streak, lateThisMonth, presentThisMonth, totalPunchesAllTime: userEvents.length }
}

// ── HR Dashboard ──────────────────────────────────────────────────────────────

export type EmployeeDayStatus = {
  user_id: string
  full_name: string
  email: string
  client_company: string
  status: 'present' | 'clocked_out' | 'on_leave' | 'absent' | 'non_working'
  first_in: string | null   // ISO
  last_out: string | null   // ISO
  work_minutes: number
  on_leave_type: string | null
  anomalies: string[]
}

export async function getDailyStatus(date?: Date): Promise<EmployeeDayStatus[]> {
  const db = getDB()
  const day = date ?? new Date()
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999)
  const dateStr = day.toISOString().slice(0, 10)
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
  const dayKey = DAY_KEYS[day.getDay()]

  return db.users.map((u) => {
    const cfg = db.employee_configs.find((c) => c.user_id === u.id)
    const scheduleType = (cfg?.weekly_schedule[dayKey] ?? 'WFO') as string

    if (scheduleType === 'OFF') {
      return { user_id: u.id, full_name: u.full_name, email: u.email, client_company: u.client_company, status: 'non_working', first_in: null, last_out: null, work_minutes: 0, on_leave_type: null, anomalies: [] }
    }

    // Check approved leave
    const leave = db.leave_requests.find(
      (r) => r.user_id === u.id && r.status === 'approved' && r.from_date <= dateStr && r.to_date >= dateStr,
    )
    if (leave) {
      const lt = db.leave_types.find((t) => t.id === leave.leave_type_id)
      return { user_id: u.id, full_name: u.full_name, email: u.email, client_company: u.client_company, status: 'on_leave', first_in: null, last_out: null, work_minutes: 0, on_leave_type: lt?.code ?? 'Leave', anomalies: [] }
    }

    // Attendance events for this day
    const events = db.attendance_events
      .filter((e) => e.user_id === u.id && new Date(e.ts_utc) >= dayStart && new Date(e.ts_utc) <= dayEnd)
      .sort((a, b) => new Date(a.ts_utc).getTime() - new Date(b.ts_utc).getTime())

    if (events.length === 0) {
      return { user_id: u.id, full_name: u.full_name, email: u.email, client_company: u.client_company, status: 'absent', first_in: null, last_out: null, work_minutes: 0, on_leave_type: null, anomalies: [] }
    }

    const firstIn = events.find((e) => e.event_type === 'punch_in')
    const lastOut = [...events].reverse().find((e) => e.event_type === 'punch_out')
    const isPunchedIn = firstIn && (!lastOut || new Date(firstIn.ts_utc) > new Date(lastOut.ts_utc))

    // Work minutes = sum of in/out pairs
    let workMinutes = 0
    let remaining = [...events]
    while (remaining.length >= 2) {
      const inEv = remaining.find((e) => e.event_type === 'punch_in')
      if (!inEv) break
      const outEv = remaining.find((e) => e.event_type === 'punch_out' && new Date(e.ts_utc) > new Date(inEv.ts_utc))
      if (!outEv) break
      workMinutes += (new Date(outEv.ts_utc).getTime() - new Date(inEv.ts_utc).getTime()) / 60000
      remaining = remaining.filter((e) => e.id !== inEv.id && e.id !== outEv.id)
    }

    const anomalies = [...new Set(events.flatMap((e) => e.anomaly_flags))]
    return {
      user_id: u.id, full_name: u.full_name, email: u.email, client_company: u.client_company,
      status: isPunchedIn ? 'present' : 'clocked_out',
      first_in: firstIn?.ts_utc ?? null,
      last_out: lastOut?.ts_utc ?? null,
      work_minutes: Math.round(workMinutes),
      on_leave_type: null,
      anomalies,
    }
  })
}

// ── Per-employee attendance history for calendar view ──────────────────────

export type DayRecord = {
  date: string  // YYYY-MM-DD
  status: 'present' | 'clocked_out' | 'on_leave' | 'absent' | 'non_working'
  schedule_type: string
  first_in: string | null
  last_out: string | null
  work_minutes: number
  sessions: { in: string; out: string | null; duration_m: number }[]
  anomalies: string[]
  leave_type: string | null
  is_late: boolean
}

export async function getMonthAttendance(userId: string, year: number, month: number): Promise<DayRecord[]> {
  const db = getDB()
  const cfg = db.employee_configs.find((c) => c.user_id === userId)
  const companyCfg = db.company_configs[0]
  const shiftStartStr = companyCfg?.shift_start ?? '09:30'
  const [shiftH, shiftM] = shiftStartStr.split(':').map(Number)
  const lateAfterMin = (companyCfg?.late_threshold_min ?? 30)
  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

  const daysInMonth = new Date(year, month, 0).getDate()
  const records: DayRecord[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (date > new Date()) break // don't show future days
    const dateStr = date.toISOString().slice(0, 10)
    const dayKey = DAY_KEYS[date.getDay()]
    const scheduleType = (cfg?.weekly_schedule[dayKey] ?? 'WFO') as string

    if (scheduleType === 'OFF') {
      records.push({ date: dateStr, status: 'non_working', schedule_type: scheduleType, first_in: null, last_out: null, work_minutes: 0, sessions: [], anomalies: [], leave_type: null, is_late: false })
      continue
    }

    const leave = db.leave_requests.find(
      (r) => r.user_id === userId && r.status === 'approved' && r.from_date <= dateStr && r.to_date >= dateStr,
    )
    if (leave) {
      const lt = db.leave_types.find((t) => t.id === leave.leave_type_id)
      records.push({ date: dateStr, status: 'on_leave', schedule_type: scheduleType, first_in: null, last_out: null, work_minutes: 0, sessions: [], anomalies: [], leave_type: lt?.code ?? 'L', is_late: false })
      continue
    }

    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)
    const events = db.attendance_events
      .filter((e) => e.user_id === userId && new Date(e.ts_utc) >= dayStart && new Date(e.ts_utc) <= dayEnd)
      .sort((a, b) => new Date(a.ts_utc).getTime() - new Date(b.ts_utc).getTime())

    if (events.length === 0) {
      records.push({ date: dateStr, status: 'absent', schedule_type: scheduleType, first_in: null, last_out: null, work_minutes: 0, sessions: [], anomalies: [], leave_type: null, is_late: false })
      continue
    }

    const firstIn = events.find((e) => e.event_type === 'punch_in')
    const lastOut = [...events].reverse().find((e) => e.event_type === 'punch_out')
    const isPunchedIn = firstIn && (!lastOut || new Date(firstIn.ts_utc) > new Date(lastOut.ts_utc))

    const sessions: DayRecord['sessions'] = []
    let remaining = [...events]
    let workMinutes = 0
    while (remaining.length > 0) {
      const inEv = remaining.find((e) => e.event_type === 'punch_in')
      if (!inEv) break
      const outEv = remaining.find((e) => e.event_type === 'punch_out' && new Date(e.ts_utc) > new Date(inEv.ts_utc))
      const dur = outEv ? (new Date(outEv.ts_utc).getTime() - new Date(inEv.ts_utc).getTime()) / 60000 : 0
      workMinutes += dur
      sessions.push({ in: inEv.ts_utc, out: outEv?.ts_utc ?? null, duration_m: Math.round(dur) })
      remaining = remaining.filter((e) => e.id !== inEv.id && (outEv ? e.id !== outEv.id : true))
      if (!outEv) break
    }

    const lateThresholdMs = ((shiftH * 60 + shiftM + lateAfterMin) * 60000)
    const dayMidnight = new Date(date); dayMidnight.setHours(0, 0, 0, 0)
    const isLate = firstIn ? (new Date(firstIn.ts_utc).getTime() - dayMidnight.getTime()) > lateThresholdMs : false

    records.push({
      date: dateStr,
      status: isPunchedIn ? 'present' : 'clocked_out',
      schedule_type: scheduleType,
      first_in: firstIn?.ts_utc ?? null,
      last_out: lastOut?.ts_utc ?? null,
      work_minutes: Math.round(workMinutes),
      sessions,
      anomalies: [...new Set(events.flatMap((e) => e.anomaly_flags))],
      leave_type: null,
      is_late: isLate,
    })
  }

  return records
}

export type LiveEventRow = AttendanceEvent & { employee_name: string; email: string }

export async function getAllTodayEvents(): Promise<LiveEventRow[]> {
  const db = getDB()
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  return db.attendance_events
    .filter((e) => new Date(e.ts_utc) >= dayStart)
    .sort((a, b) => new Date(b.ts_utc).getTime() - new Date(a.ts_utc).getTime())
    .map((e) => {
      const u = getUserById(e.user_id)
      return { ...e, employee_name: u?.user_metadata.full_name ?? '—', email: u?.email ?? '—' }
    })
}
