import { Schema, model, Types, type InferSchemaType } from 'mongoose'

const leaveRequestSchema = new Schema({
  user_id: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  leave_type_id: { type: Types.ObjectId, ref: 'LeaveType', required: true },
  from_date: { type: String, required: true }, // YYYY-MM-DD
  to_date: { type: String, required: true }, // YYYY-MM-DD
  days: { type: Number, required: true },
  reason: { type: String, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  reviewed_by: { type: Types.ObjectId, ref: 'User', default: null },
  reviewed_at: { type: Date, default: null },
  created_at: { type: Date, default: () => new Date() },
})

export type LeaveRequestDoc = InferSchemaType<typeof leaveRequestSchema>
export const LeaveRequest = model('LeaveRequest', leaveRequestSchema)
