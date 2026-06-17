import { Schema, model, Types, type InferSchemaType } from 'mongoose'

// Append-only: the API never updates or deletes these documents.
const attendanceEventSchema = new Schema({
  user_id: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  device_fingerprint: { type: String, default: null },
  event_type: { type: String, enum: ['punch_in', 'punch_out'], required: true },
  ts_utc: { type: Date, required: true, default: () => new Date(), index: true },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  accuracy_m: { type: Number, default: null },
  geofence_status: {
    type: String,
    enum: ['inside_office', 'inside_home', 'outside', 'no_config'],
    default: null,
  },
  ip_address: { type: String, default: null },
  mock_flag: { type: Boolean, default: false },
  selfie_path: { type: String, default: null },
  anomaly_flags: { type: [String], default: [] },
})

export type AttendanceEventDoc = InferSchemaType<typeof attendanceEventSchema>
export const AttendanceEvent = model('AttendanceEvent', attendanceEventSchema)
