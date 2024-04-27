import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { Cache, CacheValue, cacheDuraiton } from "../common"
import { PageSnapshot } from "../../types"
import logger from "../../logger"
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET } from "../../../config"

export default class SupabaseCache implements Cache {
  private client: SupabaseClient
  private bucket: string
  constructor() {
    if (!SUPABASE_URL) {
      throw new Error("Missing env variable SUPABASE_URL")
    }
    if (!SUPABASE_KEY) {
      throw new Error("Missing env variable SUPABASE_ANON_KEY")
    }
    if (!SUPABASE_BUCKET) {
      throw new Error("Missing env variable SUPABASE_BUCKET")
    }
    this.bucket = SUPABASE_BUCKET
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY)
  }

  async get(key: string): Promise<CacheValue | null> {
    const { data, error } = await this.client.storage.from(this.bucket).download(`${key}.json`)
    if (error) {
      logger.warn("Failed to fetch snapshot from cache", error)
      return null
    }
    if (!data) {
      return null
    }
    return JSON.parse(await data.text())
  }

  async save(url: string, key: string, snapshot: PageSnapshot): Promise<void> {
    const now = Date.now()
    const value: CacheValue = {
      url,
      createdAt: now,
      expireAt: now + cacheDuraiton,
      urlDigest: key,
      snapshot: { ...snapshot },
    }
    const { error } = await this.client.storage.from(this.bucket).upload(`${key}.json`, JSON.stringify(value), {
      contentType: "application/json;charset=UTF-8",
      upsert: true,
    })
    if (error) {
      throw error
    }
  }

  async remove(key: string): Promise<void> {
    this.client.storage.from(this.bucket).remove([`${key}.json`])
  }
}
