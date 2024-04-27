import type { Browser, Page } from "puppeteer"
import GenericPool from "generic-pool"
import puppeteer from "puppeteer-extra"
import puppeteerStealth from "puppeteer-extra-plugin-stealth"
import puppeteerBlockResources from "puppeteer-extra-plugin-block-resources"
import fs from "node:fs"
import os from "node:os"
import md5 from "md5"
import { PuppeteerControlStatus, PageSnapshot, ScrapOptions, ImgBrief, FormattedContent } from "./types"
import logger from "./logger"
import TurndownService from "turndown"
import { tables } from "turndown-plugin-gfm"
import { cleanAttribute, tidyMarkdown } from "./utils"
import { getCache } from "./cache"

const READABILITY_JS = fs.readFileSync(require.resolve("@mozilla/readability/Readability.js"), "utf-8")

puppeteer.use(puppeteerStealth())
puppeteer.use(
  puppeteerBlockResources({
    blockedTypes: new Set(["media"]),
  })
)

class PuppeteerControl {
  private turnDownPlugins = [tables]
  private innerStatus: PuppeteerControlStatus = PuppeteerControlStatus.NEW
  private browser!: Browser
  private pagePool = GenericPool.createPool(
    {
      create: async () => {
        return await this.newPage()
      },
      destroy: async (page: Page) => {
        await page.browserContext().close()
      },
      validate: async (page: Page) => {
        return page.browser().connected && !page.isClosed()
      },
    },
    {
      max: Math.max(1 + Math.floor(os.freemem() / (1024 * 1024 * 1024)), 16),
      min: 1,
      acquireTimeoutMillis: 60_000,
      testOnBorrow: true,
      testOnReturn: true,
      autostart: false,
    }
  )

  constructor() {
    this.init()
  }

  private async init() {
    this.pagePool.start()

    if (this.browser) {
      if (this.browser.connected) {
        await this.browser.close()
      } else {
        this.browser.process()?.kill()
      }
    }
    this.browser = await puppeteer
      .launch({
        timeout: 10_000,
      })
      .catch((err) => {
        logger.error("Puppeteer browser launch failed.", err)
        this.innerStatus = PuppeteerControlStatus.ERROR
        return Promise.reject(err)
      })
    this.browser.once("disconnected", () => {
      logger.warn("Puppeteer browser disconnected.")
      this.innerStatus = PuppeteerControlStatus.DISCONNECTED
    })
    logger.info(`Pupeeteer browser launched: ${this.browser.process()?.pid}`)
    this.innerStatus = PuppeteerControlStatus.READY
  }

  private async newPage(): Promise<Page> {
    const context = await this.browser.createBrowserContext()
    const page = await context.newPage()
    const preparations = []
    preparations.push(page.setBypassCSP(true))
    preparations.push(page.setViewport({ width: 1024, height: 1024 }))
    preparations.push(
      page.exposeFunction("reportSnapshot", (snapshot: any) => {
        page.emit("snapshot", snapshot)
      })
    )
    preparations.push(page.evaluateOnNewDocument(READABILITY_JS))
    preparations.push(
      page.evaluateOnNewDocument(`
function briefImgs(elem) {
    const imageTags = Array.from((elem || document).querySelectorAll('img[src]'));

    return imageTags.map((x)=> ({
        src: x.src,
        loaded: x.complete,
        width: x.width,
        height: x.height,
        naturalWidth: x.naturalWidth,
        naturalHeight: x.naturalHeight,
        alt: x.alt || x.title,
    }));
}
function giveSnapshot() {
    let parsed;
    try {
        parsed = new Readability(document.cloneNode(true)).parse();
    } catch (err) {
        void 0;
    }

    const r = {
        title: document.title,
        href: document.location.href,
        html: document.documentElement.outerHTML,
        text: document.body.innerText,
        parsed: parsed,
        imgs: [],
    };
    if (parsed && parsed.content) {
        const elem = document.createElement('div');
        elem.innerHTML = parsed.content;
        r.imgs = briefImgs(elem);
    }

    return r;
}
`)
    )
    // preparations.push(
    //   page.evaluateOnNewDocument(() => {
    //     let aftershot: any
    //     const handlePageLoad = () => {
    //       if (document.readyState !== "complete" && document.readyState !== "interactive") {
    //         return
    //       }
    //       // @ts-expect-error
    //       const parsed = giveSnapshot()
    //       if (parsed) {
    //         // @ts-expect-error
    //         window.reportSnapshot(parsed)
    //       } else {
    //         if (aftershot) {
    //           clearTimeout(aftershot)
    //         }
    //         aftershot = setTimeout(() => {
    //           // @ts-expect-error
    //           window.reportSnapshot(giveSnapshot())
    //         }, 500)
    //       }
    //     }
    //     document.addEventListener("readystatechange", handlePageLoad)
    //     document.addEventListener("load", handlePageLoad)
    //   })
    // )

    await Promise.all(preparations)
    return page
  }

