import type { SupabaseClient } from '@supabase/supabase-js'

// Přiřazování řádků k projektu:
// - náklady: ruční přiřazení (variable_costs.project_id) NEBO klíčové slovo
//   v názvu tasku; ruční přiřazení k jinému projektu klíčové slovo přebíjí
// - příjmy: klíčové slovo v project_name / note / client
// - období projektu (date_from/date_to): řádek se filtruje podle date,
//   při chybějícím date podle měsíce ("M,YYYY")

export interface ProjectRow {
  id: string
  name: string
  client: string | null
  keywords: string
  date_from: string | null
  date_to: string | null
  active: boolean
  created_at: string
}

export interface ProjectCostRow {
  id: string
  team_member: string | null
  client: string | null
  task_name: string | null
  task_type: string | null
  date: string | null
  month: string | null
  hours: number | null
  price: number | null
  project_id?: string | null   // ruční přiřazení; má přednost před klíčovými slovy
}

export interface ProjectIncomeRow {
  client: string | null
  project_name: string | null
  amount: number | null
  date: string | null
  month: string | null
  status: string | null
  note: string | null
}

export function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map(k => k.trim().replace(/[%(),]/g, ''))
    .filter(k => k.length >= 2)
}

// Je řádek v období projektu? Bez date se bere první den měsíce "M,YYYY".
function inRange(date: string | null, month: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true
  let d = date
  if (!d && month) {
    const [m, y] = month.split(',')
    if (m && y) d = `${y}-${String(m).padStart(2, '0')}-01`
  }
  if (!d) return true // bez jakéhokoli data raději započítat než tiše vynechat
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export async function computeProjectStats(supabase: SupabaseClient, project: ProjectRow) {
  const keywords = parseKeywords(project.keywords)
  if (keywords.length === 0) {
    return {
      stats: { income: 0, costs: 0, travel: 0, profit: 0 },
      incomeRows: [], costRows: [],
      error: 'Klíčová slova jsou prázdná nebo příliš krátká (min. 2 znaky)',
    }
  }

  const costOr = keywords.map(k => `task_name.ilike.%${k}%`).join(',')
  const incomeOr = keywords
    .flatMap(k => [`project_name.ilike.%${k}%`, `note.ilike.%${k}%`, `client.ilike.%${k}%`])
    .join(',')

  const BASE_COLS = 'id, team_member, client, task_name, task_type, date, month, hours, price'
  // Dokud neproběhne migrace 032, sloupec project_id neexistuje — pak se jede
  // jen podle klíčových slov, místo aby projekt tiše ukázal nulu.
  const missingProjectColumn = (m?: string) => !!m && m.includes('project_id')

  const keywordQuery = (cols: string) => supabase
    .from('variable_costs').select(cols).eq('is_done', true).or(costOr)
    .order('date', { ascending: false })

  const [firstTry, assignedRes, incomeRes] = await Promise.all([
    keywordQuery(`${BASE_COLS}, project_id`),
    // Ručně přiřazené tasky — započítají se i bez shody klíčového slova
    supabase.from('variable_costs').select(`${BASE_COLS}, project_id`)
      .eq('is_done', true).eq('project_id', project.id)
      .order('date', { ascending: false }),
    supabase.from('income').select('client, project_name, amount, date, month, status, note')
      .or(incomeOr).order('date', { ascending: false }),
  ])

  const hasProjectColumn = !missingProjectColumn(firstTry.error?.message)
  const costsRes = hasProjectColumn ? firstTry : await keywordQuery(BASE_COLS)

  const error = [costsRes.error?.message, assignedRes.error?.message, incomeRes.error?.message]
    .find(m => m && !missingProjectColumn(m)) ?? null

  const byKeyword = ((costsRes.data ?? []) as unknown as ProjectCostRow[])
    // ruční přiřazení k jinému projektu přebíjí shodu klíčového slova
    .filter(r => r.project_id == null || r.project_id === project.id)
  const assigned = (assignedRes.data ?? []) as unknown as ProjectCostRow[]

  const seen = new Set<string>()
  const costRows = [...assigned, ...byKeyword]
    .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .filter(r => inRange(r.date, r.month, project.date_from, project.date_to))
  const incomeRows = ((incomeRes.data ?? []) as ProjectIncomeRow[])
    .filter(r => inRange(r.date, r.month, project.date_from, project.date_to))

  // Supabase vrací max 1000 řádků — u příliš širokého slova by součet tiše chyběl
  const truncated = costRows.length >= 1000 || incomeRows.length >= 1000

  const travel = costRows.filter(r => r.task_type === 'Cesťák').reduce((s, r) => s + (r.price ?? 0), 0)
  const work = costRows.filter(r => r.task_type !== 'Cesťák').reduce((s, r) => s + (r.price ?? 0), 0)
  const income = incomeRows.reduce((s, r) => s + (r.amount ?? 0), 0)

  return {
    stats: { income, costs: work + travel, travel, profit: income - work - travel },
    incomeRows,
    costRows,
    error: error ?? (truncated ? 'Klíčové slovo je příliš široké — zobrazeno jen prvních 1000 řádků, součet není úplný' : null),
  }
}
