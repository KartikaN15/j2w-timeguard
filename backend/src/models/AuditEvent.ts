import { Schema, model, Types, type InferSchemaType } from 'mongoose'

// Append-only audit trail.
const auditEventSchema = new Schema({
  actor_id: { type: Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true },
  target: { type: String, default: null },
  payload: { type: Schema.Types.Mixed, default: {} },
  ts: { type: Date, default: () => new Date(), index: true },
})

export type AuditEventDoc = InferSchemaType<typeof auditEventSchema>
export const AuditEvent = model('AuditEvent', auditEventSchema)
