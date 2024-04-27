import { z } from "zod"
import { toBoolean } from "./utils"

export interface ImgBrief {
  src: string
  loaded: boolean
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
  alt?: string
}

export interface ReadabilityParsed {
  title: string
  content: string
  textContent: string
  length: number
  excerpt: string
  byline: string
  dir: string
  siteName: string
  lang: string
  publishedTime: string
}

export interface PageSnapshot {
  title: string
  href: string
  html: string
  text: string
  parsed?: Partial<ReadabilityParsed> | null
  screenshot?: string
  imgs?: ImgBrief[]
}

export enum PuppeteerControlStatus {
  NEW = "NEW",
  READY = "READY",
  ERROR = "ERROR",
  DISCONNECTED = "DISCONNECTED",
}

export const ScrapOptionsSchema = z.object({
  url: z.string(),
  useScreenshot: z.string().optional().default("false").transform(toBoolean),
  useCache: z.string().optional().default("false").transform(toBoolean),
  markdown: z.string().optional().default("true").transform(toBoolean),
})

export type ScrapOptions = Omit<z.infer<typeof ScrapOptionsSchema>, "url">

export class FormattedContent {
  title: string
  url: string
  content: string
  publishedTime?: string
  screenshot?: string

  constructor(title: string, url: string, content: string, publishedTime?: string) {
    this.title = title
    this.url = url
    this.content = content
    this.publishedTime = publishedTime
  }

  toString() {
    const mixins = []
    if (this.publishedTime) {
      mixins.push(`Published Time: ${this.publishedTime}`)
    }
    return `Title: ${this.title}

URL Source: ${this.url}
${mixins.length ? `\n${mixins.join("\n\n")}\n` : ""}
Markdown Content:
${this.content}
`
  }
}
