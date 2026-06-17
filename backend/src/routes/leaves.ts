import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../lib/http.js'
import { isAdminRoles } from '../lib/auth.js'
import { LeaveType } from '../models/LeaveType.js'
import { LeaveBalance } from '../models/LeaveBalance.js'
import { LeaveRequest } from '../models/LeaveRequest.js'
import { User } from '../models/User.js'

export const leavesRouter = Router()
leavesRouter.use(requireAuth)

// Real approvers = users who can approve leave (HR admins). Any authenticated
// user can read this so the "Applying to" picker shows real names.
leavesRouter.get(
  '/approvers',
  asyncHandler(async (_req, res) => {
    const admins = await User.find({ roles: { $in: ['super_admin', 'hr_admin'] } }).sort({ full_name: 1 })
    res.json(
      admins.map((u) => ({
        id: u._id.toString(),
        name: u.full_name,
        role: `HR Admin · ${u.client_company}`,
      })),
    )
  }),
)

function serializeLeaveType(lt: any) {
  return { id: lt._id.toString(), code: lt.code, label: lt.label, days_per_year: lt.days_per_year, is_paid: lt.is_paid }
}

leavesRouter.get(
  '/types',
  asyncHandler(async (_req, res) => {
    const types = await LeaveType.find().sort({ days_per_year: -1 })
    res.json(types.map(serializeLeaveType))
  }),
)

leavesRouter.get(
  '/balances',
  asyncHandler(async (req, res) => {
    const targetId = String(req.query.userId ?? req.auth!.userId)
    const year = Number(req.query.year ?? new Date().getFullYear())
    const balances = await LeaveBalance.find({ user_id: targetId, year }).populate('leave_type_id')
    res.json(
      balances.map((b) => ({
        id: b._id.toString(),
        user_id: b.user_id.toString(),
        leave_type_id: (b.leave_type_id as any)?._id?.toString() ?? b.leave_type_id?.toString(),
        year: b.year,
        total_days: b.total_days,
        used_days: b.used_days,
        pending_days: b.pending_days,
        leave_type: serializeLeaveType(b.leave_type_id),
      })),
    )
  }),
)

leavesRouter.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const isAdmin = isAdminRoles(req.auth!.roles)
    const filterUserId = req.query.userId ? String(req.query.userId) : undefined
    const status = req.query.status ? String(req.query.status) : undefined

    const query: Record<string, unknown> = {}
    if (!isAdmin || filterUserId) query.user_id = filterUserId ?? req.auth!.userId
    if (status) query.status = status

    const rows = await LeaveRequest.find(query)
      .sort({ created_at: -1 })
      .populate('leave_type_id')
      .populate('user_id', 'full_name email')

    res.json(
      rows.map((r) => {
        const emp: any = r.user_id
        return {
          id: r._id.toString(),
          user_id: emp?._id?.toString() ?? r.user_id?.toString(),
          leave_type_id: (r.leave_type_id as any)?._id?.toString(),
          from_date: r.from_date,
          to_date: r.to_date,
          days: r.days,
          reason: r.reason ?? null,
          status: r.status,
          reviewed_by: r.reviewed_by ? r.reviewed_by.toString() : null,
          reviewed_at: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
          created_at: new Date(r.created_at).toISOString(),
          leave_type: serializeLeaveType(r.leave_type_id),
          employee_name: emp?.full_name ?? '—',
          email: emp?.email ?? '—',
        }
      }),
    )
  }),
)

const applySchema = z.object({
  leave_type_id: z.string(),
  from_date: z.string(),
  to_date: z.string(),
  reason: z.string().optional(),
})

leavesRouter.post(
  '/apply',
  asyncHandler(async (req, res) => {
    const data = applySchema.parse(req.body)
    const userId = req.auth!.userId
    const from = new Date(data.from_date)
    const to = new Date(data.to_date)
    if (from > to) return res.json({ ok: false, reason: 'From date must be before to date.' })

    let days = 0
    const cur = new Date(from)
    while (cur <= to) {
      if (cur.getDay() !== 0 && cur.getDay() !== 6) days++
      cur.setDate(cur.getDate() + 1)
    }
    if (days === 0) return res.json({ ok: false, reason: 'No working days in selected range.' })

    const lt = await LeaveType.findById(data.leave_type_id)
    if (!lt) return res.json({ ok: false, reason: 'Invalid leave type.' })

    if (lt.code !== 'LOP') {
      const bal = await LeaveBalance.findOne({ user_id: userId, leave_type_id: data.leave_type_id, year: from.getFullYear() })
      const available = bal ? bal.total_days - bal.used_days - bal.pending_days : 0
      if (days > available) return res.json({ ok: false, reason: `Insufficient ${lt.code} balance. Available: ${available} days.` })
      if (bal) {
        bal.pending_days += days
        await bal.save()
      }
    }

    await LeaveRequest.create({
      user_id: userId,
      leave_type_id: data.leave_type_id,
      from_date: data.from_date,
      to_date: data.to_date,
      days,
      reason: data.reason ?? null,
    })
    res.json({ ok: true })
  }),
)

leavesRouter.post(
  '/cancel',
  asyncHandler(async (req, res) => {
    const requestId = String(req.body?.requestId ?? '')
    const userId = req.auth!.userId
    const reqDoc = await LeaveRequest.findOne({ _id: requestId, user_id: userId })
    if (!reqDoc) return res.json({ ok: false, reason: 'Leave request not found.' })
    if (reqDoc.status !== 'pending') return res.json({ ok: false, reason: 'Only pending requests can be cancelled.' })

    const bal = await LeaveBalance.findOne({ user_id: userId, leave_type_id: reqDoc.leave_type_id, year: new Date(reqDoc.from_date).getFullYear() })
    if (bal) {
      bal.pending_days = Math.max(0, bal.pending_days - reqDoc.days)
      await bal.save()
    }
    reqDoc.status = 'cancelled'
    await reqDoc.save()
    res.json({ ok: true })
  }),
)
