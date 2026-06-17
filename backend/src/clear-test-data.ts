// Clears transactional/test data so you can test from a clean slate.
// Keeps: users, employee configs, leave types, company config, devices.
// Removes: attendance events, leave requests, audit events.
// Resets: leave balances (used_days & pending_days → 0).
//
// Run with:  npm run clear
import mongoose from 'mongoose'
import { connectDb } from './db.js'
import { AttendanceEvent } from './models/AttendanceEvent.js'
import { LeaveRequest } from './models/LeaveRequest.js'
import { LeaveBalance } from './models/LeaveBalance.js'
import { AuditEvent } from './models/AuditEvent.js'

async function run() {
  await connectDb()

  const ae = await AttendanceEvent.deleteMany({})
  const lr = await LeaveRequest.deleteMany({})
  const au = await AuditEvent.deleteMany({})
  const lb = await LeaveBalance.updateMany({}, { $set: { used_days: 0, pending_days: 0 } })

  console.log('[clear] attendance events removed:', ae.deletedCount)
  console.log('[clear] leave requests removed:   ', lr.deletedCount)
  console.log('[clear] audit events removed:     ', au.deletedCount)
  console.log('[clear] leave balances reset:     ', lb.modifiedCount)
  console.log('[clear] Done — users, configs, leave types and devices kept.')

  await mongoose.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('[clear] Failed', err)
  process.exit(1)
})
