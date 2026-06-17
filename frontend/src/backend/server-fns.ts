import { createServerFn } from '@tanstack/react-start'
import type { PunchInput } from './punch.api'

export const submitPunchFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data as PunchInput)
  .handler(async ({ data }) => {
    const { submitPunch } = await import('./punch.api')
    return submitPunch(data)
  })

export const getTodayEventsFn = createServerFn({ method: 'GET' })
  .validator((userId: unknown) => userId as string)
  .handler(async ({ data: userId }) => {
    const { getTodayEvents } = await import('./punch.api')
    return getTodayEvents(userId)
  })

export const getAttendanceStatsFn = createServerFn({ method: 'GET' })
  .validator((userId: unknown) => userId as string)
  .handler(async ({ data: userId }) => {
    const { getAttendanceStats } = await import('./punch.api')
    return getAttendanceStats(userId)
  })

export const getDailyStatusFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { getDailyStatus } = await import('./punch.api')
    return getDailyStatus()
  })

export const getMonthAttendanceFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => data as { userId: string; year: number; month: number })
  .handler(async ({ data }) => {
    const { getMonthAttendance } = await import('./punch.api')
    return getMonthAttendance(data.userId, data.year, data.month)
  })

export const getHistoryFn = createServerFn({ method: 'GET' })
  .validator((userId: unknown) => userId as string)
  .handler(async ({ data: userId }) => {
    const { getHistory } = await import('./punch.api')
    return getHistory(userId)
  })

export const getDeviceStatusFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data as { userId: string; fingerprint: string })
  .handler(async ({ data }) => {
    const { getDeviceStatus } = await import('./devices.api')
    return getDeviceStatus(data.userId, data.fingerprint)
  })

export const getEmployeeConfigFn = createServerFn({ method: 'GET' })
  .validator((userId: unknown) => userId as string)
  .handler(async ({ data: userId }) => {
    const { getEmployeeConfig } = await import('./employees.api')
    return getEmployeeConfig(userId)
  })
