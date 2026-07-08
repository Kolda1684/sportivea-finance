import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCZK } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { PnlMonth } from '@/app/dashboard/page'

const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec']

export function PnlTable({ pnl, year }: { pnl: PnlMonth[]; year: number }) {
  if (pnl.length === 0) return null

  const sum = (f: (m: PnlMonth) => number) => pnl.reduce((s, m) => s + f(m), 0)
  const totals = {
    income: sum(m => m.income),
    wages: sum(m => m.wages),
    travel: sum(m => m.travel),
    fixed: sum(m => m.fixed),
    extra: sum(m => m.extra),
    salaries: sum(m => m.salaries),
    profit: sum(m => m.profit),
  }
  const marginPct = (m: { income: number; profit: number }) =>
    m.income > 0 ? Math.round((m.profit / m.income) * 100) : null
  // Benchmark: náklady na tým (mzdy + platy majitelů) do 55–65 % příjmů
  const teamPct = (m: { income: number; wages: number; salaries: number }) =>
    m.income > 0 ? Math.round(((m.wages + m.salaries) / m.income) * 100) : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold">Výsledovka · {year}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Tým % = (mzdy + platy majitelů) / příjmy · zdravé pásmo 55–65 %
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                <th className="py-2 pr-3 text-left font-semibold">Měsíc</th>
                <th className="py-2 px-3 text-right font-semibold">Příjmy</th>
                <th className="py-2 px-3 text-right font-semibold">Mzdy</th>
                <th className="py-2 px-3 text-right font-semibold">Cestovné</th>
                <th className="py-2 px-3 text-right font-semibold">Fixní</th>
                <th className="py-2 px-3 text-right font-semibold">Extra</th>
                <th className="py-2 px-3 text-right font-semibold">Platy majitelů</th>
                <th className="py-2 px-3 text-right font-semibold">Zisk</th>
                <th className="py-2 px-3 text-right font-semibold">Marže</th>
                <th className="py-2 pl-3 text-right font-semibold">Tým %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pnl.map(m => {
                const mp = marginPct(m)
                const tp = teamPct(m)
                return (
                  <tr key={m.monthIdx} className="hover:bg-gray-50/70">
                    <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">{MONTH_NAMES[m.monthIdx - 1]}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-green-700">{m.income > 0 ? formatCZK(m.income) : '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{formatCZK(m.wages)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{m.travel > 0 ? formatCZK(m.travel) : '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{formatCZK(m.fixed)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{m.extra > 0 ? formatCZK(m.extra) : '—'}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{m.salaries > 0 ? formatCZK(m.salaries) : '—'}</td>
                    <td className={cn('py-2 px-3 text-right tabular-nums font-semibold', m.profit >= 0 ? 'text-gray-900' : 'text-red-600')}>
                      {formatCZK(m.profit)}
                    </td>
                    <td className={cn('py-2 px-3 text-right tabular-nums', mp == null ? 'text-gray-400' : mp >= 20 ? 'text-green-700' : mp >= 0 ? 'text-amber-600' : 'text-red-600')}>
                      {mp == null ? '—' : `${mp} %`}
                    </td>
                    <td className={cn('py-2 pl-3 text-right tabular-nums', tp == null ? 'text-gray-400' : tp <= 65 ? 'text-green-700' : 'text-red-600')}>
                      {tp == null ? '—' : `${tp} %`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td className="py-2.5 pr-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Celkem</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold text-green-700">{formatCZK(totals.income)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold">{formatCZK(totals.wages)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold">{formatCZK(totals.travel)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold">{formatCZK(totals.fixed)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold">{formatCZK(totals.extra)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold">{formatCZK(totals.salaries)}</td>
                <td className={cn('py-2.5 px-3 text-right tabular-nums font-bold', totals.profit >= 0 ? 'text-gray-900' : 'text-red-600')}>
                  {formatCZK(totals.profit)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums font-bold">
                  {marginPct(totals) == null ? '—' : `${marginPct(totals)} %`}
                </td>
                <td className="py-2.5 pl-3 text-right tabular-nums font-bold">
                  {teamPct(totals) == null ? '—' : `${teamPct(totals)} %`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
