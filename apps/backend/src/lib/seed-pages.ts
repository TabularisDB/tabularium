import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { db } from '$db'
import { markdownPages } from '$db/schema'
import { logger } from './logger'

const log = logger.child({ module: 'seed-pages' })
const SEED_DIR = resolve('./src/db/seeds/pages')

type PageFrontmatter = {
  path: string
  title: string
  showInFooter?: boolean
  navOrder?: number | null
}

type ParsedPage = PageFrontmatter & { slug: string; content: string }

function parseFile(slug: string, raw: string): ParsedPage {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) throw new Error(`${slug}: missing or malformed frontmatter`)
  const fm = parseYaml(match[1]) as Partial<PageFrontmatter>
  if (typeof fm.path !== 'string' || typeof fm.title !== 'string') {
    throw new Error(`${slug}: frontmatter must include path + title`)
  }
  return {
    slug,
    path: fm.path,
    title: fm.title,
    showInFooter: fm.showInFooter === true,
    navOrder: typeof fm.navOrder === 'number' ? fm.navOrder : null,
    content: match[2],
  }
}

async function loadAll(): Promise<ParsedPage[]> {
  const out: ParsedPage[] = []
  const glob = new Bun.Glob('*.md')
  for await (const file of glob.scan(SEED_DIR)) {
    const slug = file.replace(/\.md$/, '')
    const raw = await Bun.file(resolve(SEED_DIR, file)).text()
    out.push(parseFile(slug, raw))
  }
  return out
}

export async function seedDefaultPages(): Promise<{ inserted: number; skipped: number }> {
  const pages = await loadAll()
  let inserted = 0
  let skipped = 0
  for (const p of pages) {
    try {
      await db.insert(markdownPages).values({
        slug: p.slug,
        locale: 'en',
        path: p.path,
        title: p.title,
        content: p.content,
        published: 1,
        navOrder: p.navOrder ?? null,
        showInFooter: p.showInFooter ? 1 : 0,
      })
      inserted++
    } catch {
      skipped++
    }
  }
  log.info({ inserted, skipped, total: pages.length }, 'default pages seeded')
  return { inserted, skipped }
}
