import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { hashPassword } from '../lib/auth.js'
import { User } from '../models/User.js'
import { EmployeeConfig } from '../models/EmployeeConfig.js'
import { Device } from '../models/Device.js'
import { AttendanceEvent } from '../models/AttendanceEvent.js'
import { AuditEvent } from '../models/AuditEvent.js'
import { LeaveRequest } from '../models/LeaveRequest.js'
import { LeaveBalance } from '../models/LeaveBalance.js'
import { getCompanyConfigDoc } from '../models/CompanyConfig.js'
import { provisionNewUser } from '../lib/seedUser.js'
import { serialize } from '../lib/serialize.js'

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function configToClient(cfg: any) {
  if (!cfg) return null
  return {
    user_id: cfg.user_id.toString(),
    office_lat: cfg.office_lat ?? null,
    office_lng: cfg.office_lng ?? null,
    office_radius_m: cfg.office_radius_m,
    home_lat: cfg.home_lat ?? null,
    home_lng: cfg.home_lng ?? null,
    home_radius_m: cfg.home_radius_m,
    weekly_schedule: cfg.weekly_schedule ?? {},
  }
}

// ── Daily status (live dashboard) ────────────────────────────────────────────
adminRouter.get(
  '/daily-status',
  asyncHandler(async (_req, res) => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const dateStr = todayStart.toISOString().slice(0, 10)

    const employees = await User.find({ roles: 'employee' })
    const events = await AttendanceEvent.find({ ts_utc: { $gte: todayStart } }).sort({ ts_utc: 1 })
    const leaves = await LeaveRequest.find({
      status: 'approved',
      from_date: { $lte: dateStr },
      to_date: { $gte: dateStr },
    }).populate('leave_type_id', 'code')
    const configs = await EmployeeConfig.find()

    const dayKey = DAY_KEYS[new Date().getDay()]

    const results = employees.map((emp) => {
      const empId = emp._id.toString()
      const cfg = configs.find((c) => c.user_id.toString() === empId)
      const schedule = (cfg?.weekly_schedule ?? {}) as Record<string, string>
      const scheduleType = schedule[dayKey] ?? 'WFO'
      const base = {
        user_id: empId,
        full_name: emp.full_name ?? emp.email ?? '',
        email: emp.email ?? '',
        client_company: emp.client_company ?? 'J2W',
      }

      if (scheduleType === 'OFF') {
        return { ...base, status: 'non_working' as const, first_in: null, last_out: null, work_minutes: 0, on_leave_type: null, anomalies: [] }
      }

      const leave = leaves.find((l) => l.user_id.toString() === empId)
      if (leave) {
        const lt: any = leave.leave_type_id
        return { ...base, status: 'on_leave' as const, first_in: null, last_out: null, work_minutes: 0, on_leave_type: lt?.code ?? 'Leave', anomalies: [] }
      }

      const empEvents = events.filter((e) => e.user_id.toString() === empId)
      if (empEvents.length === 0) {
        return { ...base, status: 'absent' as const, first_in: null, last_out: null, work_minutes: 0, on_leave_type: null, anomalies: [] }
      }

      const firstIn = empEvents.find((e) => e.event_type === 'punch_in')
      const lastOut = [...empEvents].reverse().find((e) => e.event_type === 'punch_out')
      const isPunchedIn = firstIn && (!lastOut || new Date(firstIn.ts_utc) > new Date(lastOut.ts_utc))

      let workMinutes = 0
      let remaining = [...empEvents]
      while (remaining.length >= 2) {
        const inEv = remaining.find((e) => e.event_type === 'punch_in')
        if (!inEv) break
        const outEv = remaining.find((e) => e.event_type === 'punch_out' && new Date(e.ts_utc) > new Date(inEv.ts_utc))
        if (!outEv) break
        workMinutes += (new Date(outEv.ts_utc).getTime() - new Date(inEv.ts_utc).getTime()) / 60000
        remaining = remaining.filter((e) => e.id !== inEv.id && e.id !== outEv.id)
      }

      const anomalies = [...new Set(empEvents.flatMap((e) => (e.anomaly_flags ?? []) as string[]))]

      return {
        ...base,
        status: (isPunchedIn ? 'present' : 'clocked_out') as 'present' | 'clocked_out',
        first_in: firstIn ? new Date(firstIn.ts_utc).toISOString() : null,
        last_out: lastOut ? new Date(lastOut.ts_utc).toISOString() : null,
        work_minutes: Math.round(workMinutes),
        on_leave_type: null,
        anomalies,
      }
    })

    res.json(results)
  }),
)