  get status() {
    return this.innerStatus
  }

  async crawl(url: string, options?: ScrapOptions): Promise<PageSnapshot | undefined> {
    const { useScreenshot = false, useCache = false } = options ?? {}
    let snapshot: PageSnapshot | undefined
    let screenshot: Buffer | undefined
    let digest: string | undefined

    if (useCache) {
      digest = this.getDeigest(url)
      snapshot = await this.crawlFromCache(digest)
      if (snapshot) {
        logger.debug(`Cache hit for ${url}`)
        return snapshot
      }
    }

    const page = await this.pagePool.acquire()
    let finalized = false

    const gotoPromise = page
      .goto(url, { waitUntil: ["load", "domcontentloaded", "networkidle0"], timeout: 30_000 })
      .catch((err) => {
        logger.error(`Browsing of ${url} failed.`, err)
        return Promise.reject(err)
      })
      .finally(async () => {
        finalized = true
        if (useScreenshot) {
          screenshot = await page.screenshot({ type: "jpeg", quality: 75 })
        }
        snapshot = (await page.evaluate("giveSnapshot()")) as PageSnapshot
        if (!snapshot.title || !snapshot.parsed?.content) {
          const salvaged = await this.salvage(url, page)
          if (salvaged) {
            if (useScreenshot) {
              screenshot = await page.screenshot({
                type: "jpeg",
                quality: 75,
              })
              snapshot = (await page.evaluate("giveSnapshot()")) as PageSnapshot
            }
          }
        }
        logger.info(`Snapshot of ${url} done`, { url, title: snapshot?.title, href: snapshot?.href })
        if (useCache) {
          try {
            await this.saveToCache(url, snapshot, digest)
          } catch (err) {
            logger.error("Failed to save cache", err)
          }
        }
      })

    try {
      while (true) {
        await gotoPromise
        if (finalized) {
          if (snapshot) {
            snapshot.screenshot = screenshot?.toString("base64")
            return snapshot
          }
          return undefined
        }
      }
    } finally {
      gotoPromise.finally(() => {
        // page.off("snapshot", hdl)
        this.pagePool.destroy(page).catch((err) => {
          logger.error(`Failed to destroy page`, err)
        })
      })
    }
  }

  private async crawlFromCache(digest: string): Promise<PageSnapshot | undefined> {
    const cache = getCache()
    if (!cache) {
      throw new Error("Cache not available, if you want to use cache, please check your configuration.")
    }
    let snapshot: PageSnapshot | undefined
    try {
      const cachedValue = await cache.get(digest)
      if (cachedValue && cachedValue.createdAt > Date.now() - 1000 * 300) {
        if (cachedValue.expireAt < Date.now()) {
          await cache.remove(digest)
          return undefined
        }
        snapshot = {
          ...cachedValue.snapshot,
        }
      }
    } catch (err) {
      logger.error("Failed to fetch snapshot from cache", err)
    }
    return snapshot
  }

  private async saveToCache(url: string, snapshot: PageSnapshot, key?: string): Promise<void> {
    const cache = getCache()
    if (!cache) {
      throw new Error("Cache not available, if you want to use cache, please check your configuration.")
    }
    if (!key) {
      key = this.getDeigest(url)
    }
    await cache.save(url, key, snapshot)
  }

