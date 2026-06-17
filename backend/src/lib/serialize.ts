import { Types } from 'mongoose'

// Converts a Mongo value to a JSON-friendly client value:
//  - ObjectId  -> hex string
//  - Date      -> ISO string
function toClientValue(v: unknown): unknown {
  if (v instanceof Types.ObjectId) return v.toString()
  if (v instanceof Date) return v.toISOString()
  return v
}

// Maps a Mongoose document (or lean object) to a plain client object,
// renaming `_id` -> `id` and stringifying ObjectIds / Dates.
export function serialize<T extends Record<string, any>>(doc: T): Record<string, any> {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__v') continue
    if (key === '_id') {
      out.id = toClientValue(value)
      continue
    }
    out[key] = toClientValue(value)
  }
  return out
}
