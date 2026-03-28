import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatCZK, formatMonth, getLastNMonths, monthBounds } from '@/lib/utils'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { MonthSelectorClient } from '@/components/dashboard/MonthSelectorClient'
import { TrendingUp, TrendingDown, Wallet, FileText, AlertTriangle, Link2Off, Calendar, BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MonthlyData, ClientSummary, TeamMemberCostSummary } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function getQuarterMonths(month: string): string[] {
  const [m, y] = month.split(',').map(Number)
  const q = Math.ceil(m / 3)
  const start = (q - 1) * 3 + 1
  return [1, 2, 3].map(i => `${start + i - 1},${y}`)
}

function getYtdMonths(month: string): string[] {
  const [m, y] = month.split(',').map(Number)
  return Array.from({ length: m }, (_, i) => `${i + 1},${y}`)
}

function quarterLabel(month: string): string {
  const [m, y] = month.split(',').map(Number)
  return `Q${Math.ceil(m / 3)} ${y}`
}

// ─── Data fetching ───────────────────────────────────────────────────────────

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

async function getDashboardData(month: string) {
  const supabase = createAdminSupabaseClient()

  const { from, to } = monthBounds(month)

  const [incomeRes, varCostRes, fixedRes, extraRes, unpaidRes, invoicedRes, unmatchedRes, clientRes, memberRes] =
    await Promise.all([
      supabase.from('income').select('amount').eq('month', month),
      supabase.from('variable_costs').select('price').eq('month', month),
      supabase.from('fixed_costs').select('amount').eq('active', true),
      supabase.from('extra_costs').select('amount').eq('month', month),
      supabase.from('invoices').select('total').not('status', 'eq', 'paid'),
      supabase.from('invoices').select('total').gte('issued_on', from).lte('issued_on', to),
      supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'unmatched'),
      supabase.from('income').select('client, amount').eq('month', month),
      supabase.from('variable_costs').select('team_member, price, hours').eq('month', month),
    ])

  const totalIncome = incomeRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalFixed = fixedRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalVar = varCostRes.data?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0
  const totalExtra = extraRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalCosts = totalVar + totalFixed + totalExtra

  // Měsíční data pro graf (12 měsíců)
  const last12 = getLastNMonths(12)
  const monthlyData: MonthlyData[] = await Promise.all(
    last12.map(async (m) => {
      const t = await getMonthTotals(supabase, m)
      return { month: m, label: m, income: t.income, costs: t.variable + totalFixed + t.extra }
    })
  )

  // YTD
  const ytdMonths = getYtdMonths(month)
  const ytdTotals = await Promise.all(ytdMonths.map(m => getMonthTotals(supabase, m)))
  const ytdIncome = ytdTotals.reduce((s, t) => s + t.income, 0)
  const ytdCosts = ytdTotals.reduce((s, t) => s + t.variable + t.extra, 0) + totalFixed * ytdMonths.length

  // Kvartál
  const qMonths = getQuarterMonths(month)
  const qTotals = await Promise.all(qMonths.map(m => getMonthTotals(supabase, m)))
  const qIncome = qTotals.reduce((s, t) => s + t.income, 0)
  const qCosts = qTotals.reduce((s, t) => s + t.variable + t.extra, 0) + totalFixed * qMonths.length

  // Top klienti
  const clientMap = new Map<string, { total: number; count: number }>()
  for (const r of clientRes.data ?? []) {
    const e = clientMap.get(r.client) ?? { total: 0, count: 0 }
    clientMap.set(r.client, { total: e.total + (r.amount ?? 0), count: e.count + 1 })
  }
  const topClients: ClientSummary[] = Array.from(clientMap.entries())
    .map(([client, d]) => ({ client, ...d }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // Tým
  const memberMap = new Map<string, { total: number; hours: number }>()
  for (const r of memberRes.data ?? []) {
    const name = r.team_member ?? 'Neznámý'
    const e = memberMap.get(name) ?? { total: 0, hours: 0 }
    memberMap.set(name, { total: e.total + (r.price ?? 0), hours: e.hours + (r.hours ?? 0) })
  }
  const teamCosts: TeamMemberCostSummary[] = Array.from(memberMap.entries())
    .map(([team_member, d]) => ({ team_member, ...d }))
    .sort((a, b) => b.total - a.total)

  return {
    month,
    totalIncome, totalCosts, totalFixed,
    profit: totalIncome - totalCosts,
    invoicedAmount: invoicedRes.data?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0,
    unpaidCount: unpaidRes.data?.length ?? 0,
    unpaidSum: unpaidRes.data?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0,
    unmatchedCount: unmatchedRes.count ?? 0,
    monthlyData,
    topClients, teamCosts,
    ytd: { income: ytdIncome, costs: ytdCosts, profit: ytdIncome - ytdCosts, months: ytdMonths.length },
    quarter: { income: qIncome, costs: qCosts, profit: qIncome - qCosts, label: quarterLabel(month) },
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
          <p className="text-sm text-gray-500 mt-1">Přehled financí</p>
        </div>
        <MonthSelectorClient currentMonth={month} />
      </div>

      {/* KPI – aktuální měsíc */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)}
        </p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Příjmy" value={d.totalIncome} icon={TrendingUp} colorClass="text-green-700" />
          <KpiCard title="Náklady" value={d.totalCosts} icon={TrendingDown} colorClass="text-red-600" />
          <KpiCard
            title="Zisk"
            value={d.profit}
            icon={Wallet}
            colorClass={d.profit >= 0 ? 'text-primary-900' : 'text-red-600'}
            description={d.profit >= 0 ? 'Ziskový měsíc' : 'Ztrátový měsíc'}
          />
          <KpiCard title="Fakturováno" value={d.invoicedAmount} icon={FileText} colorClass="text-blue-700" />
        </div>
      </div>

      {/* YTD + Kvartál */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${Math.min(100, (d.ytd.profit / d.ytd.income) * 100)}%` }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Marže: {d.ytd.income > 0 ? Math.round((d.ytd.profit / d.ytd.income) * 100) : 0} %
            </p>
          </CardContent>
        </Card>

        {/* Kvartál */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              {d.quarter.label} – kvartální přehled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Příjmy</p>
                <p className="text-lg font-bold text-green-700">{formatCZK(d.quarter.income)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Náklady</p>
                <p className="text-lg font-bold text-red-600">{formatCZK(d.quarter.costs)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Zisk</p>
                <p className={`text-lg font-bold ${d.quarter.profit >= 0 ? 'text-primary-900' : 'text-red-600'}`}>
                  {formatCZK(d.quarter.profit)}
                </p>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
              {d.quarter.income > 0 && (
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${Math.min(100, (d.quarter.profit / d.quarter.income) * 100)}%` }}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Marže: {d.quarter.income > 0 ? Math.round((d.quarter.profit / d.quarter.income) * 100) : 0} %
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upozornění */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex items-center gap-4">
            <AlertTriangle className="h-8 w-8 text-orange-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-orange-900">{d.unpaidCount} nezaplacených faktur</p>
              <p className="text-sm text-orange-700">{formatCZK(d.unpaidSum)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 flex items-center gap-4">
            <Link2Off className="h-8 w-8 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-yellow-900">{d.unmatchedCount} nespárovaných transakcí</p>
              <p className="text-sm text-yellow-700">Bankovní centrum</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Graf */}
      <RevenueChart data={d.monthlyData.slice(-6)} />

      {/* Tabulky */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Top klienti — {formatMonth(month)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.topClients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Žádná data</p>
            ) : (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Náklady na tým — {formatMonth(month)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.teamCosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Žádná data</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 text-left">Člen</th>
                    <th className="pb-2 text-right">Hodiny</th>
                    <th className="pb-2 text-right">Náklady</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.teamCosts.map(m => (
                    <tr key={m.team_member}>
                      <td className="py-2 font-medium">{m.team_member}</td>
                      <td className="py-2 text-right text-muted-foreground">{m.hours} h</td>
                      <td className="py-2 text-right text-red-600 font-medium">{formatCZK(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
