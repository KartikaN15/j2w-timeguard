import { Schema, model, type InferSchemaType } from 'mongoose'

// Single-document collection for shared office settings (mirrors the
// single-row Postgres `company_config` table).
const companyConfigSchema = new Schema(
  {
    office_name: { type: String, required: true, default: 'J2W Office' },
    office_lat: { type: Number, default: null },
    office_lng: { type: Number, default: null },
    office_radius_m: { type: Number, default: 1000 },
    shift_start: { type: String, default: '09:30' },
    late_threshold_min: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: 'updated_at' } },
)

export type CompanyConfigDoc = InferSchemaType<typeof companyConfigSchema>
export const CompanyConfig = model('CompanyConfig', companyConfigSchema)

// Returns the singleton config document, creating it on first access.
export async function getCompanyConfigDoc() {
  let doc = await CompanyConfig.findOne()
  if (!doc) doc = await CompanyConfig.create({})
  return doc
}
