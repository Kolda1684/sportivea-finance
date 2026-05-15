import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatCZK, formatMonth, getLastNMonths, monthBounds } from '@/lib/utils'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { MonthSelectorClient } from '@/components/dashboard/MonthSelectorClient'
import { CostSection } from '@/components/dashboard/CostSection'
import { TrendingUp, TrendingDown, Wallet, FileText, AlertTriangle, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MonthlyData } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function getYtdMonths(month: string): string[] {
  const [m, y] = month.split(',').map(Number)
  return Array.from({ length: m }, (_, i) => `${i + 1},${y}`)
}

async function getMonthTotals(supabase: ReturnType<typeof createAdminSupabaseClient>, month: string) {
  const [incRes, varRes, extRes] = await Promise.all([
    supabase.from('income').select('amount').eq('month', month),
    supabase.from('variable_costs').select('price').eq('month', month),
    supabase.from('extra_costs').select('amount').eq('month', month),
  ])
  return {
    income: incRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0,
    variable: varRes.data?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0,
    extra: extRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0,
  }
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function getDashboardData(month: string) {
  const supabase = createAdminSupabaseClient()
  const { from, to } = monthBounds(month)

  // Primární paralelní fetch — vše co potřebujeme pro oba pohledy
  const [incomeRes, varCostRes, fixedRes, extraRes, unpaidRes, invoicedRes] = await Promise.all([
    supabase.from('income').select('client, amount').eq('month', month),
    supabase.from('variable_costs').select('client, team_member, price, hours').eq('month', month),
    supabase.from('fixed_costs').select('amount').eq('active', true),
    supabase.from('extra_costs').select('amount').eq('month', month),
    supabase.from('invoices').select('total').not('status', 'eq', 'paid'),
    supabase.from('invoices').select('total').gte('issued_on', from).lte('issued_on', to),
  ])

  const totalIncome = incomeRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalFixed  = fixedRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalVar    = varCostRes.data?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0
  const totalExtra  = extraRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalCosts  = totalVar + totalFixed + totalExtra

  // Pivot variabilních nákladů dle klienta
  const clientMap = new Map<string, { count: number; hours: number; price: number }>()
  for (const r of varCostRes.data ?? []) {
    const key = r.client ?? 'Neznámý'
    const e = clientMap.get(key) ?? { count: 0, hours: 0, price: 0 }
    clientMap.set(key, { count: e.count + 1, hours: e.hours + (r.hours ?? 0), price: e.price + (r.price ?? 0) })
  }
  const varByClient = Array.from(clientMap.entries())
    .map(([client, d]) => ({ client, ...d }))
    .sort((a, b) => b.price - a.price)

  // Pivot variabilních nákladů dle zaměstnance
  const memberMap = new Map<string, { count: number; hours: number; price: number }>()
  for (const r of varCostRes.data ?? []) {
    const key = r.team_member ?? 'Neznámý'
    const e = memberMap.get(key) ?? { count: 0, hours: 0, price: 0 }
    memberMap.set(key, { count: e.count + 1, hours: e.hours + (r.hours ?? 0), price: e.price + (r.price ?? 0) })
  }
  const varByMember = Array.from(memberMap.entries())
    .map(([member, d]) => ({ member, ...d }))
    .sort((a, b) => b.price - a.price)

  // Top klienti dle příjmů
  const incClientMap = new Map<string, { total: number; count: number }>()
  for (const r of incomeRes.data ?? []) {
    const e = incClientMap.get(r.client) ?? { total: 0, count: 0 }
    incClientMap.set(r.client, { total: e.total + (r.amount ?? 0), count: e.count + 1 })
  }
  const topClients = Array.from(incClientMap.entries())
    .map(([client, d]) => ({ client, ...d }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)

  // Měsíční data pro graf (posledních 6 měsíců)
  const last6 = getLastNMonths(6)
  const monthlyData: MonthlyData[] = await Promise.all(
    last6.map(async (m) => {
      const t = await getMonthTotals(supabase, m)
      return { month: m, label: m, income: t.income, costs: t.variable + totalFixed + t.extra }
    })
  )

  // YTD
  const ytdMonths = getYtdMonths(month)
  const ytdTotals = await Promise.all(ytdMonths.map(m => getMonthTotals(supabase, m)))
  const ytdIncome = ytdTotals.reduce((s, t) => s + t.income, 0)
  const ytdCosts  = ytdTotals.reduce((s, t) => s + t.variable + t.extra, 0) + totalFixed * ytdMonths.length

  return {
    month, totalIncome, totalCosts, totalFixed, totalVar, totalExtra,
    profit: totalIncome - totalCosts,
    invoicedAmount: invoicedRes.data?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0,
    unpaidCount: unpaidRes.data?.length ?? 0,
    unpaidSum: unpaidRes.data?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0,
    varByClient, varByMember, topClients, monthlyData,
    ytd: {
      income: ytdIncome, costs: ytdCosts,
      profit: ytdIncome - ytdCosts,
      months: ytdMonths.length,
    },
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: { searchParams: { month?: string } }) {
  const month = searchParams.month ?? getCurrentMonth()
  const d = await getDashboardData(month)

  return (
    <div className="p-8 space-y-8">

      {/* Hlavička + month selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)}
          </p>
        </div>
        <MonthSelectorClient currentMonth={month} />
      </div>

      {/* KPI — aktuální měsíc */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard title="Příjmy" value={d.totalIncome} icon={TrendingUp} colorClass="text-green-700" />
        <KpiCard title="Náklady" value={d.totalCosts} icon={TrendingDown} colorClass="text-red-600" />
        <KpiCard title="Zisk" value={d.profit} icon={Wallet}
          colorClass={d.profit >= 0 ? 'text-primary-900' : 'text-red-600'}
          description={d.profit >= 0 ? 'Ziskový měsíc' : 'Ztrátový měsíc'} />
        <KpiCard title="Fakturováno" value={d.invoicedAmount} icon={FileText} colorClass="text-blue-700" />
      </div>

      {/* Upozornění na nezaplacené faktury */}
      {d.unpaidCount > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex items-center gap-4">
            <AlertTriangle className="h-8 w-8 text-orange-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-orange-900">{d.unpaidCount} nezaplacených faktur</p>
              <p className="text-sm text-orange-700">{formatCZK(d.unpaidSum)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Výsledek měsíce + Variabilní náklady + Extra + Souhrn (client component) */}
      <CostSection
        month={month}
        totalIncome={d.totalIncome}
        totalVar={d.totalVar}
        totalFixed={d.totalFixed}
        initialExtra={d.totalExtra}
        varByClient={d.varByClient}
        varByMember={d.varByMember}
      />

      {/* YTD */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Rok {month.split(',')[1]} – celkem (YTD, {d.ytd.months} měs.)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Příjmy</p>
              <p className="text-lg font-bold text-green-700">{formatCZK(d.ytd.income)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Náklady</p>
              <p className="text-lg font-bold text-red-600">{formatCZK(d.ytd.costs)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Zisk</p>
              <p className={`text-lg font-bold ${d.ytd.profit >= 0 ? 'text-primary-900' : 'text-red-600'}`}>
                {formatCZK(d.ytd.profit)}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
            {d.ytd.income > 0 && (
              <div className="h-full bg-green-500 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, (d.ytd.profit / d.ytd.income) * 100))}%` }} />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Marže: {d.ytd.income > 0 ? Math.round((d.ytd.profit / d.ytd.income) * 100) : 0} %
          </p>
        </CardContent>
      </Card>

      {/* Top klienti */}
      {d.topClients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top klienti — {formatMonth(month)}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 text-left">Klient</th>
                  <th className="pb-2 text-right">Příjmy</th>
                  <th className="pb-2 text-right">Úkonů</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {d.topClients.map(c => (
                  <tr key={c.client}>
                    <td className="py-2 font-medium">{c.client}</td>
                    <td className="py-2 text-right text-green-700 font-medium">{formatCZK(c.total)}</td>
                    <td className="py-2 text-right text-muted-foreground">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Graf */}
      <RevenueChart data={d.monthlyData} />
    </div>
  )
}