  private getDeigest(url: string): string {
    const parsedUrl = new URL(url)
    parsedUrl.hash = ""
    return md5(parsedUrl.toString().toLowerCase())
  }

  private async salvage(url: string, page: Page) {
    logger.info(`Salvaging ${url}`)
    const googleArchiveUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`
    const resp = await fetch(googleArchiveUrl, {
      headers: {
        "User-Agent": `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)`,
      },
    })
    resp.body?.cancel().catch(() => void 0)
    if (!resp.ok) {
      logger.warn(`No salvation found for url: ${url}`, { status: resp.status, url })
      return null
    }
    await page
      .goto(googleArchiveUrl, { waitUntil: ["load", "domcontentloaded", "networkidle0"], timeout: 15_000 })
      .catch((err) => {
        logger.warn(`Page salvation did not fully succeed.`, err)
      })
    return true
  }

  async formatSnapshot(snapshot: PageSnapshot, nominalUrl?: string): Promise<FormattedContent> {
    const toBeTurnedToMd = snapshot.parsed?.content
    let turnDownService = new TurndownService()
    for (const plugin of this.turnDownPlugins) {
      turnDownService = turnDownService.use(plugin)
    }
    let contentText = ""
    if (toBeTurnedToMd) {
      const urlToAltMap: Record<string, string> = {}
      const genImageAltTextTasks = (snapshot.imgs || []).map(async (x) => {
        const r = await this.genImageAltText(x).catch((err: any) => {
          logger.warn(`Failed to get alt text for ${x.src}`, err)
          return "Image"
        })
        if (r && x.src) {
          urlToAltMap[x.src.trim()] = r
        }
      })
      await Promise.all(genImageAltTextTasks)
      let imgIdx = 0
      turnDownService.addRule("img-generated-alt", {
        filter: "img",
        replacement: (_content, node: any) => {
          const src = (node.getAttribute("src") || "").trim()
          const alt = cleanAttribute(node.getAttribute("alt"))
          if (!src) {
            return ""
          }
          const mapped = urlToAltMap[src]
          imgIdx++
          if (mapped) {
            return `![Image ${imgIdx}: ${mapped || alt}](${src})`
          }
          return `![Image ${imgIdx}: ${alt}](${src})`
        },
      })
      try {
        contentText = turnDownService.turndown(toBeTurnedToMd).trim()
      } catch (err) {
        logger.warn("Turndown failed to run, retrying without plugins", err)
        const vanillaTurnDownService = new TurndownService()
        try {
          contentText = vanillaTurnDownService.turndown(toBeTurnedToMd).trim()
        } catch (err2) {
          logger.warn("Turndown failed to run, giving up", err)
        }
      }
    }

    if (!contentText || (contentText.startsWith("<") && contentText.endsWith(">"))) {
      try {
        contentText = turnDownService.turndown(snapshot.html)
      } catch (err) {
        logger.warn("Turndown failed to run, retrying without plugins", err)
        const vanillaTurnDownService = new TurndownService()
        try {
          contentText = vanillaTurnDownService.turndown(snapshot.html).trim()
        } catch (err2) {
          logger.warn("Turndown failed to run, giving up", err)
        }
      }
    }
    if (!contentText || contentText.startsWith("<") || contentText.endsWith(">")) {
      contentText = snapshot.text
    }
    const cleanText = tidyMarkdown(contentText || "").trim()
    const formatted = new FormattedContent(
      (snapshot.parsed?.title || snapshot.title || "").trim(),
      nominalUrl || snapshot.href?.trim(),
      cleanText,
      snapshot.parsed?.publishedTime || undefined
    )

    return formatted
  }

  private async genImageAltText(img: ImgBrief): Promise<string> {
    // TODO use a better image alt text generator, like OpenAI's DALL-E
    return img.alt ?? "Image"
  }
}

const puppeteerControl = new PuppeteerControl()

export default puppeteerControl
