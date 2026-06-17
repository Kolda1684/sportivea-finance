import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { createAdminSupabaseClient } from './supabase-server'
import { queryAllPages, getTitle, getRichText, getSelect, getNumber, getDate, getRelationIds } from './notion'

const TASKS_DB_ID = () => process.env.NOTION_TASKS_DB_ID
const COMPANIES_DB_ID = () => process.env.NOTION_COMPANIES_DB_ID

// ── Status mapování ──────────────────────────────────────────────────────────

const NOTION_STATUS_TO_DB: Record<string, 'zadano' | 'v_procesu' | 'na_checku' | 'hotovo'> = {
  'Zadáno':       'zadano',
  'Zadano':       'zadano',
  'V procesu':    'v_procesu',
  'V Procesu':    'v_procesu',
  'Na checku':    'na_checku',
  'Na Checku':    'na_checku',
  'Hotovo':       'hotovo',
}

function mapTaskStatus(s: string | null): 'zadano' | 'v_procesu' | 'na_checku' | 'hotovo' {
  if (!s) return 'zadano'
  return NOTION_STATUS_TO_DB[s] ?? 'zadano'
}

function mapCompanyStatus(s: string | null): string {
  if (!s) return 'active'
  return s.toLowerCase()
}

// Měsíc — Notion formula vrací "M,YYYY" string nebo datum. Pokud datum, převod.
function normalizeMonth(value: string | null): string | null {
  if (!value) return null
  if (/^\d{1,2},\d{4}$/.test(value)) return value  // už správný formát
  // Pokud datum YYYY-MM-DD nebo YYYY-MM
  const m = value.match(/^(\d{4})-(\d{2})/)
  if (m) return `${parseInt(m[2])},${m[1]}`
  return null
}

// ── Companies ────────────────────────────────────────────────────────────────

export interface CompanyMapped {
  notion_page_id: string
  name: string
  status: string
  ico: string | null
  primary_contact_name: string | null
}

export function mapCompany(page: PageObjectResponse): CompanyMapped | null {
  const props = page.properties
  const name = getTitle(props['Jméno']) ?? getTitle(props['Name']) ?? getTitle(props['Task name'])
  if (!name) return null

  return {
    notion_page_id: page.id,
    name,
    status: mapCompanyStatus(getSelect(props['Status'])),
    ico: getRichText(props['IČO']) ?? getRichText(props['ICO']),
    primary_contact_name: getRichText(props['Kontaktní osoba']) ?? getRichText(props['Kontakt']),
  }
}

