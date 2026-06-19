import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { AttendanceEvent } from '../models/AttendanceEvent.js'
import { Device } from '../models/Device.js'
import { EmployeeConfig } from '../models/EmployeeConfig.js'
import { AuditEvent } from '../models/AuditEvent.js'
import { LeaveRequest } from '../models/LeaveRequest.js'
import { LeaveType } from '../models/LeaveType.js'
import { getCompanyConfigDoc } from '../models/CompanyConfig.js'
import { evaluateGeofence, haversineMeters } from '../lib/geo.js'
import { serialize } from '../lib/serialize.js'
import { isAdminRoles } from '../lib/auth.js'

export const attendanceRouter = Router()
attendanceRouter.use(requireAuth)

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// Maps an AttendanceEvent doc to the client AttendanceEvent shape.
function serializeEvent(e: any) {
  return {
    id: e._id.toString(),
    user_id: e.user_id.toString(),
    device_fingerprint: e.device_fingerprint ?? null,
    event_type: e.event_type,
    ts_utc: new Date(e.ts_utc).toISOString(),
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    accuracy_m: e.accuracy_m ?? null,
    geofence_status: e.geofence_status ?? null,
    mock_flag: !!e.mock_flag,
    selfie_path: e.selfie_path ?? null,
    anomaly_flags: (e.anomaly_flags ?? []) as string[],
  }
}

// ── Submit punch ─────────────────────────────────────────────────────────────
const punchSchema = z.object({
  event_type: z.enum(['punch_in', 'punch_out']),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracy_m: z.number().nullable(),
  fingerprint: z.string(),
  mock_flag: z.boolean().default(false),
  client_anomalies: z.array(z.string()).default([]),
})

