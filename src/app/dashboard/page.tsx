import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatMonth } from '@/lib/utils'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { YearlyBarChart } from '@/components/dashboard/YearlyBarChart'
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

interface YearMonth { month: string; income: number; variableCosts: number; extraCosts: number }
interface YearBar { monthIdx: number; income: number; costs: number }
interface YearTotals { income: number; variable: number; extra: number; fixed: number }

// ─── Data fetching ───────────────────────────────────────────────────────────

async function getDashboardData(month: string) {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('dashboard_summary', { p_month: month })
  if (error) throw new Error(`dashboard_summary RPC failed: ${error.message}`)
  return data as DashboardSummary
}

async function getYearlyData(year: number): Promise<{ bars: YearBar[]; totals: YearTotals }> {
  const supabase = createAdminSupabaseClient()
  const yearSuffix = `,${year}`

  const [incomes, variables, extras, fixed] = await Promise.all([
    supabase.from('income').select('month, amount').like('month', `%${yearSuffix}`),
    supabase.from('variable_costs').select('month, price').like('month', `%${yearSuffix}`),
    supabase.from('extra_costs').select('month, amount').like('month', `%${yearSuffix}`),
    supabase.from('fixed_costs').select('amount').eq('active', true),
  ])

  const fixedMonthly = (fixed.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  const byMonth = new Map<number, YearMonth>()
  for (let m = 1; m <= 12; m++) {
    byMonth.set(m, { month: `${m},${year}`, income: 0, variableCosts: 0, extraCosts: 0 })
  }
  ;(incomes.data ?? []).forEach(r => {
    const idx = parseInt(String(r.month).split(',')[0])
    const m = byMonth.get(idx); if (m) m.income += Number(r.amount ?? 0)
  })
  ;(variables.data ?? []).forEach(r => {
    const idx = parseInt(String(r.month).split(',')[0])
    const m = byMonth.get(idx); if (m) m.variableCosts += Number(r.price ?? 0)
  })
  ;(extras.data ?? []).forEach(r => {
    const idx = parseInt(String(r.month).split(',')[0])
    const m = byMonth.get(idx); if (m) m.extraCosts += Number(r.amount ?? 0)
  })

  const bars: YearBar[] = Array.from(byMonth.entries()).map(([monthIdx, agg]) => ({
    monthIdx,
    income: agg.income,
    costs: agg.variableCosts + agg.extraCosts + fixedMonthly,
  }))

  const totals: YearTotals = {
    income: bars.reduce((s, b) => s + b.income, 0),
    variable: Array.from(byMonth.values()).reduce((s, m) => s + m.variableCosts, 0),
    extra: Array.from(byMonth.values()).reduce((s, m) => s + m.extraCosts, 0),
    fixed: fixedMonthly * 12,
  }

  return { bars, totals }
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
