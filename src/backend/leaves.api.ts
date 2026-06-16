import { getDB, uid, type LeaveType, type LeaveBalance, type LeaveRequest } from './mock-db'
import { getUserById } from './auth.api'

export { type LeaveType, type LeaveBalance, type LeaveRequest }

export async function getLeaveTypes(): Promise<LeaveType[]> {
  return getDB().leave_types.sort((a, b) => a.sort_order - b.sort_order)
}

export async function getLeaveBalances(
  userId: string,
  year = new Date().getFullYear(),
): Promise<(LeaveBalance & { leave_type: LeaveType })[]> {
  const db = getDB()
  const types = db.leave_types
  const balances = db.leave_balances.filter((b) => b.user_id === userId && b.year === year)
  // Ensure all types have a balance row
  const result: (LeaveBalance & { leave_type: LeaveType })[] = types
    .filter((t) => t.code !== 'LOP')
    .map((lt) => {
      const b = balances.find((x) => x.leave_type_id === lt.id)
      const bal: LeaveBalance = b ?? {
        id: uid('lb'),
        user_id: userId,
        leave_type_id: lt.id,
        year,
        total_days: lt.days_per_year,
        used_days: 0,
        pending_days: 0,
      }
      return { ...bal, leave_type: lt }
    })
  return result
}

export type LeaveRequestRow = LeaveRequest & {
  leave_type: LeaveType
  employee_name: string
  email: string
}

export async function getLeaveRequests(userId?: string): Promise<LeaveRequestRow[]> {
  const db = getDB()
  let requests = db.leave_requests
  if (userId) requests = requests.filter((r) => r.user_id === userId)
  return requests
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((r) => {
      const lt = db.leave_types.find((t) => t.id === r.leave_type_id)!
      const u = getUserById(r.user_id)
      return { ...r, leave_type: lt, employee_name: u?.user_metadata.full_name ?? '—', email: u?.email ?? '—' }
    })
}

export async function getPendingLeaveRequests(): Promise<LeaveRequestRow[]> {
  const all = await getLeaveRequests()
  return all.filter((r) => r.status === 'pending')
}

export type ApplyLeaveInput = {
  user_id: string
  leave_type_id: string
  from_date: string
  to_date: string
  day_type: 'full' | 'first_half' | 'second_half'
  reason?: string
}

export async function applyLeave(
  input: ApplyLeaveInput,
): Promise<{ ok: true; request: LeaveRequest } | { ok: false; reason: string }> {
  const db = getDB()
  const lt = db.leave_types.find((t) => t.id === input.leave_type_id)
  if (!lt) return { ok: false, reason: 'Invalid leave type.' }

  const from = new Date(input.from_date)
  const to = new Date(input.to_date)
  if (from > to) return { ok: false, reason: 'From date must be before or equal to to date.' }

  // Count working days (simple: count days, exclude Sun & Sat, halve if half-day)
  let total_days = 0
  const cur = new Date(from)
  while (cur <= to) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) total_days++
    cur.setDate(cur.getDate() + 1)
  }
  if (input.day_type !== 'full') total_days = Math.max(0.5, total_days * 0.5)

  // Check balance (skip for LOP)
  if (lt.code !== 'LOP') {
    const year = from.getFullYear()
    const bal = db.leave_balances.find(
      (b) => b.user_id === input.user_id && b.leave_type_id === input.leave_type_id && b.year === year,
    )
    const available = bal ? bal.total_days - bal.used_days - bal.pending_days : 0
    if (total_days > available) {
      return { ok: false, reason: `Insufficient ${lt.code} balance. Available: ${available} days.` }
    }
    // Reserve pending
    if (bal) bal.pending_days += total_days
  }

  const now = new Date().toISOString()
  const request: LeaveRequest = {
    id: uid('lr'),
    user_id: input.user_id,
    leave_type_id: input.leave_type_id,
    from_date: input.from_date,
    to_date: input.to_date,
    day_type: input.day_type,
    total_days,
    reason: input.reason ?? null,
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
  }
  db.leave_requests.push(request)
  return { ok: true, request }
}

export async function reviewLeave(
  requestId: string,
  action: 'approved' | 'rejected',
  reviewedBy: string,
  rejectionReason?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDB()
  const req = db.leave_requests.find((r) => r.id === requestId)
  if (!req) return { ok: false, reason: 'Leave request not found.' }
  if (req.status !== 'pending') return { ok: false, reason: 'Request is no longer pending.' }

  const now = new Date().toISOString()
  req.status = action
  req.reviewed_by = reviewedBy
  req.reviewed_at = now
  req.rejection_reason = rejectionReason ?? null
  req.updated_at = now

  // Update balance
  const year = new Date(req.from_date).getFullYear()
  const bal = db.leave_balances.find(
    (b) => b.user_id === req.user_id && b.leave_type_id === req.leave_type_id && b.year === year,
  )
  if (bal) {
    bal.pending_days = Math.max(0, bal.pending_days - req.total_days)
    if (action === 'approved') bal.used_days += req.total_days
  }

  return { ok: true }
}

export async function cancelLeave(
  requestId: string,
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDB()
  const req = db.leave_requests.find((r) => r.id === requestId && r.user_id === userId)
  if (!req) return { ok: false, reason: 'Leave request not found.' }
  if (req.status !== 'pending') return { ok: false, reason: 'Only pending requests can be cancelled.' }

  // Restore pending balance
  const year = new Date(req.from_date).getFullYear()
  const bal = db.leave_balances.find(
    (b) => b.user_id === userId && b.leave_type_id === req.leave_type_id && b.year === year,
  )
  if (bal) bal.pending_days = Math.max(0, bal.pending_days - req.total_days)

  req.status = 'cancelled'
  req.updated_at = new Date().toISOString()
  return { ok: true }
}
