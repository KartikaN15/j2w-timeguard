import { Types } from 'mongoose'
import { EmployeeConfig } from '../models/EmployeeConfig.js'
import { LeaveType } from '../models/LeaveType.js'
import { LeaveBalance } from '../models/LeaveBalance.js'

// Mirrors the Postgres handle_new_user() trigger: creates the employee_config
// row and seeds this year's leave balances for a freshly created user.
export async function provisionNewUser(
  userId: Types.ObjectId | string,
  opts: { weekly_schedule?: Record<string, string> } = {},
): Promise<void> {
  await EmployeeConfig.updateOne(
    { user_id: userId },
    { $setOnInsert: { user_id: userId }, ...(opts.weekly_schedule ? { $set: { weekly_schedule: opts.weekly_schedule } } : {}) },
    { upsert: true },
  )

  const year = new Date().getFullYear()
  const types = await LeaveType.find({ code: { $ne: 'LOP' } })
  for (const lt of types) {
    await LeaveBalance.updateOne(
      { user_id: userId, leave_type_id: lt._id, year },
      { $setOnInsert: { user_id: userId, leave_type_id: lt._id, year, total_days: lt.days_per_year, used_days: 0, pending_days: 0 } },
      { upsert: true },
    )
  }
}

// Ensures the four default leave types exist (idempotent).
export async function ensureLeaveTypes(): Promise<void> {
  const defaults = [
    { code: 'CL', label: 'Casual Leave', days_per_year: 12, is_paid: true },
    { code: 'SL', label: 'Sick Leave', days_per_year: 12, is_paid: true },
    { code: 'PL', label: 'Privilege Leave', days_per_year: 18, is_paid: true },
    { code: 'LOP', label: 'Loss of Pay', days_per_year: 0, is_paid: false },
  ]
  for (const d of defaults) {
    await LeaveType.updateOne({ code: d.code }, { $setOnInsert: d }, { upsert: true })
  }
}
