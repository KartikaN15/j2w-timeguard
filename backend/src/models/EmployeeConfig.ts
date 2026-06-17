import { Schema, model, Types, type InferSchemaType } from 'mongoose'

const DEFAULT_SCHEDULE = { mon: 'WFO', tue: 'WFO', wed: 'WFO', thu: 'WFO', fri: 'WFO', sat: 'OFF', sun: 'OFF' }

const employeeConfigSchema = new Schema(
  {
    user_id: { type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    office_lat: { type: Number, default: null },
    office_lng: { type: Number, default: null },
    office_radius_m: { type: Number, default: 150 },
    home_lat: { type: Number, default: null },
    home_lng: { type: Number, default: null },
    home_radius_m: { type: Number, default: 200 },
    weekly_schedule: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_SCHEDULE }) },
  },
  { timestamps: { createdAt: false, updatedAt: 'updated_at' } },
)

export type EmployeeConfigDoc = InferSchemaType<typeof employeeConfigSchema>
export const EmployeeConfig = model('EmployeeConfig', employeeConfigSchema)
