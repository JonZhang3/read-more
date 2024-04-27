import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { validator } from "hono/validator"
import { ScrapOptionsSchema } from "./services/types"
import puppeteerControl from "./services/puppeteer"
import normalizeUrl from "@esm2cjs/normalize-url"
import logger from "./services/logger"
import _ from "lodash"
import { SERVER_PORT } from "./config"

const app = new Hono()

app.get(
  "/",
  validator("query", (value, c) => {
    const parsed = ScrapOptionsSchema.safeParse(value)
    if (!parsed.success) {
      return c.text("Invalid query parameters", 400)
    }
    return parsed.data
  }),
  async (c) => {
    const { url, useScreenshot = false, useCache = false, markdown = true } = c.req.valid("query")
    let urlToCrawl
    try {
      urlToCrawl = new URL(normalizeUrl(url, { stripWWW: false, removeTrailingSlash: false, removeSingleSlash: false }))
      if (urlToCrawl.protocol !== "http:" && urlToCrawl.protocol !== "https:") {
        logger.error(`Invalid protocol ${urlToCrawl.protocol}`, { url: url, urlToCrawl: urlToCrawl })
        return c.text(`Invalid protocol ${urlToCrawl.protocol}`, 400)
      }
    } catch (err) {
      logger.error("", err)
      return c.text(`${err}`, 400)
    }

    const result = await puppeteerControl.crawl(urlToCrawl.toString(), { useScreenshot, useCache, markdown })
    if (!result) {
      return c.text("Failed to crawl", 500)
    }
    const formatResult = await puppeteerControl.formatSnapshot(result, urlToCrawl.toString())
    formatResult.screenshot = result.screenshot
    return markdown ? c.text(formatResult.toString()) : c.json(formatResult)
  }
)

const port = SERVER_PORT
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
