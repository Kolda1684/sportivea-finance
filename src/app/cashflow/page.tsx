import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatCZK, formatDate, formatMonth, getLastNMonths, monthBounds } from '@/lib/utils'
import { MonthSelectorClient } from '@/components/dashboard/MonthSelectorClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Clock, Banknote, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Statusy = peníze ještě nepřišly (manažerské, ne cash)
const PENDING_STATUSES = ['cekame', 'potvrzeno', 'vystaveno']

const STATUS_LABEL: Record<string, string> = {
  cekame: 'Čekáme',
  potvrzeno: 'Potvrzeno',
  vystaveno: 'Vystaveno',
}

const STATUS_CLASS: Record<string, string> = {
  cekame: 'bg-yellow-100 text-yellow-800',
  potvrzeno: 'bg-blue-100 text-blue-800',
  vystaveno: 'bg-purple-100 text-purple-800',
}

async function getCashflowData(month: string) {
  const supabase = createAdminSupabaseClient()
  const { from, to } = monthBounds(month)

  const [paidIncomeRes, pendingIncomeRes, varRes, fixedRes, extraRes] = await Promise.all([
    // Skutečně zaplaceno tento měsíc (cash IN)
    supabase.from('income').select('amount, client, project_name, date').eq('month', month).eq('status', 'zaplaceno'),
    // Čeká na zaplacení (všechny měsíce – pohledávky)
    supabase.from('income').select('id, amount, client, project_name, date, status, month').in('status', PENDING_STATUSES).order('date', { ascending: false }),
    // Náklady tento měsíc
    supabase.from('variable_costs').select('price').eq('month', month),
    supabase.from('fixed_costs').select('amount').eq('active', true),
    supabase.from('extra_costs').select('amount').eq('month', month),
  ])

  const cashIn = paidIncomeRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const cashOut = (varRes.data?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0)
    + (fixedRes.data?.reduce((s, r) => s + r.amount, 0) ?? 0)
    + (extraRes.data?.reduce((s, r) => s + r.amount, 0) ?? 0)

  const pendingTotal = pendingIncomeRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0

  // Trend posledních 6 měsíců
  const last6 = getLastNMonths(6)
  const trend = await Promise.all(last6.map(async (m) => {
    const [inc, costs, fix, ext] = await Promise.all([
      supabase.from('income').select('amount').eq('month', m).eq('status', 'zaplaceno'),
      supabase.from('variable_costs').select('price').eq('month', m),
      supabase.from('fixed_costs').select('amount').eq('active', true),
      supabase.from('extra_costs').select('amount').eq('month', m),
    ])
    const income = inc.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
    const expense = (costs.data?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0)
      + (fix.data?.reduce((s, r) => s + r.amount, 0) ?? 0)
      + (ext.data?.reduce((s, r) => s + r.amount, 0) ?? 0)
    return { month: m, income, expense, net: income - expense }
  }))

  return {
    cashIn,
    cashOut,
    net: cashIn - cashOut,
    pendingTotal,
    pendingItems: pendingIncomeRes.data ?? [],
    trend,
  }
}

export default async function CashflowPage({ searchParams }: { searchParams: { month?: string } }) {
  const month = searchParams.month ?? getCurrentMonth()
  const d = await getCashflowData(month)
  const monthLabel = formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)

  const maxTrend = Math.max(...d.trend.map(t => Math.max(t.income, t.expense)), 1)

  return (
    <div className="p-8 space-y-8">
      {/* Hlavička */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cashflow</h1>
          <p className="text-sm text-gray-500 mt-1">Skutečné peněžní toky — kdy peníze přišly, ne kdy vznikl nárok</p>
        </div>
        <MonthSelectorClient currentMonth={month} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <TrendingUp className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Přijato ({monthLabel})</p>
                <p className="text-xl font-bold text-green-700">{formatCZK(d.cashIn)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vydáno ({monthLabel})</p>
                <p className="text-xl font-bold text-red-600">{formatCZK(d.cashOut)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className={cn('rounded-lg p-2', d.net >= 0 ? 'bg-blue-100' : 'bg-red-100')}>
                <Banknote className={cn('h-5 w-5', d.net >= 0 ? 'text-blue-700' : 'text-red-600')} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Čistý cashflow</p>
                <p className={cn('text-xl font-bold', d.net >= 0 ? 'text-blue-700' : 'text-red-600')}>
                  {formatCZK(d.net)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={d.pendingTotal > 0 ? 'border-orange-200' : ''}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pohledávky celkem</p>
                <p className="text-xl font-bold text-orange-600">{formatCZK(d.pendingTotal)}</p>
                <p className="text-xs text-muted-foreground">{d.pendingItems.length} faktur čeká</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cashflow info */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex gap-3 text-sm text-blue-800">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
        <div>
          <strong>Jak číst cashflow:</strong> Příjmy se počítají pouze když jsou označeny jako <em>Zaplaceno</em> v sekci Příjmy & Projekty.
          Pohledávky jsou fakturované částky, které ještě nedorazily na účet.
        </div>
      </div>

      {/* Trend graf — posledních 6 měsíců */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend — posledních 6 měsíců</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {d.trend.map((t) => {
              const mLabel = formatMonth(t.month).slice(0, 3)
              const incWidth = Math.round((t.income / maxTrend) * 100)
              const expWidth = Math.round((t.expense / maxTrend) * 100)
              const isCurrentMonth = t.month === month
              return (
                <div key={t.month} className={cn('space-y-1', isCurrentMonth && 'font-medium')}>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={isCurrentMonth ? 'text-gray-900 font-semibold' : ''}>
                      {mLabel.charAt(0).toUpperCase() + mLabel.slice(1)} {t.month.split(',')[1]}
                    </span>
                    <span className={cn('font-medium', t.net >= 0 ? 'text-green-700' : 'text-red-600')}>
                      {t.net >= 0 ? '+' : ''}{formatCZK(t.net)}
                    </span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${incWidth}%` }} />
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${expWidth}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="text-green-700">↑ {formatCZK(t.income)}</span>
                    <span className="text-red-500">↓ {formatCZK(t.expense)}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />Přijato</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" />Vydáno</span>
          </div>
        </CardContent>
      </Card>

      {/* Pohledávky — čeká na zaplacení */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            Pohledávky — čeká na zaplacení
          </CardTitle>
        </CardHeader>
        <CardContent>
          {d.pendingItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Všechny faktury jsou zaplaceny 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 text-left">Klient</th>
                  <th className="pb-2 text-left">Projekt</th>
                  <th className="pb-2 text-left">Měsíc</th>
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-right">Částka</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {d.pendingItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-2.5 font-medium">{item.client}</td>
                    <td className="py-2.5 text-muted-foreground text-xs">{item.project_name}</td>
                    <td className="py-2.5 text-muted-foreground text-xs">{item.month}</td>
                    <td className="py-2.5">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLASS[item.status] ?? 'bg-gray-100 text-gray-700')}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-orange-600">
                      {item.amount != null ? formatCZK(item.amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-gray-50">
                <tr>
                  <td colSpan={4} className="py-2.5 text-xs font-semibold text-muted-foreground">CELKEM POHLEDÁVKY</td>
                  <td className="py-2.5 text-right font-bold text-orange-600">{formatCZK(d.pendingTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
