import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { createAdminSupabaseClient } from './supabase-server'
import { queryAllPages, getTitle, getRichText, getSelect, getNumber, getDate, getRelationIds } from './notion'

type Prop = PageObjectResponse['properties'][string]

// Notion properties mají často emoji prefixy ("💰 Odměna", "⌛Hodiny", "👔 Klienti").
// Porovnáváme názvy bez emoji/interpunkce, case-insensitive.
function normalizePropName(s: string): string {
  return s
    .replace(/[\uD800-\uDFFF\u2000-\u33FF\uFE0F]/g, '') // emoji a symboly (⌛, 💰, 👔…)
    .replace(/[.,/#!$%^&*;:{}=\-_'"`~()?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function findProp(
  props: PageObjectResponse['properties'],
  names: string[],
  type?: Prop['type']
): Prop | undefined {
  const byName = new Map<string, Prop[]>()
  for (const [key, value] of Object.entries(props)) {
    const norm = normalizePropName(key)
    const list = byName.get(norm) ?? []
    list.push(value)
    byName.set(norm, list)
  }
  for (const name of names) {
    const candidates = byName.get(normalizePropName(name)) ?? []
    const match = candidates.find(p => !type || p.type === type)
    if (match) return match
  }
  return undefined
}

const COMPANIES_DB_ID = () => process.env.NOTION_COMPANIES_DB_ID

interface EmployeeDb {
  team_member: string
  notion_database_id: string
}

async function loadActiveEmployeeDbs(): Promise<EmployeeDb[]> {
  const supabase = createAdminSupabaseClient()
  const { data } = await supabase
    .from('notion_employee_databases')
    .select('team_member, notion_database_id')
    .eq('active', true)
  return (data ?? []) as EmployeeDb[]
}

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
  const name = getTitle(findProp(props, ['Jméno', 'Name', 'Task name'], 'title'))
  if (!name) return null

  return {
    notion_page_id: page.id,
    name,
    status: mapCompanyStatus(getSelect(findProp(props, ['Status', 'Stav']))),
    ico: getRichText(findProp(props, ['IČO', 'ICO'], 'rich_text')),
    primary_contact_name: getRichText(findProp(props, ['Kontaktní osoba', 'Kontakt'], 'rich_text')),
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

// ── Tasks → variable_costs ───────────────────────────────────────────────────

export interface TaskMapped {
  notion_page_id: string
  task_name: string
  task_type: string | null
  hours: number | null
  price: number | null            // = Odměna (final), fallback Jednorázová odměna
  date: string | null             // Deadline (kdy proběhlo)
  month: string | null
  notion_company_page_ids: string[]
  status: string | null           // Notion Status (Hotovo / In Progress / …)
  isVacation: boolean             // kategorie "dovolená" — nikdy nejde do nákladů
}

// Task se do nákladů dostane až když je hotový — jinak není relevantní.
// Většina lidí značí "Hotovo", Daniel Richtr používá "Archived" (= dokončeno a založeno).
const DONE_STATUSES = new Set(['hotovo', 'done', 'completed', 'dokončeno', 'archived', 'archivováno'])
export function isTaskDone(status: string | null): boolean {
  if (!status) return false
  return DONE_STATUSES.has(status.trim().toLowerCase())
}

export function mapTask(page: PageObjectResponse): TaskMapped | null {
  const props = page.properties
  const task_name = getTitle(findProp(props, ['Task', 'Task name', 'Name'], 'title'))
  if (!task_name) return null

  // Odměna: Formula vrátí finální cenu (Jednorázová + Hodiny*sazba apod.)
  let finalReward: number | null = null
  const rewardProp = findProp(props, ['Odměna', 'Odmena'])
  if (rewardProp) {
    if (rewardProp.type === 'number') finalReward = rewardProp.number
    else if (rewardProp.type === 'formula' && rewardProp.formula.type === 'number') finalReward = rewardProp.formula.number
  }
  const oneTime = getNumber(findProp(props, ['Jednorázová odměna', 'Jednor.'], 'number'))
  // Pokud Odměna formula nevrátí číslo, použít jednorázovou
  const price = (finalReward != null && finalReward > 0) ? finalReward : oneTime

  // Hodiny + minuty → desetinné hodiny
  const hoursRaw = getNumber(findProp(props, ['Hodiny', 'Hod.', 'Hours'], 'number'))
  const minutesRaw = getNumber(findProp(props, ['Minuty', 'Min.', 'Minutes'], 'number'))
  const hours = hoursRaw != null || minutesRaw != null
    ? Math.round(((hoursRaw ?? 0) + (minutesRaw ?? 0) / 60) * 100) / 100
    : null

  // Měsíc: Formula
  let monthRaw: string | null = null
  const monthProp = findProp(props, ['Měsíc', 'Mesic', 'Month'])
  if (monthProp) {
    if (monthProp.type === 'formula') {
      const f = monthProp.formula
      if (f.type === 'string') monthRaw = f.string
      else if (f.type === 'date') monthRaw = f.date?.start ?? null
    } else if (monthProp.type === 'rich_text') {
      monthRaw = getRichText(monthProp)
    }
  }

  const typeProp = findProp(props, ['Typ', 'Type'])
  const task_type = getSelect(typeProp) ?? getRichText(typeProp)

  // Relace na klienty: property musí být typu relation ("Klient" bývá i rich_text)
  const clientRelation = findProp(props, ['Klient', 'Klienti'], 'relation')

  // Status — status property, fallback rich_text "Stav"
  const status = getSelect(findProp(props, ['Status', 'Stav'])) ?? getRichText(findProp(props, ['Stav'], 'rich_text'))

  // Dovolená / osobní: select 🎬/📽️/🖼️ (kategorie tasku) → není to práce,
  // do nákladů nepatří. Název sloupce je jen emoji, proto hledáme podle typu a hodnoty.
  const SKIP_CATEGORIES = new Set(['dovolena', 'osobni'])
  const isVacation = Object.values(props).some(p => {
    if (p.type !== 'select' || !p.select?.name) return false
    return SKIP_CATEGORIES.has(p.select.name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  })

  return {
    notion_page_id: page.id,
    task_name,
    task_type,
    hours,
    price,
    date: getDate(findProp(props, ['Deadline', 'Due Date'], 'date')),
    month: normalizeMonth(monthRaw),
    notion_company_page_ids: getRelationIds(clientRelation),
    status,
    isVacation,
  }
}

export async function syncTaskPage(page: PageObjectResponse, teamMember: string): Promise<{ id: string; created: boolean; deleted?: boolean } | null> {
  const mapped = mapTask(page)
  if (!mapped) return null

  const supabase = createAdminSupabaseClient()

  const { data: existing } = await supabase
    .from('variable_costs')
    .select('id, client')
    .eq('notion_page_id', mapped.notion_page_id)
    .maybeSingle()

  // Dovolená / osobní: není to práce — nikdy neukládat, existující smazat.
  if (mapped.isVacation) {
    if (existing) {
      await supabase.from('variable_costs').delete().eq('id', existing.id)
      return { id: existing.id, created: false, deleted: true }
    }
    return null
  }

  // Resolve client name z Companies tabulky (přes notion_page_id z relation)
  let client_name: string | null = null
  if (mapped.notion_company_page_ids.length > 0) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('notion_page_id', mapped.notion_company_page_ids[0])
      .maybeSingle()
    if (company) client_name = company.name
  }

  // Ukládají se všechny tasky (pipeline); do nákladů se počítají jen is_done.
  const done = isTaskDone(mapped.status)
  const row: Record<string, unknown> = {
    task_name: mapped.task_name,
    client: client_name,
    hours: mapped.hours,
    price: mapped.price,
    task_type: mapped.task_type,
    date: mapped.date,
    month: mapped.month,
    team_member: teamMember,
    notion_page_id: mapped.notion_page_id,
    notion_last_synced: new Date().toISOString(),
    is_done: done,
    status: mapped.status,
  }

  if (existing) {
    // Klienta z Notionu přepiš jen když ho Notion má — jinak zachovej ručně doplněný.
    const update: Record<string, unknown> = { ...row }
    if (client_name == null) delete update.client
    let { error: updErr } = await supabase.from('variable_costs').update(update).eq('id', existing.id)
    // Fallback: sloupce is_done/status ještě neexistují (migrace 028)
    if (updErr && (updErr.message.includes('is_done') || updErr.message.includes('status'))) {
      delete update.is_done
      delete update.status
      if (!done) {
        // bez sloupců se nehotové chovají postaru — z nákladů pryč
        await supabase.from('variable_costs').delete().eq('id', existing.id)
        return { id: existing.id, created: false, deleted: true }
      }
      ;({ error: updErr } = await supabase.from('variable_costs').update(update).eq('id', existing.id))
    }
    if (updErr) throw new Error(`Update variable_cost selhal: ${updErr.message}`)
    return { id: existing.id, created: false }
  }

  let { data: inserted, error } = await supabase
    .from('variable_costs')
    .insert(row)
    .select('id')
    .single()

  // Fallback: sloupce is_done/status ještě neexistují (migrace 028)
  if (error && (error.message.includes('is_done') || error.message.includes('status'))) {
    if (!done) return null // postaru: nehotové se neukládají
    const stripped = { ...row }
    delete stripped.is_done
    delete stripped.status
    ;({ data: inserted, error } = await supabase.from('variable_costs').insert(stripped).select('id').single())
  }

  if (error || !inserted) throw new Error(`Insert variable_cost selhal: ${error?.message ?? 'unknown'}`)
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

export async function bulkSyncTasks(since?: Date): Promise<{ created: number; updated: number; total: number; perEmployee: { team_member: string; created: number; updated: number; total: number; error?: string }[] }> {
  const employees = await loadActiveEmployeeDbs()
  if (employees.length === 0) {
    throw new Error('Žádní zaměstnanci v notion_employee_databases — přidej je v /nastaveni/notion')
  }

  let created = 0, updated = 0, total = 0
  const perEmployee: { team_member: string; created: number; updated: number; total: number; error?: string }[] = []

  for (const emp of employees) {
    try {
      const pages = await queryAllPages(emp.notion_database_id, since)
      let c = 0, u = 0
      for (const page of pages) {
        const res = await syncTaskPage(page, emp.team_member)
        if (res?.deleted) continue
        if (res?.created) c++
        else if (res) u++
      }
      created += c
      updated += u
      total += pages.length
      perEmployee.push({ team_member: emp.team_member, created: c, updated: u, total: pages.length })
    } catch (e) {
      perEmployee.push({
        team_member: emp.team_member,
        created: 0,
        updated: 0,
        total: 0,
        error: e instanceof Error ? e.message : 'unknown',
      })
    }
  }

  return { created, updated, total, perEmployee }
}

// ── Cesťáky → variable_costs (task_type = "Cesťák") ──────────────────────────

const TRAVEL_DB_ID = () => process.env.NOTION_TRAVEL_DB_ID

// Cesťák je relevantní náklad, když je Schváleno nebo Zaplaceno.
// "Zadáno" = teprve podáno, "Zamítnuto" = zamítnuto → nezapočítávat.
function isTravelRelevant(status: string | null): boolean {
  if (!status) return false
  const s = status.trim().toLowerCase()
  return s === 'schváleno' || s === 'schvaleno' || s === 'zaplaceno'
}

export function mapTravel(page: PageObjectResponse): {
  notion_page_id: string
  purpose: string
  route: string | null
  person: string | null
  price: number | null
  date: string | null
  status: string | null
} | null {
  const props = page.properties
  const purpose = getTitle(findProp(props, ['Účel', 'Ucel', 'Name'], 'title'))
  if (!purpose) return null

  // Cena: formula, fallback jednorázová cena
  let price: number | null = null
  const priceProp = findProp(props, ['Cena'])
  if (priceProp) {
    if (priceProp.type === 'number') price = priceProp.number
    else if (priceProp.type === 'formula' && priceProp.formula.type === 'number') price = priceProp.formula.number
  }
  if (price == null) price = getNumber(findProp(props, ['Jednorázová cena', 'Jednorazova cena'], 'number'))

  // Jméno cestujícího — people property
  let person: string | null = null
  const personProp = findProp(props, ['Jméno', 'Jmeno'], 'people')
  if (personProp && personProp.type === 'people') {
    person = personProp.people.map(p => ('name' in p ? p.name : null)).filter(Boolean).join(', ') || null
  }

  return {
    notion_page_id: page.id,
    purpose,
    route: getRichText(findProp(props, ['Trasa'], 'rich_text')),
    person,
    price,
    date: getDate(findProp(props, ['Datum', 'Date'], 'date')),
    status: getSelect(findProp(props, ['Status', 'Stav'])),
  }
}

export async function syncTravelPage(page: PageObjectResponse): Promise<{ id: string; created: boolean; deleted?: boolean } | null> {
  const mapped = mapTravel(page)
  if (!mapped) return null

  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('variable_costs')
    .select('id, client')
    .eq('notion_page_id', mapped.notion_page_id)
    .maybeSingle()

  if (!isTravelRelevant(mapped.status)) {
    if (existing) {
      await supabase.from('variable_costs').delete().eq('id', existing.id)
      return { id: existing.id, created: false, deleted: true }
    }
    return null
  }

  // Název = účel + trasa (kam se jelo). Klienta Cesťáky nemají → nechává se prázdný
  // (zvýrazní se žlutě a lze ho doplnit ručně; ruční hodnota se při dalším syncu zachová).
  const task_name = mapped.route ? `${mapped.purpose} (${mapped.route})` : mapped.purpose

  const row = {
    task_name,
    hours: null,
    price: mapped.price,
    task_type: 'Cesťák',
    date: mapped.date,
    month: mapped.date ? normalizeMonth(mapped.date) : null,
    team_member: mapped.person,
    notion_page_id: mapped.notion_page_id,
    notion_last_synced: new Date().toISOString(),
  }

  if (existing) {
    await supabase.from('variable_costs').update(row).eq('id', existing.id)
    return { id: existing.id, created: false }
  }

  const { data: inserted, error } = await supabase
    .from('variable_costs')
    .insert({ ...row, client: null })
    .select('id')
    .single()

  if (error || !inserted) throw new Error(`Insert cesťák selhal: ${error?.message ?? 'unknown'}`)
  return { id: inserted.id, created: true }
}

export async function bulkSyncTravel(since?: Date): Promise<{ created: number; updated: number; deleted: number; total: number }> {
  const dbId = TRAVEL_DB_ID()
  if (!dbId) throw new Error('Chybí NOTION_TRAVEL_DB_ID')

  const pages = await queryAllPages(dbId, since)
  let created = 0, updated = 0, deleted = 0
  for (const page of pages) {
    const res = await syncTravelPage(page)
    if (res?.deleted) deleted++
    else if (res?.created) created++
    else if (res) updated++
  }
  return { created, updated, deleted, total: pages.length }
}

// Pro webhook: zjistit team_member podle Notion DB ID
export async function getTeamMemberForDb(notionDatabaseId: string): Promise<string | null> {
  const supabase = createAdminSupabaseClient()
  const cleanId = notionDatabaseId.replace(/-/g, '')
  const { data } = await supabase
    .from('notion_employee_databases')
    .select('team_member')
    .eq('notion_database_id', cleanId)
    .eq('active', true)
    .maybeSingle()
  return data?.team_member ?? null
}

export function getCompaniesDbId(): string | null {
  return COMPANIES_DB_ID() ?? null
}