export async function syncCompanyPage(page: PageObjectResponse): Promise<{ id: string; created: boolean } | null> {
  const mapped = mapCompany(page)
  if (!mapped) return null

  const supabase = createAdminSupabaseClient()

  // Existující companies pod tímto notion_page_id
  const { data: existing } = await supabase
    .from('companies')
    .select('id')
    .eq('notion_page_id', mapped.notion_page_id)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('companies')
      .update({
        name: mapped.name,
        status: mapped.status,
        ico: mapped.ico,
        primary_contact_name: mapped.primary_contact_name,
        notion_last_synced: new Date().toISOString(),
      })
      .eq('id', existing.id)
    return { id: existing.id, created: false }
  }

  // Fallback: existující companies podle name (pokud uživatel zadal ručně před Notion sync)
  const { data: byName } = await supabase
    .from('companies')
    .select('id')
    .eq('name', mapped.name)
    .is('notion_page_id', null)
    .maybeSingle()

  if (byName) {
    await supabase
      .from('companies')
      .update({
        notion_page_id: mapped.notion_page_id,
        status: mapped.status,
        ico: mapped.ico,
        primary_contact_name: mapped.primary_contact_name,
        notion_last_synced: new Date().toISOString(),
      })
      .eq('id', byName.id)
    return { id: byName.id, created: false }
  }

  // Vytvořit nový
  const { data: inserted, error } = await supabase
    .from('companies')
    .insert({
      name: mapped.name,
      status: mapped.status,
      ico: mapped.ico,
      primary_contact_name: mapped.primary_contact_name,
      notion_page_id: mapped.notion_page_id,
      notion_last_synced: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !inserted) throw new Error(`Insert company selhal: ${error?.message ?? 'unknown'}`)
  return { id: inserted.id, created: true }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskMapped {
  notion_page_id: string
  title: string
  description: string | null
  deadline: string | null
  status: 'zadano' | 'v_procesu' | 'na_checku' | 'hotovo'
  task_type: string | null
  hours: number | null
  minutes: number | null
  one_time_reward: number | null
  reward: number | null
  month: string | null
  notion_company_page_ids: string[]
}

export function mapTask(page: PageObjectResponse): TaskMapped | null {
  const props = page.properties
  const title = getTitle(props['Task']) ?? getTitle(props['Task name']) ?? getTitle(props['Name'])
  if (!title) return null

  // Description: hledá různé možné názvy
  const description =
    getRichText(props['Stav']) ??
    getRichText(props['Description']) ??
    getRichText(props['Popis'])

  // Reward (Formula nebo Number)
  let reward: number | null = null
  const rewardProp = props['Odměna'] ?? props['Odmena']
  if (rewardProp) {
    if (rewardProp.type === 'number') reward = rewardProp.number
    else if (rewardProp.type === 'formula' && rewardProp.formula.type === 'number') reward = rewardProp.formula.number
  }

  // Měsíc: Formula vrací string nebo datum
  let monthRaw: string | null = null
  const monthProp = props['Měsíc'] ?? props['Mesic'] ?? props['Month']
  if (monthProp) {
    if (monthProp.type === 'formula') {
      const f = monthProp.formula
      if (f.type === 'string') monthRaw = f.string
      else if (f.type === 'date') monthRaw = f.date?.start ?? null
    } else if (monthProp.type === 'rich_text') {
      monthRaw = getRichText(monthProp)
    }
  }

  return {
    notion_page_id: page.id,
    title,
    description,
    deadline: getDate(props['Deadline']) ?? getDate(props['Due Date']),
    status: mapTaskStatus(getSelect(props['Status'])),
    task_type: getSelect(props['Typ']) ?? getSelect(props['Type']),
    hours: getNumber(props['Hodiny']) ?? getNumber(props['Hod.']) ?? getNumber(props['Hours']),
    minutes: getNumber(props['Min.']) ?? getNumber(props['Minutes']),
    one_time_reward: getNumber(props['Jednorázová odměna']) ?? getNumber(props['Jednor.']),
    reward,
    month: normalizeMonth(monthRaw),
    notion_company_page_ids: getRelationIds(props['Klient']) ?? getRelationIds(props['Klienti']),
  }
}

export async function syncTaskPage(page: PageObjectResponse): Promise<{ id: string; created: boolean } | null> {
  const mapped = mapTask(page)
  if (!mapped) return null

  const supabase = createAdminSupabaseClient()

  // Resolve company_id from notion_page_id (potřebujeme Companies syncnut první)
  let company_id: string | null = null
  let client_name: string | null = null
  if (mapped.notion_company_page_ids.length > 0) {
    const { data: company } = await supabase
      .from('companies')
      .select('id, name')
      .eq('notion_page_id', mapped.notion_company_page_ids[0])
      .maybeSingle()
    if (company) {
      company_id = company.id
      client_name = company.name
    }
  }

  const row = {
    title: mapped.title,
    description: mapped.description,
    deadline: mapped.deadline,
    status: mapped.status,
    task_type: mapped.task_type,
    hours: mapped.hours ?? 0,
    minutes: mapped.minutes ?? 0,
    one_time_reward: mapped.one_time_reward,
    reward: mapped.reward,
    month: mapped.month,
    company_id,
    client: client_name,
    notion_page_id: mapped.notion_page_id,
    notion_last_synced: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('notion_page_id', mapped.notion_page_id)
    .maybeSingle()

  if (existing) {
    await supabase.from('tasks').update(row).eq('id', existing.id)
    return { id: existing.id, created: false }
  }

  const { data: inserted, error } = await supabase
    .from('tasks')
    .insert(row)
    .select('id')
    .single()

  if (error || !inserted) throw new Error(`Insert task selhal: ${error?.message ?? 'unknown'}`)
  return { id: inserted.id, created: true }
}

// ── Bulk sync helpers ────────────────────────────────────────────────────────

export async function bulkSyncCompanies(since?: Date): Promise<{ created: number; updated: number; total: number }> {
  const dbId = COMPANIES_DB_ID()
  if (!dbId) throw new Error('Chybí NOTION_COMPANIES_DB_ID')

  const pages = await queryAllPages(dbId, since)
  let created = 0, updated = 0
  for (const page of pages) {
    const res = await syncCompanyPage(page)
    if (res?.created) created++
    else if (res) updated++
  }
  return { created, updated, total: pages.length }
}

export async function bulkSyncTasks(since?: Date): Promise<{ created: number; updated: number; total: number }> {
  const dbId = TASKS_DB_ID()
  if (!dbId) throw new Error('Chybí NOTION_TASKS_DB_ID')

  const pages = await queryAllPages(dbId, since)
  let created = 0, updated = 0
  for (const page of pages) {
    const res = await syncTaskPage(page)
    if (res?.created) created++
    else if (res) updated++
  }
  return { created, updated, total: pages.length }
}

export function getTasksDbId(): string | null {
  return TASKS_DB_ID() ?? null
}

export function getCompaniesDbId(): string | null {
  return COMPANIES_DB_ID() ?? null
}