// ── Attendance trend (last N days: on-time vs late) ──────────────────────────
adminRouter.get(
  '/attendance-trend',
  asyncHandler(async (req, res) => {
    const days = Math.min(31, Math.max(1, Number(req.query.days ?? 10)))
    const company = await getCompanyConfigDoc()
    const [shiftH, shiftM] = (company.shift_start ?? '09:30').split(':').map(Number)
    const lateAfterMin = company.late_threshold_min ?? 0
    const cutoffMins = shiftH * 60 + shiftM + lateAfterMin

    // Local-date key (YYYY-MM-DD) so "today" is the server's local day, not UTC.
    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    start.setHours(0, 0, 0, 0)

    const events = await AttendanceEvent.find({
      event_type: 'punch_in',
      ts_utc: { $gte: start },
    }).sort({ ts_utc: 1 })

    // earliest punch_in per (user, local date)
    const firstByUserDay = new Map<string, Date>()
    for (const e of events) {
      const d = new Date(e.ts_utc)
      const k = `${e.user_id.toString()}|${localKey(d)}`
      if (!firstByUserDay.has(k)) firstByUserDay.set(k, d)
    }

    const buckets = new Map<string, { on_time: number; late: number }>()
    for (const [k, d] of firstByUserDay) {
      const dateKey = k.split('|')[1]
      if (!buckets.has(dateKey)) buckets.set(dateKey, { on_time: 0, late: 0 })
      const mins = d.getHours() * 60 + d.getMinutes()
      if (mins > cutoffMins) buckets.get(dateKey)!.late++
      else buckets.get(dateKey)!.on_time++
    }

    const out: { date: string; label: string; on_time: number; late: number }[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const dateKey = localKey(d)
      const b = buckets.get(dateKey) ?? { on_time: 0, late: 0 }
      const label = `${d.getDate()}-${DOW[d.getDay()]}`
      out.push({ date: dateKey, label, on_time: b.on_time, late: b.late })
    }

    res.json(out)
  }),
)

// ── Employee list ────────────────────────────────────────────────────────────
adminRouter.get(
  '/employees',
  asyncHandler(async (_req, res) => {
    const users = await User.find().sort({ created_at: 1 })
    const configs = await EmployeeConfig.find()
    res.json(
      users.map((u) => ({
        id: u._id.toString(),
        full_name: u.full_name,
        email: u.email,
        client_company: u.client_company,
        roles: u.roles,
        config: configToClient(configs.find((c) => c.user_id.toString() === u._id.toString())),
      })),
    )
  }),
)

const updateConfigSchema = z.object({
  targetUserId: z.string(),
  config: z.object({
    office_lat: z.number().nullable().optional(),
    office_lng: z.number().nullable().optional(),
    office_radius_m: z.number().optional(),
    home_lat: z.number().nullable().optional(),
    home_lng: z.number().nullable().optional(),
    home_radius_m: z.number().optional(),
    weekly_schedule: z.record(z.string()).optional(),
  }),
})

adminRouter.post(
  '/employee-config',
  asyncHandler(async (req, res) => {
    const { targetUserId, config } = updateConfigSchema.parse(req.body)
    await EmployeeConfig.updateOne(
      { user_id: targetUserId },
      { $set: { ...config, updated_at: new Date() }, $setOnInsert: { user_id: targetUserId } },
      { upsert: true },
    )
    res.json({ ok: true })
  }),
)

// ── Company config update ────────────────────────────────────────────────────
adminRouter.post(
  '/company-config',
  asyncHandler(async (req, res) => {
    const cfg = await getCompanyConfigDoc()
    const allowed = ['office_name', 'office_lat', 'office_lng', 'office_radius_m', 'shift_start', 'late_threshold_min'] as const
    for (const key of allowed) {
      if (key in req.body) (cfg as any)[key] = req.body[key]
    }
    cfg.updated_at = new Date()
    await cfg.save()
    res.json({ ok: true })
  }),
)

// ── Devices ──────────────────────────────────────────────────────────────────
adminRouter.get(
  '/devices/pending',
  asyncHandler(async (_req, res) => {
    const rows = await Device.find({ status: 'pending' }).sort({ requested_at: -1 }).populate('user_id', 'full_name email')
    res.json(
      rows.map((d) => {
        const u: any = d.user_id
        return {
          id: d._id.toString(),
          user_id: u?._id?.toString() ?? '',
          fingerprint: d.fingerprint,
          user_agent: d.user_agent ?? null,
          requested_at: d.requested_at ? new Date(d.requested_at).toISOString() : new Date(d.created_at).toISOString(),
          employee_name: u?.full_name ?? '—',
          email: u?.email ?? '—',
        }
      }),
    )
  }),
)

