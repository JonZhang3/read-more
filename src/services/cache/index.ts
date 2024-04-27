import { CacheProvider, Cache } from "./common"
import { CACHE_PROVIDER } from "../../config"

const provider: CacheProvider = (CACHE_PROVIDER as CacheProvider) || "none"

let cache: Cache | undefined

export function getCache(): Cache | undefined {
  if (!cache) {
    let cacheClass
    switch (provider) {
      case "supabase":
        cacheClass = require("./supabase").default
        break
      case "s3":
        cacheClass = require("./s3").default
        break
      case "mongo":
        cacheClass = require("./mongo").default
        break
    }
    if (cacheClass) {
      cache = new cacheClass()
    }
  }
  return cache
}
