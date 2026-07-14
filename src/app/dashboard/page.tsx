import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatMonth } from '@/lib/utils'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { YearlyBarChart } from '@/components/dashboard/YearlyBarChart'
import { PnlTable } from '@/components/dashboard/PnlTable'
import { MonthSelectorClient } from '@/components/dashboard/MonthSelectorClient'
import { IncomesSection } from '@/components/dashboard/IncomesSection'
import { EmployeesTable } from '@/components/dashboard/EmployeesTable'
import { TrendingUp, TrendingDown, Wallet, Percent } from 'lucide-react'
import type { Income } from '@/types'

interface DashboardSummary {
  totalIncome: number
  totalVar: number
  totalExtra: number
  totalFixed: number
  totalSalaries: number
  invoicedAmount: number
  unpaidSum: number
  unpaidCount: number
  varByMember: { member: string; count: number; hours: number; price: number }[]
}

interface YearMonth { month: string; income: number; wages: number; travel: number; extraCosts: number; salaries: number }
interface YearBar { monthIdx: number; income: number; costs: number }
interface YearTotals { income: number; variable: number; extra: number; fixed: number; salaries: number }
export interface PnlMonth {
  monthIdx: number
  income: number
  wages: number
  travel: number
  fixed: number
  extra: number
  salaries: number
  profit: number
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function getDashboardData(month: string) {
  const supabase = createAdminSupabaseClient()
  // RPC dashboard_summary nevrací platy majitelů — dotáhneme paralelně zvlášť
  const [rpc, salaries] = await Promise.all([
    supabase.rpc('dashboard_summary', { p_month: month }),
    supabase.from('owner_salaries').select('amount').eq('month', month),
  ])
  if (rpc.error) throw new Error(`dashboard_summary RPC failed: ${rpc.error.message}`)
  const summary = rpc.data as DashboardSummary
  summary.totalSalaries = (salaries.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  return summary
}

// variable_costs má za rok víc než 1000 řádků (Supabase limit na dotaz) → stránkování
async function fetchAllVariableCosts(year: number) {
  const supabase = createAdminSupabaseClient()
  const rows: { month: string; price: number | null; task_type: string | null }[] = []
  const PAGE = 1000
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from('variable_costs')
      .select('month, price, task_type')
      .like('month', `%,${year}`)
      .eq('is_done', true)
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

async function getYearlyData(year: number): Promise<{ bars: YearBar[]; totals: YearTotals; pnl: PnlMonth[] }> {
  const supabase = createAdminSupabaseClient()
  const yearSuffix = `,${year}`

  const [incomes, variableRows, extras, fixed, salaries] = await Promise.all([
    supabase.from('income').select('month, amount').like('month', `%${yearSuffix}`),
    fetchAllVariableCosts(year),
    supabase.from('extra_costs').select('month, amount').like('month', `%${yearSuffix}`),
    supabase.from('fixed_costs').select('amount').eq('active', true),
    supabase.from('owner_salaries').select('month, amount').like('month', `%${yearSuffix}`),
  ])
  const variables = { data: variableRows }

  const fixedMonthly = (fixed.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  const byMonth = new Map<number, YearMonth>()
  for (let m = 1; m <= 12; m++) {
    byMonth.set(m, { month: `${m},${year}`, income: 0, wages: 0, travel: 0, extraCosts: 0, salaries: 0 })
  }
  ;(incomes.data ?? []).forEach(r => {
    const idx = parseInt(String(r.month).split(',')[0])
    const m = byMonth.get(idx); if (m) m.income += Number(r.amount ?? 0)
  })
  ;(variables.data ?? []).forEach(r => {
    const idx = parseInt(String(r.month).split(',')[0])
    const m = byMonth.get(idx)
    if (!m) return
    if (r.task_type === 'Cesťák') m.travel += Number(r.price ?? 0)
    else m.wages += Number(r.price ?? 0)
  })
  ;(extras.data ?? []).forEach(r => {
    const idx = parseInt(String(r.month).split(',')[0])
    const m = byMonth.get(idx); if (m) m.extraCosts += Number(r.amount ?? 0)
  })
  ;(salaries.data ?? []).forEach(r => {
    const idx = parseInt(String(r.month).split(',')[0])
    const m = byMonth.get(idx); if (m) m.salaries += Number(r.amount ?? 0)
  })

  const bars: YearBar[] = Array.from(byMonth.entries()).map(([monthIdx, agg]) => ({
    monthIdx,
    income: agg.income,
    costs: agg.wages + agg.travel + agg.extraCosts + agg.salaries + fixedMonthly,
  }))

  const totals: YearTotals = {
    income: bars.reduce((s, b) => s + b.income, 0),
    variable: Array.from(byMonth.values()).reduce((s, m) => s + m.wages + m.travel, 0),
    extra: Array.from(byMonth.values()).reduce((s, m) => s + m.extraCosts, 0),
    fixed: fixedMonthly * 12,
    salaries: Array.from(byMonth.values()).reduce((s, m) => s + m.salaries, 0),
  }

  // P&L po měsících — jen měsíce, kde se něco dělo (fixní jsou konstantní, ty aktivitu neurčují)
  const pnl: PnlMonth[] = Array.from(byMonth.entries())
    .filter(([, m]) => m.income > 0 || m.wages > 0 || m.travel > 0 || m.extraCosts > 0 || m.salaries > 0)
    .map(([monthIdx, m]) => {
      const costs = m.wages + m.travel + fixedMonthly + m.extraCosts + m.salaries
      return {
        monthIdx,
        income: m.income,
        wages: m.wages,
        travel: m.travel,
        fixed: fixedMonthly,
        extra: m.extraCosts,
        salaries: m.salaries,
        profit: m.income - costs,
      }
    })

  return { bars, totals, pnl }
}

async function getMonthIncomes(month: string): Promise<Income[]> {
  const supabase = createAdminSupabaseClient()
  const { data } = await supabase
    .from('income')
    .select('*')
    .eq('month', month)
    .order('date', { ascending: false })
  return (data ?? []) as Income[]
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: { searchParams: { month?: string } }) {
  const month = searchParams.month ?? getCurrentMonth()
  const year = parseInt(month.split(',')[1])

  const [summary, yearly, monthIncomes] = await Promise.all([
    getDashboardData(month),
    getYearlyData(year),
    getMonthIncomes(month),
  ])

  const totalCosts = summary.totalVar + summary.totalFixed + summary.totalExtra + (summary.totalSalaries ?? 0)
  const profit = summary.totalIncome - totalCosts
  const marginPct = summary.totalIncome > 0 ? (profit / summary.totalIncome) * 100 : 0

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">

      {/* Hlavička */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)}
          </p>
        </div>
        <MonthSelectorClient currentMonth={month} />
      </div>

      {/* 1. Roční graf — celý rok (bar / pie toggle) */}
      <YearlyBarChart data={yearly.bars} totals={yearly.totals} year={year} />

      {/* Výsledovka po měsících */}
      <PnlTable pnl={yearly.pnl} year={year} />

      {/* 2. KPI — aktuální měsíc */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Aktuální měsíc · {formatMonth(month)}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Příjmy"   value={summary.totalIncome} icon={TrendingUp}   colorClass="text-green-700" />
          <KpiCard title="Náklady"  value={totalCosts}          icon={TrendingDown} colorClass="text-red-600" />
          <KpiCard title="Zisk"     value={profit}              icon={Wallet}
            colorClass={profit >= 0 ? 'text-primary-900' : 'text-red-600'} />
          <KpiCard title="Marže"    value={marginPct}           icon={Percent} format="percent"
            colorClass={marginPct >= 0 ? 'text-primary-900' : 'text-red-600'} />
        </div>
      </section>

      {/* 3. Příjmy & projekty — všechny za měsíc (tabulka nebo koláč) */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Příjmy & Projekty · {formatMonth(month)}</h2>
          <p className="text-xs text-gray-400">{monthIncomes.length} záznamů</p>
        </div>
        <IncomesSection incomes={monthIncomes} />
      </section>

      {/* 4. Zaměstnanci v měsíci */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Zaměstnanci · {formatMonth(month)}</h2>
          <p className="text-xs text-gray-400">{summary.varByMember.length} osob</p>
        </div>
        <EmployeesTable members={summary.varByMember} />
      </section>

    </div>
  )
}
