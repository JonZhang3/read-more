import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Cache, CacheValue, cacheDuraiton } from "../common"
import { PageSnapshot } from "../../types"
import { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } from "../../../config"

export default class S3Cache implements Cache {
  private client: S3Client
  private bucket: string

  constructor() {
    if (!S3_ENDPOINT) {
      throw new Error("Missing env variable S3_ENDPOINT")
    }
    if (!S3_ACCESS_KEY_ID) {
      throw new Error("Missing env variable S3_ACCESS_KEY_ID")
    }
    if (!S3_SECRET_ACCESS_KEY) {
      throw new Error("Missing env variable S3_SECRET_ACCESS_KEY")
    }
    if (!S3_BUCKET) {
      throw new Error("Missing env variable S3_BUCKET")
    }
    this.bucket = S3_BUCKET
    this.client = new S3Client({
      region: "auto",
      endpoint: S3_ENDPOINT,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    })
  }
  async get(key: string): Promise<CacheValue | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    const response = await this.client.send(command)
    const data = await response.Body?.transformToString()
    if (!data) {
      return null
    }
    return JSON.parse(data)
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
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json;charset=UTF-8",
    })
    await this.client.send(command)
  }

  async remove(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })
    await this.client.send(command)
  }
}
