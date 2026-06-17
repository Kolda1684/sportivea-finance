import { Client, iteratePaginatedAPI } from '@notionhq/client'
import type {
  PageObjectResponse,
  QueryDataSourceResponse,
} from '@notionhq/client/build/src/api-endpoints'

let cachedClient: Client | null = null

// SDK v5: databáze má jednu nebo více data sources. Mapování database_id → data_source_id cachujeme.
const dataSourceCache = new Map<string, string>()

export function notionClient(): Client {
  if (cachedClient) return cachedClient
  const token = process.env.NOTION_API_TOKEN
  if (!token) throw new Error('Chybí NOTION_API_TOKEN')
  cachedClient = new Client({ auth: token })
  return cachedClient
}

export function isFullPage(p: QueryDataSourceResponse['results'][number]): p is PageObjectResponse {
  return 'properties' in p
}

// Najde data_source_id pro databázové ID (uživatel dává database_id z URL).
// V5 SDK potřebuje data_source_id pro query.
export async function resolveDataSourceId(databaseId: string): Promise<string> {
  const cached = dataSourceCache.get(databaseId)
  if (cached) return cached

  const notion = notionClient()
  const db = await notion.databases.retrieve({ database_id: databaseId })
  const sources = (db as unknown as { data_sources?: { id: string }[] }).data_sources
  if (!sources || sources.length === 0) {
    throw new Error(`Database ${databaseId} nemá žádné data sources`)
  }
  const id = sources[0].id
  dataSourceCache.set(databaseId, id)
  return id
}

// Vyhledat všechny stránky v databázi, paginated, s volitelným incremental filterem.
export async function queryAllPages(databaseId: string, since?: Date): Promise<PageObjectResponse[]> {
  const notion = notionClient()
  const dataSourceId = await resolveDataSourceId(databaseId)
  const pages: PageObjectResponse[] = []

  const filter = since
    ? { timestamp: 'last_edited_time' as const, last_edited_time: { on_or_after: since.toISOString() } }
    : undefined

  for await (const item of iteratePaginatedAPI(notion.dataSources.query, {
    data_source_id: dataSourceId,
    ...(filter ? { filter } : {}),
  })) {
    if (isFullPage(item)) pages.push(item)
  }
  return pages
}

export async function retrievePage(pageId: string): Promise<PageObjectResponse | null> {
  const notion = notionClient()
  try {
    const p = await notion.pages.retrieve({ page_id: pageId })
    if ('properties' in p) return p as PageObjectResponse
    return null
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 404) return null
    throw e
  }
}

// ── Property extractors ──────────────────────────────────────────────────────

type Prop = PageObjectResponse['properties'][string]

export function getTitle(prop: Prop | undefined): string | null {
  if (!prop || prop.type !== 'title') return null
  return prop.title.map(t => t.plain_text).join('').trim() || null
}

export function getRichText(prop: Prop | undefined): string | null {
  if (!prop || prop.type !== 'rich_text') return null
  return prop.rich_text.map(t => t.plain_text).join('').trim() || null
}

export function getSelect(prop: Prop | undefined): string | null {
  if (!prop || prop.type !== 'select') return null
  return prop.select?.name ?? null
}

export function getNumber(prop: Prop | undefined): number | null {
  if (!prop || prop.type !== 'number') return null
  return prop.number
}

export function getDate(prop: Prop | undefined): string | null {
  if (!prop || prop.type !== 'date') return null
  return prop.date?.start ?? null
}

export function getRelationIds(prop: Prop | undefined): string[] {
  if (!prop || prop.type !== 'relation') return []
  return prop.relation.map(r => r.id)
}

export function getFormulaString(prop: Prop | undefined): string | null {
  if (!prop || prop.type !== 'formula') return null
  const f = prop.formula
  if (f.type === 'string') return f.string?.trim() || null
  if (f.type === 'number') return f.number != null ? String(f.number) : null
  if (f.type === 'date') return f.date?.start ?? null
  if (f.type === 'boolean') return f.boolean != null ? String(f.boolean) : null
  return null
}

export function getFormulaNumber(prop: Prop | undefined): number | null {
  if (!prop || prop.type !== 'formula') return null
  const f = prop.formula
  if (f.type === 'number') return f.number
  if (f.type === 'string' && f.string) {
    const n = parseFloat(f.string.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}
