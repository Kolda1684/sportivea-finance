import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatCZK, formatMonth } from '@/lib/utils'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RevenueChart } from '@/components/dashboard/RevenueChart'
import { MonthSelectorClient } from '@/components/dashboard/MonthSelectorClient'
import { CostSection } from '@/components/dashboard/CostSection'
import { TrendingUp, TrendingDown, Wallet, FileText, AlertTriangle, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MonthlyData } from '@/types'

// ─── Types from RPC ──────────────────────────────────────────────────────────

interface DashboardSummary {
  totalIncome: number
  totalVar: number
  totalExtra: number
  totalFixed: number
  totalSalaries: number
  invoicedAmount: number
  unpaidSum: number
  unpaidCount: number
  varByClient: { client: string; count: number; hours: number; price: number }[]
  varByMember: { member: string; count: number; hours: number; price: number }[]
  salariesByOwner: { owner: string; amount: number; paid: boolean }[]
  topClients:  { client: string; total: number; count: number }[]
  monthlyData: { month: string; income: number; costs: number }[]
  ytd: { income: number; costs: number; months: number }
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function getDashboardData(month: string) {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase.rpc('dashboard_summary', { p_month: month })
  if (error) throw new Error(`dashboard_summary RPC failed: ${error.message}`)

  const d = data as DashboardSummary
  const totalSalaries = d.totalSalaries ?? 0
  const totalCosts = d.totalVar + d.totalFixed + d.totalExtra + totalSalaries

  const monthlyData: MonthlyData[] = d.monthlyData.map(r => ({
    month: r.month, label: r.month, income: r.income, costs: r.costs,
  }))

  return {
    month,
    totalIncome:    d.totalIncome,
    totalCosts,
    totalFixed:     d.totalFixed,
    totalVar:       d.totalVar,
    totalExtra:     d.totalExtra,
    totalSalaries,
    profit:         d.totalIncome - totalCosts,
    invoicedAmount: d.invoicedAmount,
    unpaidCount:    d.unpaidCount,
    unpaidSum:      d.unpaidSum,
    varByClient:    d.varByClient,
    varByMember:    d.varByMember,
    salariesByOwner: d.salariesByOwner ?? [],
    topClients:     d.topClients,
    monthlyData,
    ytd: {
      income: d.ytd.income,
      costs:  d.ytd.costs,
      profit: d.ytd.income - d.ytd.costs,
      months: d.ytd.months,
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
        totalSalaries={d.totalSalaries}
        initialExtra={d.totalExtra}
        varByClient={d.varByClient}
        varByMember={d.varByMember}
        salariesByOwner={d.salariesByOwner}
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
