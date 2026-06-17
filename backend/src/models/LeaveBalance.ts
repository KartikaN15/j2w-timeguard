import { Schema, model, Types, type InferSchemaType } from 'mongoose'

const leaveBalanceSchema = new Schema({
  user_id: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  leave_type_id: { type: Types.ObjectId, ref: 'LeaveType', required: true },
  year: { type: Number, required: true },
  total_days: { type: Number, required: true, default: 0 },
  used_days: { type: Number, required: true, default: 0 },
  pending_days: { type: Number, required: true, default: 0 },
})

leaveBalanceSchema.index({ user_id: 1, leave_type_id: 1, year: 1 }, { unique: true })

export type LeaveBalanceDoc = InferSchemaType<typeof leaveBalanceSchema>
export const LeaveBalance = model('LeaveBalance', leaveBalanceSchema)