attendanceRouter.post(
  '/punch',
  asyncHandler(async (req, res) => {
    const data = punchSchema.parse(req.body)
    const userId = req.auth!.userId
    const anomalies: string[] = [...data.client_anomalies]

    // 1. Device check — auto-approve if not registered
    const device = await Device.findOne({ user_id: userId, fingerprint: data.fingerprint })
    if (!device) {
      await Device.create({
        user_id: userId,
        fingerprint: data.fingerprint,
        label: 'Auto-approved',
        status: 'approved',
        approved_at: new Date(),
      })
    }

    // 2. Mock location block
    if (data.mock_flag) {
      anomalies.push('mock_location_suspected')
      await AuditEvent.create({
        actor_id: userId,
        action: 'punch_blocked_mock_location',
        target: 'attendance',
        payload: { lat: data.lat, lng: data.lng, fingerprint: data.fingerprint },
      })
      return res.json({ ok: false, reason: 'Mock/simulated location detected. Punch blocked.' })
    }

    // 3. GPS accuracy flag
    if (data.accuracy_m !== null && data.accuracy_m > 100) anomalies.push('low_gps_accuracy')

    // 4. Employee config + schedule
    const cfg = await EmployeeConfig.findOne({ user_id: userId })
    if (!cfg) return res.json({ ok: false, reason: 'No schedule configured. Contact HR.' })

    const dayKey = DAY_KEYS[new Date().getDay()]
    const schedule = (cfg.weekly_schedule ?? {}) as Record<string, string>
    const scheduleType = schedule[dayKey] ?? 'WFO'
    if (scheduleType === 'OFF') return res.json({ ok: false, reason: 'Today is a non-working day.' })

    // 5. Geofence
    const companyCfg = await getCompanyConfigDoc()
    let geofenceStatus = 'no_config'
    let warning: string | undefined

    if (data.lat !== null && data.lng !== null) {
      // Resolve the office to measure against: the employee's own office
      // (different clients/sites have different locations) takes precedence,
      // falling back to the shared company office only when none is set.
      const hasEmpOffice = cfg.office_lat != null && cfg.office_lng != null
      const officeLat = hasEmpOffice ? cfg.office_lat! : (companyCfg.office_lat ?? null)
      const officeLng = hasEmpOffice ? cfg.office_lng! : (companyCfg.office_lng ?? null)
      const officeRadius = hasEmpOffice ? cfg.office_radius_m : (companyCfg.office_radius_m ?? 1000)

      // Home zones are no longer used: WFO checks the office radius (≈1km),
      // WFH checks distance-from-office (≤50km) below.
      const geo = evaluateGeofence(data.lat, data.lng, {
        office_lat: officeLat,
        office_lng: officeLng,
        office_radius_m: officeRadius,
        home_lat: null,
        home_lng: null,
        home_radius_m: 0,
      })
      geofenceStatus = geo.status

      if (scheduleType === 'WFO' && geo.status !== 'inside_office' && geo.status !== 'no_config') {
        const dist = geo.status === 'outside' ? Math.round(geo.nearest_m) : 0
        anomalies.push('geofence_outside_on_wfo')
        warning = `WFO location flagged: ${dist}m from office zone. Punch recorded and flagged for HR review.`
      }

      if (scheduleType === 'WFH' && officeLat != null && officeLng != null) {
        const distKm = haversineMeters(data.lat, data.lng, officeLat, officeLng) / 1000
        if (distKm > 50) {
          anomalies.push('wfh_outside_city_range')
          warning = `WFH flagged: ${Math.round(distKm)}km from office — expected within 50km.`
        }
      }

      if (scheduleType === 'FLEX' && geo.status === 'outside') {
        anomalies.push('geofence_outside_on_flex')
        warning = 'Punched from outside both office and home zones — flagged for HR review.'
      }
    }

    if (data.accuracy_m !== null && data.accuracy_m > 100) {
      const msg = `Low GPS accuracy (±${Math.round(data.accuracy_m)}m) — flagged.`
      warning = warning ? `${msg} ${warning}` : msg
    }

    // 6. Consecutive punch guard
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const lastEvent = await AttendanceEvent.findOne({ user_id: userId, ts_utc: { $gte: todayStart } }).sort({ ts_utc: -1 })
    if (lastEvent?.event_type === data.event_type) {
      return res.json({ ok: false, reason: data.event_type === 'punch_in' ? 'Already punched in.' : 'Already punched out.' })
    }

    // 7. Insert event
    const inserted = await AttendanceEvent.create({
      user_id: userId,
      device_fingerprint: data.fingerprint,
      event_type: data.event_type,
      ts_utc: new Date(),
      lat: data.lat,
      lng: data.lng,
      accuracy_m: data.accuracy_m,
      geofence_status: geofenceStatus,
      ip_address: req.ip ?? null,
      mock_flag: data.mock_flag,
      anomaly_flags: anomalies,
    })

    res.json({
      ok: true,
      event: serializeEvent(inserted),
      geofence: geofenceStatus,
      schedule_type: scheduleType,
      warning,
    })
  }),
)

// ── Today's events ───────────────────────────────────────────────────────────
attendanceRouter.get(
  '/punch/today',
  asyncHandler(async (req, res) => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const events = await AttendanceEvent.find({ user_id: req.auth!.userId, ts_utc: { $gte: start } }).sort({ ts_utc: 1 })
    res.json(events.map(serializeEvent))
  }),
)

// ── History ──────────────────────────────────────────────────────────────────
attendanceRouter.get(
  '/attendance/history',
  asyncHandler(async (req, res) => {
    const events = await AttendanceEvent.find({ user_id: req.auth!.userId }).sort({ ts_utc: -1 }).limit(100)
    res.json(events.map(serializeEvent))
  }),
)

