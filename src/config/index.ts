import _ from "lodash"

export const SERVER_PORT = _.toInteger(process.env.SERVER_PORT) || 3000

export const LOG_LEVEL = process.env.LOG_LEVEL || "info"

export const CACHE_PROVIDER = process.env.CACHE_PROVIDER || "none"
export const CACHE_DURATION = _.toInteger(process.env.CACHE_DURATION) || 1000 * 3600 * 24 * 7

export const S3_ENDPOINT = process.env.S3_ENDPOINT
export const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
export const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY
export const S3_BUCKET = process.env.S3_BUCKET

export const SUPABASE_URL = process.env.SUPABASE_URL
export const SUPABASE_KEY = process.env.SUPABASE_KEY
export const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET

export const MONGO_URL = process.env.MONGO_URL
export const MONGO_COLLECTION = process.env.MONGO_COLLECTION
