// REST wrappers that preserve the original server-function names & call shapes
// (`fn()` and `fn({ data })`) so route components didn't need to change when we
// migrated from TanStack server functions + Supabase to the Express + MongoDB API.
import { api } from '@/lib/api'

// ── Types (unchanged public shapes) ──────────────────────────────────────────

export type AttendanceEvent = {
  id: string; user_id: string; device_fingerprint: string | null
  event_type: 'punch_in' | 'punch_out'; ts_utc: string
  lat: number | null; lng: number | null; accuracy_m: number | null
  geofence_status: string | null; mock_flag: boolean; selfie_path: string | null
  anomaly_flags: string[]
}

export type EmployeeConfig = {
  user_id: string; office_lat: number | null; office_lng: number | null
  office_radius_m: number; home_lat: number | null; home_lng: number | null
  home_radius_m: number; weekly_schedule: Record<string, string>
}

export type DeviceStatus =
  | { kind: 'approved' }
  | { kind: 'pending' }
  | { kind: 'unregistered' }

export type AttendanceStats = {
  streak: number; lateThisMonth: number; presentThisMonth: number; totalPunchesAllTime: number
}

export type EmployeeDayStatus = {
  user_id: string; full_name: string; email: string; client_company: string
  status: 'present' | 'clocked_out' | 'on_leave' | 'absent' | 'non_working'
  first_in: string | null; last_out: string | null; work_minutes: number
  on_leave_type: string | null; anomalies: string[]
}

export type DayRecord = {
  date: string; status: 'present' | 'clocked_out' | 'on_leave' | 'absent' | 'non_working'
  schedule_type: string; first_in: string | null; last_out: string | null
  work_minutes: number; sessions: { in: string; out: string | null; duration_m: number }[]
  anomalies: string[]; leave_type: string | null; is_late: boolean
}

export type LeaveTypeRow = { id: string; code: string; label: string; days_per_year: number; is_paid: boolean }
export type LeaveBalanceRow = { id: string; user_id: string; leave_type_id: string; year: number; total_days: number; used_days: number; pending_days: number; leave_type: LeaveTypeRow }
export type LeaveRequestRow = {
  id: string; user_id: string; leave_type_id: string; from_date: string; to_date: string
  days: number; reason: string | null; status: string; reviewed_by: string | null
  reviewed_at: string | null; created_at: string
  leave_type: LeaveTypeRow; employee_name: string; email: string
}

export type CreateEmployeeInput = {
  full_name: string; email: string; password: string
  client_company: string; roles?: string[]
  weekly_schedule?: Record<string, string>
}

type PunchResult =
  | { ok: true; event: AttendanceEvent; geofence: string; schedule_type: string; warning?: string }
  | { ok: false; reason: string }

type OkResult = { ok: true; [k: string]: unknown } | { ok: false; reason: string }

// ── Punch / attendance ───────────────────────────────────────────────────────

export const submitPunchFn = ({ data }: { data: {
  event_type: 'punch_in' | 'punch_out'; lat: number | null; lng: number | null
  accuracy_m: number | null; fingerprint: string; mock_flag?: boolean; client_anomalies?: string[]
} }) => api.post<PunchResult>('/api/punch', data)

export const getTodayEventsFn = () => api.get<AttendanceEvent[]>('/api/punch/today')

export const getAttendanceStatsFn = () => api.get<AttendanceStats>('/api/attendance/stats')

export const getHistoryFn = () => api.get<AttendanceEvent[]>('/api/attendance/history')

export const getMonthAttendanceFn = ({ data }: { data: { userId: string; year: number; month: number } }) =>
  api.get<DayRecord[]>('/api/attendance/month', { userId: data.userId, year: data.year, month: data.month })

export const getDeviceStatusFn = ({ data }: { data: { fingerprint: string } }) =>
  api.post<DeviceStatus>('/api/devices/status', data)

export const getEmployeeConfigFn = () => api.get<EmployeeConfig | null>('/api/employee-config')

// ── Company config ───────────────────────────────────────────────────────────

export const getCompanyConfigFn = () => api.get<any>('/api/company-config')

export const updateCompanyConfigFn = ({ data }: { data: Record<string, unknown> }) =>
  api.post<OkResult>('/api/admin/company-config', data)

// ── HR dashboard ─────────────────────────────────────────────────────────────

export const getDailyStatusFn = () => api.get<EmployeeDayStatus[]>('/api/admin/daily-status')

export type TrendPoint = { date: string; label: string; on_time: number; late: number }
export const getAttendanceTrendFn = (days = 10) =>
  api.get<TrendPoint[]>('/api/admin/attendance-trend', { days })

export const getEmployeeListFn = () => api.get<any[]>('/api/admin/employees')

export const updateEmployeeConfigFn = ({ data }: { data: { targetUserId: string; config: Partial<EmployeeConfig> } }) =>
  api.post<OkResult>('/api/admin/employee-config', data)

export const createEmployeeFn = ({ data }: { data: CreateEmployeeInput }) =>
  api.post<{ ok: true; user_id: string } | { ok: false; reason: string }>('/api/admin/employees', data)

// ── Devices (HR) ─────────────────────────────────────────────────────────────

export const getPendingDevicesFn = () => api.get<any[]>('/api/admin/devices/pending')
export const getApprovedDevicesFn = () => api.get<any[]>('/api/admin/devices/approved')
export const approveDeviceFn = ({ data }: { data: { pendingId: string; label?: string } }) =>
  api.post<OkResult>('/api/admin/devices/approve', data)
export const rejectDeviceFn = ({ data }: { data: { pendingId: string } }) =>
  api.post<OkResult>('/api/admin/devices/reject', data)
export const revokeDeviceFn = ({ data }: { data: { deviceId: string } }) =>
  api.post<OkResult>('/api/admin/devices/revoke', data)

// ── Leaves ───────────────────────────────────────────────────────────────────

export type ApproverRow = { id: string; name: string; role: string }
export const getApproversFn = () => api.get<ApproverRow[]>('/api/leaves/approvers')

export const getLeaveTypesFn = () => api.get<LeaveTypeRow[]>('/api/leaves/types')

export const getLeaveBalancesFn = (arg?: { data: { userId?: string; year?: number } }) =>
  api.get<LeaveBalanceRow[]>('/api/leaves/balances', { userId: arg?.data.userId, year: arg?.data.year })

export const getLeaveRequestsFn = (arg?: { data: { userId?: string; status?: string } }) =>
  api.get<LeaveRequestRow[]>('/api/leaves/requests', { userId: arg?.data.userId, status: arg?.data.status })

export const applyLeaveFn = ({ data }: { data: { leave_type_id: string; from_date: string; to_date: string; reason?: string } }) =>
  api.post<OkResult>('/api/leaves/apply', data)

export const cancelLeaveFn = ({ data }: { data: { requestId: string } }) =>
  api.post<OkResult>('/api/leaves/cancel', data)

export const reviewLeaveFn = ({ data }: { data: { requestId: string; action: 'approved' | 'rejected'; reason?: string } }) =>
  api.post<OkResult>('/api/admin/leaves/review', data)