// ── Stats ────────────────────────────────────────────────────────────────────
attendanceRouter.get(
  '/attendance/stats',
  asyncHandler(async (req, res) => {
    const events = await AttendanceEvent.find({ user_id: req.auth!.userId, event_type: 'punch_in' }).sort({ ts_utc: 1 }).select('ts_utc')

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const byDate = new Map<string, Date[]>()
    for (const e of events) {
      const d = new Date(e.ts_utc)
      const key = d.toISOString().slice(0, 10)
      if (!byDate.has(key)) byDate.set(key, [])
      byDate.get(key)!.push(d)
    }

    let streak = 0
    const today = now.toISOString().slice(0, 10)
    const check = new Date(now)
    check.setHours(0, 0, 0, 0)
    while (streak < 365) {
      const key = check.toISOString().slice(0, 10)
      const isWeekend = check.getDay() === 0 || check.getDay() === 6
      if (isWeekend) {
        check.setDate(check.getDate() - 1)
        continue
      }
      if (byDate.has(key)) {
        streak++
        check.setDate(check.getDate() - 1)
      } else if (key === today) {
        check.setDate(check.getDate() - 1)
      } else break
    }

    let lateThisMonth = 0
    const presentThisDates = new Set<string>()
    for (const e of events) {
      const d = new Date(e.ts_utc)
      if (d < monthStart) continue
      presentThisDates.add(d.toISOString().slice(0, 10))
      if (d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() >= 30)) lateThisMonth++
    }

    res.json({ streak, lateThisMonth, presentThisMonth: presentThisDates.size, totalPunchesAllTime: events.length })
  }),
)

// ── Month attendance (self or, for admins, any user) ─────────────────────────
attendanceRouter.get(
  '/attendance/month',
  asyncHandler(async (req, res) => {
    // Non-admins may only read their own month; admins may pass any userId.
    const userId = isAdminRoles(req.auth!.roles)
      ? String(req.query.userId ?? req.auth!.userId)
      : req.auth!.userId
    const year = Number(req.query.year)
    const month = Number(req.query.month)

    const cfg = await EmployeeConfig.findOne({ user_id: userId })
    const companyCfg = await getCompanyConfigDoc()
    const shiftStr = companyCfg.shift_start ?? '09:30'
    const [shiftH, shiftM] = shiftStr.split(':').map(Number)
    const lateAfterMin = companyCfg.late_threshold_min ?? 0

    const daysInMonth = new Date(year, month, 0).getDate()
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month - 1, daysInMonth, 23, 59, 59, 999)

    const events = await AttendanceEvent.find({
      user_id: userId,
      ts_utc: { $gte: monthStart, $lte: monthEnd },
    }).sort({ ts_utc: 1 })

    const leaves = await LeaveRequest.find({ user_id: userId, status: 'approved' }).populate('leave_type_id', 'code')

    const schedule = (cfg?.weekly_schedule ?? {}) as Record<string, string>
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const records: any[] = []

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d)
      if (date > new Date()) break
      const dateStr = date.toISOString().slice(0, 10)
      const dayKey = dayKeys[date.getDay()]
      const scheduleType = schedule[dayKey] ?? 'WFO'

      if (scheduleType === 'OFF') {
        records.push({ date: dateStr, status: 'non_working', schedule_type: scheduleType, first_in: null, last_out: null, work_minutes: 0, sessions: [], anomalies: [], leave_type: null, is_late: false })
        continue
      }

      const leave = leaves.find((l) => l.from_date <= dateStr && l.to_date >= dateStr)
      if (leave) {
        const lt: any = leave.leave_type_id
        records.push({ date: dateStr, status: 'on_leave', schedule_type: scheduleType, first_in: null, last_out: null, work_minutes: 0, sessions: [], anomalies: [], leave_type: lt?.code ?? 'L', is_late: false })
        continue
      }

      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date)
      dayEnd.setHours(23, 59, 59, 999)
      const dayEvents = events.filter((e) => {
        const t = new Date(e.ts_utc)
        return t >= dayStart && t <= dayEnd
      })

      if (dayEvents.length === 0) {
        records.push({ date: dateStr, status: 'absent', schedule_type: scheduleType, first_in: null, last_out: null, work_minutes: 0, sessions: [], anomalies: [], leave_type: null, is_late: false })
        continue
      }

      const firstIn = dayEvents.find((e) => e.event_type === 'punch_in')
      const lastOut = [...dayEvents].reverse().find((e) => e.event_type === 'punch_out')
      const isPunchedIn = firstIn && (!lastOut || new Date(firstIn.ts_utc) > new Date(lastOut.ts_utc))

      const sessions: any[] = []
      let remaining = [...dayEvents]
      let workMinutes = 0
      while (remaining.length > 0) {
        const inEv = remaining.find((e) => e.event_type === 'punch_in')
        if (!inEv) break
        const outEv = remaining.find((e) => e.event_type === 'punch_out' && new Date(e.ts_utc) > new Date(inEv.ts_utc))
        const dur = outEv ? (new Date(outEv.ts_utc).getTime() - new Date(inEv.ts_utc).getTime()) / 60000 : 0
        workMinutes += dur
        sessions.push({ in: new Date(inEv.ts_utc).toISOString(), out: outEv ? new Date(outEv.ts_utc).toISOString() : null, duration_m: Math.round(dur) })
        remaining = remaining.filter((e) => e.id !== inEv.id && (outEv ? e.id !== outEv.id : true))
        if (!outEv) break
      }

      const shiftMs = (shiftH * 60 + shiftM + lateAfterMin) * 60000
      const midnight = new Date(date)
      midnight.setHours(0, 0, 0, 0)
      const isLate = firstIn ? new Date(firstIn.ts_utc).getTime() - midnight.getTime() > shiftMs : false
      const anomalies = [...new Set(dayEvents.flatMap((e) => (e.anomaly_flags ?? []) as string[]))]

      records.push({
        date: dateStr,
        status: isPunchedIn ? 'present' : 'clocked_out',
        schedule_type: scheduleType,
        first_in: firstIn ? new Date(firstIn.ts_utc).toISOString() : null,
        last_out: lastOut ? new Date(lastOut.ts_utc).toISOString() : null,
        work_minutes: Math.round(workMinutes),
        sessions,
        anomalies,
        leave_type: null,
        is_late: isLate,
      })
    }

    res.json(records)
  }),
)

