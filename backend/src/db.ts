import mongoose from 'mongoose'
import { config } from './config.js'

export async function connectDb(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true)
  await mongoose.connect(config.mongoUri)
  console.log('[db] Connected to MongoDB')
  return mongoose
}
