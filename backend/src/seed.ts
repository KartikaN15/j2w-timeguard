// Seeds the database with demo users and sample data.
// Run with:  npm run seed
// WARNING: this clears the existing collections below before reseeding.
import { connectDb } from './db.js'
import { hashPassword } from './lib/auth.js'
import { ensureLeaveTypes, provisionNewUser } from './lib/seedUser.js'
import { User } from './models/User.js'
import { EmployeeConfig } from './models/EmployeeConfig.js'
import { Device } from './models/Device.js'
import { AttendanceEvent } from './models/AttendanceEvent.js'
import { AuditEvent } from './models/AuditEvent.js'
import { LeaveBalance } from './models/LeaveBalance.js'
import { LeaveRequest } from './models/LeaveRequest.js'
import { LeaveType } from './models/LeaveType.js'
import { CompanyConfig, getCompanyConfigDoc } from './models/CompanyConfig.js'
import mongoose from 'mongoose'

const PASSWORD = 'demo@123'

// J2W office (Bengaluru) — used for the demo geofence.
const OFFICE = { lat: 12.9716, lng: 77.5946 }

const WORKWEEK = { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFO', fri: 'WFO', sat: 'OFF', sun: 'OFF' }
const HYBRID = { mon: 'WFO', tue: 'WFH', wed: 'WFO', thu: 'WFH', fri: 'WFO', sat: 'OFF', sun: 'OFF' }

function at(daysAgo: number, h: number, m: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d
}

async function run() {
  await connectDb()
  console.log('[seed] Clearing existing data…')
  await Promise.all([
    User.deleteMany({}),
    EmployeeConfig.deleteMany({}),
    Device.deleteMany({}),
    AttendanceEvent.deleteMany({}),
    AuditEvent.deleteMany({}),
    LeaveBalance.deleteMany({}),
    LeaveRequest.deleteMany({}),
    CompanyConfig.deleteMany({}),
  ])

  await ensureLeaveTypes()

  // Company config
  const company = await getCompanyConfigDoc()
  company.office_name = 'J2W Bengaluru HQ'
  company.office_lat = OFFICE.lat
  company.office_lng = OFFICE.lng
  company.office_radius_m = 2000
  company.shift_start = '09:30'
  await company.save()

  const password_hash = await hashPassword(PASSWORD)

  // ── Users ──
  const admin = await User.create({
    email: 'admin@j2w.in',
    password_hash,
    full_name: 'HR Admin',
    client_company: 'J2W Business Solutions',
    roles: ['super_admin', 'hr_admin', 'employee'],
  })
  const arjun = await User.create({
    email: 'arjun.mehta@ge.com',
    password_hash,
    full_name: 'Arjun Mehta',
    client_company: 'GE Healthcare',
    roles: ['employee'],
  })
  const priya = await User.create({
    email: 'priya.nair@ge.com',
    password_hash,
    full_name: 'Priya Nair',
    client_company: 'GE Healthcare',
    roles: ['employee'],
  })
  const ravi = await User.create({
    email: 'ravi.kumar@tcs.com',
    password_hash,
    full_name: 'Ravi Kumar',
    client_company: 'TCS',
    roles: ['employee'],
  })

  // Provision configs + leave balances for everyone
  for (const u of [admin, arjun, priya, ravi]) {
    await provisionNewUser(u._id, { weekly_schedule: WORKWEEK })
  }

  // Customise a couple of configs (home geofence + hybrid schedule)
  await EmployeeConfig.updateOne(
    { user_id: arjun._id },
    { $set: { weekly_schedule: HYBRID, home_lat: 12.9352, home_lng: 77.6245, home_radius_m: 200 } },
  )
  await EmployeeConfig.updateOne(
    { user_id: priya._id },
    { $set: { home_lat: 12.9784, home_lng: 77.6408, home_radius_m: 200 } },
  )

  // ── Devices (approved) ──
  await Device.create([
    { user_id: arjun._id, fingerprint: 'demo-fp-arjun-laptop', label: 'Arjun MacBook', status: 'approved', approved_at: new Date(), approved_by: admin._id },
    { user_id: priya._id, fingerprint: 'demo-fp-priya-phone', label: 'Priya iPhone', status: 'approved', approved_at: new Date(), approved_by: admin._id },
    // A pending device awaiting HR approval (shows up in /admin/devices)
    { user_id: ravi._id, fingerprint: 'demo-fp-ravi-newphone', user_agent: 'Mozilla/5.0 (Android)', status: 'pending', requested_at: new Date() },
  ])

  // ── Attendance events (last few working days) ──
  const events: any[] = []
  const insideOffice = { lat: OFFICE.lat + 0.0005, lng: OFFICE.lng + 0.0005, accuracy_m: 18, geofence_status: 'inside_office' }
  for (const daysAgo of [3, 2, 1]) {
    const d = at(daysAgo, 0, 0)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    for (const u of [arjun, priya]) {
      events.push({ user_id: u._id, device_fingerprint: 'demo-fp', event_type: 'punch_in', ts_utc: at(daysAgo, 9, 25), ...insideOffice, anomaly_flags: [] })
      events.push({ user_id: u._id, device_fingerprint: 'demo-fp', event_type: 'punch_out', ts_utc: at(daysAgo, 18, 10), ...insideOffice, anomaly_flags: [] })
    }
  }
  // Today: Arjun punched in (present), Ravi punched in late + flagged
  events.push({ user_id: arjun._id, device_fingerprint: 'demo-fp-arjun-laptop', event_type: 'punch_in', ts_utc: at(0, 9, 28), ...insideOffice, anomaly_flags: [] })
  events.push({
    user_id: ravi._id, device_fingerprint: 'demo-fp-ravi-newphone', event_type: 'punch_in',
    ts_utc: at(0, 10, 45), lat: OFFICE.lat + 0.05, lng: OFFICE.lng + 0.05, accuracy_m: 140,
    geofence_status: 'outside', anomaly_flags: ['geofence_outside_on_wfo', 'low_gps_accuracy'],
  })
  if (events.length) await AttendanceEvent.insertMany(events)

  // ── A sample leave request (Priya, pending) ──
  const cl = await LeaveType.findOne({ code: 'CL' })
  if (cl) {
    const from = at(-5, 0, 0).toISOString().slice(0, 10) // 5 days from now
    const to = at(-6, 0, 0).toISOString().slice(0, 10)
    const [fromDate, toDate] = [from, to].sort()
    await LeaveRequest.create({
      user_id: priya._id, leave_type_id: cl._id,
      from_date: fromDate, to_date: toDate, days: 2, reason: 'Family function', status: 'pending',
    })
    await LeaveBalance.updateOne(
      { user_id: priya._id, leave_type_id: cl._id, year: new Date().getFullYear() },
      { $inc: { pending_days: 2 } },
    )
  }

  console.log('[seed] Done. Demo accounts (password: %s):', PASSWORD)
  console.log('  admin@j2w.in           — HR Admin (super_admin + hr_admin)')
  console.log('  arjun.mehta@ge.com     — GE Healthcare (hybrid schedule)')
  console.log('  priya.nair@ge.com      — GE Healthcare')
  console.log('  ravi.kumar@tcs.com     — TCS (pending device + flagged punch today)')

  await mongoose.disconnect()
  process.exit(0)
}

run().catch((err) => {
  console.error('[seed] Failed', err)
  process.exit(1)
})