// ── Device status (self) — auto-approves ─────────────────────────────────────
attendanceRouter.post(
  '/devices/status',
  asyncHandler(async (req, res) => {
    const fingerprint = String(req.body?.fingerprint ?? '')
    const userId = req.auth!.userId
    const approved = await Device.findOne({ user_id: userId, fingerprint, status: 'approved' })
    if (approved) return res.json({ kind: 'approved' })
    await Device.updateOne(
      { user_id: userId, fingerprint },
      { $set: { status: 'approved', label: 'Auto-approved', approved_at: new Date() }, $setOnInsert: { user_id: userId, fingerprint } },
      { upsert: true },
    )
    res.json({ kind: 'approved' })
  }),
)

// ── Employee config (self) ───────────────────────────────────────────────────
attendanceRouter.get(
  '/employee-config',
  asyncHandler(async (req, res) => {
    const cfg = await EmployeeConfig.findOne({ user_id: req.auth!.userId })
    if (!cfg) return res.json(null)
    const s = serialize(cfg)
    res.json({ ...s, user_id: cfg.user_id.toString(), weekly_schedule: cfg.weekly_schedule })
  }),
)

// ── Company config (any authenticated user can read) ─────────────────────────
attendanceRouter.get(
  '/company-config',
  asyncHandler(async (_req, res) => {
    const cfg = await getCompanyConfigDoc()
    res.json({ ...serialize(cfg) })
  }),
)

// ── Expand a (possibly shortened) map URL by following redirects ──────────────
// Used by HR when pasting a Google Maps short link to extract coordinates.
attendanceRouter.get(
  '/util/expand-url',
  asyncHandler(async (req, res) => {
    const url = String(req.query.url ?? '')
    if (!url) return res.json({ finalUrl: null })
    try {
      const r = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; J2WAttendance/1.0)' },
      })
      res.json({ finalUrl: r.url })
    } catch {
      res.json({ finalUrl: null })
    }
  }),
)
