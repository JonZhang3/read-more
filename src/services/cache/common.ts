import _ from "lodash"
import { PageSnapshot } from "../types"
import { CACHE_DURATION } from "../../config"

export interface Cache {
  get(key: string): Promise<CacheValue | null>
  save(url: string, key: string, snapshot: PageSnapshot): Promise<void>
  remove(key: string): Promise<void>
}

export interface CacheValue {
  url: string
  createdAt: number
  expireAt: number
  urlDigest: string
  snapshot: PageSnapshot
}

export const cacheDuraiton = CACHE_DURATION

export type CacheProvider = "none" | "supabase" | "s3" | "mongo"
