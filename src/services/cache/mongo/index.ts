import { MongoClient, ServerApiVersion } from "mongodb"
import { PageSnapshot } from "../../types"
import { Cache, CacheValue, cacheDuraiton } from "../common"
import { MONGO_URL, MONGO_COLLECTION } from "../../../config"

export default class MongoCache implements Cache {
  private client: MongoClient
  private collection: string
  private isConnected = false

  constructor() {
    if (!MONGO_URL) {
      throw new Error("Missing env variable MONGO_URL")
    }
    if (!MONGO_COLLECTION) {
      throw new Error("Missing env variable MONGO_COLLECTION")
    }
    this.client = new MongoClient(MONGO_URL, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    })
    this.collection = MONGO_COLLECTION
  }

  private async connect(): Promise<void> {
    if (!this.isConnected) {
      this.client.connect()
      this.isConnected = true
    }
  }

  async get(key: string): Promise<CacheValue | null> {
    await this.connect()
    const coll = this.client.db().collection(this.collection)
    return await coll.findOne<CacheValue>({ urlDigest: key })
  }

  async save(url: string, key: string, snapshot: PageSnapshot): Promise<void> {
    await this.connect()
    const now = Date.now()
    const value: CacheValue = {
      url,
      createdAt: now,
      expireAt: now.valueOf() + cacheDuraiton,
      urlDigest: key,
      snapshot: { ...snapshot },
    }
    const coll = this.client.db().collection(this.collection)
    await coll.updateOne({ urlDigest: key }, { $set: value }, { upsert: true })
  }

  async remove(key: string): Promise<void> {
    await this.connect()
    const coll = this.client.db().collection(this.collection)
    await coll.deleteMany({ urlDigest: key })
  }
}
