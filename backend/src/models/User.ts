import { Schema, model, type InferSchemaType } from 'mongoose'

export const ROLES = ['super_admin', 'hr_admin', 'account_manager', 'reporting_manager', 'employee'] as const
export type Role = (typeof ROLES)[number]

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password_hash: { type: String, required: true },
    full_name: { type: String, required: true },
    client_company: { type: String, required: true, default: 'J2W Business Solutions' },
    roles: { type: [String], enum: ROLES, default: ['employee'] },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type UserDoc = InferSchemaType<typeof userSchema>
export const User = model('User', userSchema)