adminRouter.get(
  '/devices/approved',
  asyncHandler(async (_req, res) => {
    const rows = await Device.find({ status: 'approved' }).sort({ approved_at: -1 }).populate('user_id', 'full_name email')
    res.json(
      rows.map((d) => {
        const u: any = d.user_id
        return {
          id: d._id.toString(),
          user_id: u?._id?.toString() ?? '',
          fingerprint: d.fingerprint,
          label: d.label ?? null,
          user_agent: d.user_agent ?? null,
          approved_at: d.approved_at ? new Date(d.approved_at).toISOString() : new Date(d.created_at).toISOString(),
          approved_by: d.approved_by ? d.approved_by.toString() : null,
          created_at: new Date(d.created_at).toISOString(),
          employee_name: u?.full_name ?? '—',
          email: u?.email ?? '—',
        }
      }),
    )
  }),
)

adminRouter.post(
  '/devices/approve',
  asyncHandler(async (req, res) => {
    const pendingId = String(req.body?.pendingId ?? '')
    const label = req.body?.label ?? null
    const pending = await Device.findOne({ _id: pendingId, status: 'pending' })
    if (!pending) return res.json({ ok: false, reason: 'Pending device not found' })
    pending.status = 'approved'
    pending.label = label
    pending.approved_at = new Date()
    pending.approved_by = req.auth!.userId as any
    await pending.save()
    res.json({ ok: true })
  }),
)

adminRouter.post(
  '/devices/reject',
  asyncHandler(async (req, res) => {
    const pendingId = String(req.body?.pendingId ?? '')
    await Device.deleteOne({ _id: pendingId, status: 'pending' })
    await AuditEvent.create({ actor_id: req.auth!.userId, action: 'device_rejected', target: pendingId, payload: {} })
    res.json({ ok: true })
  }),
)

adminRouter.post(
  '/devices/revoke',
  asyncHandler(async (req, res) => {
    const deviceId = String(req.body?.deviceId ?? '')
    await Device.deleteOne({ _id: deviceId })
    await AuditEvent.create({ actor_id: req.auth!.userId, action: 'device_revoked', target: deviceId, payload: {} })
    res.json({ ok: true })
  }),
)

// ── Create employee ──────────────────────────────────────────────────────────
const createEmployeeSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  client_company: z.string().min(1),
  roles: z.array(z.string()).optional(),
  weekly_schedule: z.record(z.string()).optional(),
})

adminRouter.post(
  '/employees',
  asyncHandler(async (req, res) => {
    const data = createEmployeeSchema.parse(req.body)
    const existing = await User.findOne({ email: data.email.toLowerCase() })
    if (existing) return res.json({ ok: false, reason: 'An account with this email already exists' })

    const roles = Array.from(new Set([...(data.roles ?? ['employee']), 'employee']))
    const user = await User.create({
      email: data.email.toLowerCase(),
      password_hash: await hashPassword(data.password),
      full_name: data.full_name,
      client_company: data.client_company,
      roles,
    })
    await provisionNewUser(user._id, { weekly_schedule: data.weekly_schedule })
    res.json({ ok: true, user_id: user._id.toString() })
  }),
)

// ── Review leave (approve/reject) ────────────────────────────────────────────
adminRouter.post(
  '/leaves/review',
  asyncHandler(async (req, res) => {
    const requestId = String(req.body?.requestId ?? '')
    const action = req.body?.action as 'approved' | 'rejected'
    const reqDoc = await LeaveRequest.findById(requestId)
    if (!reqDoc) return res.json({ ok: false, reason: 'Not found.' })
    if (reqDoc.status !== 'pending') return res.json({ ok: false, reason: 'Request already reviewed.' })

    reqDoc.status = action
    reqDoc.reviewed_by = req.auth!.userId as any
    reqDoc.reviewed_at = new Date()
    await reqDoc.save()

    const bal = await LeaveBalance.findOne({
      user_id: reqDoc.user_id,
      leave_type_id: reqDoc.leave_type_id,
      year: new Date(reqDoc.from_date).getFullYear(),
    })
    if (bal) {
      bal.pending_days = Math.max(0, bal.pending_days - reqDoc.days)
      if (action === 'approved') bal.used_days += reqDoc.days
      await bal.save()
    }
    res.json({ ok: true })
  }),
)
