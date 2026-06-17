import { Schema, model, Types, type InferSchemaType } from 'mongoose'

// Replaces the Postgres `user_devices` (approved) and `pending_devices` tables.
// A single collection distinguished by `status`.
const deviceSchema = new Schema(
  {
    user_id: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    fingerprint: { type: String, required: true },
    label: { type: String, default: null },
    user_agent: { type: String, default: null },
    status: { type: String, enum: ['approved', 'pending'], required: true, index: true },
    approved_at: { type: Date, default: null },
    approved_by: { type: Types.ObjectId, ref: 'User', default: null },
    requested_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } },
)

deviceSchema.index({ user_id: 1, fingerprint: 1 }, { unique: true })

export type DeviceDoc = InferSchemaType<typeof deviceSchema>
export const Device = model('Device', deviceSchema)
