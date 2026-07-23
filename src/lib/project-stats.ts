import type { SupabaseClient } from '@supabase/supabase-js'

// Přiřazování řádků k projektu:
// - náklady: klíčové slovo v názvu tasku (variable_costs.task_name, jen is_done)
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
  team_member: string | null
  client: string | null
  task_name: string | null
  task_type: string | null
  date: string | null
  month: string | null
  hours: number | null
  price: number | null
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
    return { stats: { income: 0, costs: 0, travel: 0, profit: 0 }, incomeRows: [], costRows: [] }
  }

  const costOr = keywords.map(k => `task_name.ilike.%${k}%`).join(',')
  const incomeOr = keywords
    .flatMap(k => [`project_name.ilike.%${k}%`, `note.ilike.%${k}%`, `client.ilike.%${k}%`])
    .join(',')

  const [costsRes, incomeRes] = await Promise.all([
    supabase
      .from('variable_costs')
      .select('team_member, client, task_name, task_type, date, month, hours, price')
      .eq('is_done', true)
      .or(costOr)
      .order('date', { ascending: false }),
    supabase
      .from('income')
      .select('client, project_name, amount, date, month, status, note')
      .or(incomeOr)
      .order('date', { ascending: false }),
  ])

  const costRows = (((costsRes.data ?? []) as ProjectCostRow[]))
    .filter(r => inRange(r.date, r.month, project.date_from, project.date_to))
  const incomeRows = ((incomeRes.data ?? []) as ProjectIncomeRow[])
    .filter(r => inRange(r.date, r.month, project.date_from, project.date_to))

  const travel = costRows.filter(r => r.task_type === 'Cesťák').reduce((s, r) => s + (r.price ?? 0), 0)
  const work = costRows.filter(r => r.task_type !== 'Cesťák').reduce((s, r) => s + (r.price ?? 0), 0)
  const income = incomeRows.reduce((s, r) => s + (r.amount ?? 0), 0)

  return {
    stats: { income, costs: work + travel, travel, profit: income - work - travel },
    incomeRows,
    costRows,
  }
}
