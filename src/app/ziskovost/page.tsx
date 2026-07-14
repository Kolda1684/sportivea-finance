import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatCZK, formatMonth } from '@/lib/utils'
import { MonthSelectorClient } from '@/components/dashboard/MonthSelectorClient'
import { TrendingUp, TrendingDown, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface ClientRow {
  client: string
  income: number
  costs: number
  margin: number
  marginPct: number | null
}

// Klienti se v income a variable_costs můžou lišit ve velikosti písmen/mezerách
const normalize = (s: string) => s.trim().toLowerCase()

async function getData(month: string): Promise<{ rows: ClientRow[]; totals: { income: number; costs: number } }> {
  const supabase = createAdminSupabaseClient()
  const [incomeRes, costsRes] = await Promise.all([
    supabase.from('income').select('client, amount').eq('month', month),
    supabase.from('variable_costs').select('client, price').eq('month', month).eq('is_done', true),
  ])

  // klíč = normalizované jméno, label = první viděná varianta
  const map = new Map<string, { label: string; income: number; costs: number }>()
  const upsert = (client: string | null, income: number, costs: number) => {
    const label = client?.trim() || '— bez klienta —'
    const key = normalize(label)
    const rec = map.get(key) ?? { label, income: 0, costs: 0 }
    rec.income += income
    rec.costs += costs
    map.set(key, rec)
  }
  for (const r of incomeRes.data ?? []) upsert(r.client, r.amount ?? 0, 0)
  for (const r of costsRes.data ?? []) upsert(r.client, 0, r.price ?? 0)

  const rows: ClientRow[] = Array.from(map.values())
    .map(r => ({
      client: r.label,
      income: r.income,
      costs: r.costs,
      margin: r.income - r.costs,
      marginPct: r.income > 0 ? ((r.income - r.costs) / r.income) * 100 : null,
    }))
    .sort((a, b) => b.margin - a.margin)

  const totals = {
    income: rows.reduce((s, r) => s + r.income, 0),
    costs: rows.reduce((s, r) => s + r.costs, 0),
  }
  return { rows, totals }
}

function marginColor(pct: number | null, margin: number): string {
  if (margin < 0) return 'text-red-600'
  if (pct == null) return 'text-gray-400'
  if (pct >= 50) return 'text-green-700'
  if (pct >= 25) return 'text-green-600'
  return 'text-amber-600'
}

export default async function ZiskovostPage({ searchParams }: { searchParams: { month?: string } }) {
  const month = searchParams.month ?? getCurrentMonth()
  const { rows, totals } = await getData(month)
  const totalMargin = totals.income - totals.costs
  const totalPct = totals.income > 0 ? (totalMargin / totals.income) * 100 : 0
  const monthLabel = formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ziskovost klientů</h1>
          <p className="text-sm text-gray-500 mt-1">
            {monthLabel} · příjmy − přímé náklady (mzdy + cestovné) na klienta
          </p>
        </div>
        <MonthSelectorClient currentMonth={month} basePath="/ziskovost" />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Příjmy', value: formatCZK(totals.income), icon: TrendingUp, color: 'text-green-700' },
          { label: 'Přímé náklady', value: formatCZK(totals.costs), icon: TrendingDown, color: 'text-red-600' },
          { label: 'Hrubá marže', value: formatCZK(totalMargin), icon: TrendingUp, color: totalMargin >= 0 ? 'text-gray-900' : 'text-red-600' },
          { label: 'Marže %', value: `${Math.round(totalPct)} %`, icon: Percent, color: marginColor(totalPct, totalMargin) },
        ].map(c => (
          <div key={c.label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
            <p className={cn('text-xl font-bold mt-1', c.color)}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabulka */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-semibold">Klient</th>
              <th className="px-4 py-2.5 text-right font-semibold">Příjmy</th>
              <th className="px-4 py-2.5 text-right font-semibold">Náklady</th>
              <th className="px-4 py-2.5 text-right font-semibold">Marže</th>
              <th className="px-4 py-2.5 text-right font-semibold w-32">Marže %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Žádná data pro tento měsíc</td></tr>
            )}
            {rows.map(r => {
              const noClient = r.client.startsWith('—')
              const costOnly = r.income === 0 && r.costs > 0
              return (
                <tr key={r.client} className={cn('hover:bg-gray-50/70', r.margin < 0 && 'bg-red-50/40', noClient && 'bg-amber-50/40')}>
                  <td className="px-4 py-2.5">
                    <span className={cn('font-medium', noClient ? 'text-amber-600' : 'text-gray-900')}>{r.client}</span>
                    {costOnly && <span className="ml-2 text-xs text-red-400">jen náklady, žádný příjem</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{r.income > 0 ? formatCZK(r.income) : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{r.costs > 0 ? formatCZK(r.costs) : '—'}</td>
                  <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', r.margin < 0 ? 'text-red-600' : 'text-gray-900')}>
                    {formatCZK(r.margin)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.marginPct == null ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-14 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', r.margin < 0 ? 'bg-red-400' : r.marginPct >= 50 ? 'bg-green-500' : r.marginPct >= 25 ? 'bg-green-400' : 'bg-amber-400')}
                            style={{ width: `${Math.min(Math.max(r.marginPct, 0), 100)}%` }}
                          />
                        </div>
                        <span className={cn('tabular-nums font-medium w-12 text-right', marginColor(r.marginPct, r.margin))}>
                          {Math.round(r.marginPct)} %
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Celkem</td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-green-700">{formatCZK(totals.income)}</td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-600">{formatCZK(totals.costs)}</td>
                <td className={cn('px-4 py-2.5 text-right font-bold tabular-nums', totalMargin >= 0 ? 'text-gray-900' : 'text-red-600')}>{formatCZK(totalMargin)}</td>
                <td className="px-4 py-2.5 text-right font-bold tabular-nums">{Math.round(totalPct)} %</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Náklady = variabilní náklady přiřazené klientovi (tasky z Notionu + cesťáky). Fixní náklady a platy majitelů se na klienty nerozpočítávají.
        Řádky „jen náklady&ldquo; obvykle znamenají, že příjem je veden pod jiným názvem klienta — sjednoť názvy v Příjmech a Notionu.
      </p>
    </div>
  )
}
