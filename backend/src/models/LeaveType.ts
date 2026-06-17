import { Schema, model, type InferSchemaType } from 'mongoose'

const leaveTypeSchema = new Schema({
  code: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  days_per_year: { type: Number, required: true, default: 0 },
  is_paid: { type: Boolean, required: true, default: true },
})

export type LeaveTypeDoc = InferSchemaType<typeof leaveTypeSchema>
export const LeaveType = model('LeaveType', leaveTypeSchema)
