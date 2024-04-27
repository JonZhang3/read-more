declare module "turndown-plugin-gfm" {
  import type { Plugin } from "turndown"
  const gfm: Plugin
  const highlightedCodeBlock: Plugin
  const strikethrough: Plugin
  const tables: Plugin
  const taskListItems: Plugin
  export { gfm, highlightedCodeBlock, strikethrough, tables, taskListItems }
}
