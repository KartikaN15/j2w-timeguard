import { getDB, uid, type Device, type PendingDevice } from './mock-db'
import { getUserById } from './auth.api'

export type DeviceStatus =
  | { kind: 'approved'; device: Device }
  | { kind: 'pending'; pending: PendingDevice }
  | { kind: 'unregistered' }

export async function getDeviceStatus(userId: string, fingerprint: string): Promise<DeviceStatus> {
  const db = getDB()
  const approved = db.devices.find((d) => d.user_id === userId && d.fingerprint === fingerprint)
  if (approved) return { kind: 'approved', device: approved }
  const pending = db.pending_devices.find((d) => d.user_id === userId && d.fingerprint === fingerprint)
  if (pending) return { kind: 'pending', pending }
  // Demo mode: auto-approve any new device so users never have to manually register
  const autoDevice: Device = {
    id: uid('dev'),
    user_id: userId,
    fingerprint,
    label: 'Auto-approved (demo)',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
    approved_at: new Date().toISOString(),
    approved_by: null,
    created_at: new Date().toISOString(),
  }
  db.devices.push(autoDevice)
  return { kind: 'approved', device: autoDevice }
}

export async function requestDeviceApproval(
  userId: string,
  fingerprint: string,
  userAgent: string,
): Promise<'approved' | 'pending' | 'error'> {
  const db = getDB()
  // Already approved?
  if (db.devices.find((d) => d.user_id === userId && d.fingerprint === fingerprint)) return 'approved'
  // Already pending?
  if (db.pending_devices.find((d) => d.user_id === userId && d.fingerprint === fingerprint)) return 'pending'

  // Demo mode: always auto-approve so the demo works from any browser.
  // Production: enforce max-2-device limit and route through HR approval queue.
  db.devices.push({
    id: uid('dev'),
    user_id: userId,
    fingerprint,
    label: 'Auto-approved (demo)',
    user_agent: userAgent,
    approved_at: new Date().toISOString(),
    approved_by: null,
    created_at: new Date().toISOString(),
  })
  return 'approved'
}

export type PendingDeviceRow = PendingDevice & { employee_name: string; email: string }
export type ApprovedDeviceRow = Device & { employee_name: string; email: string }

export async function getPendingDevices(): Promise<PendingDeviceRow[]> {
  const db = getDB()
  return db.pending_devices.map((p) => {
    const u = getUserById(p.user_id)
    return { ...p, employee_name: u?.user_metadata.full_name ?? '—', email: u?.email ?? '—' }
  })
}

export async function getApprovedDevices(): Promise<ApprovedDeviceRow[]> {
  const db = getDB()
  return db.devices.map((d) => {
    const u = getUserById(d.user_id)
    return { ...d, employee_name: u?.user_metadata.full_name ?? '—', email: u?.email ?? '—' }
  })
}

export async function approveDevice(
  pendingId: string,
  approvedBy: string,
  label?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDB()
  const pending = db.pending_devices.find((d) => d.id === pendingId)
  if (!pending) return { ok: false, reason: 'Pending device not found.' }

  const count = db.devices.filter((d) => d.user_id === pending.user_id).length
  if (count >= 2) return { ok: false, reason: 'User already has 2 approved devices. Revoke one first.' }

  db.devices.push({
    id: uid('dev'),
    user_id: pending.user_id,
    fingerprint: pending.fingerprint,
    label: label ?? null,
    user_agent: pending.user_agent,
    approved_at: new Date().toISOString(),
    approved_by: approvedBy,
    created_at: new Date().toISOString(),
  })
  db.pending_devices = db.pending_devices.filter((d) => d.id !== pendingId)
  db.audit_events.push({
    id: uid('audit'),
    actor_id: approvedBy,
    action: 'device_approved',
    target: pending.user_id,
    payload: { fingerprint: pending.fingerprint },
    ts: new Date().toISOString(),
  })
  return { ok: true }
}

export async function rejectDevice(pendingId: string, actorId: string): Promise<void> {
  const db = getDB()
  db.pending_devices = db.pending_devices.filter((d) => d.id !== pendingId)
  db.audit_events.push({
    id: uid('audit'),
    actor_id: actorId,
    action: 'device_rejected',
    target: pendingId,
    payload: {},
    ts: new Date().toISOString(),
  })
}

export async function revokeDevice(deviceId: string, actorId: string): Promise<void> {
  const db = getDB()
  db.devices = db.devices.filter((d) => d.id !== deviceId)
  db.audit_events.push({
    id: uid('audit'),
    actor_id: actorId,
    action: 'device_revoked',
    target: deviceId,
    payload: {},
    ts: new Date().toISOString(),
  })
}
