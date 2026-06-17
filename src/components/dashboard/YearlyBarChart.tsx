'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCZK } from '@/lib/utils'

const MONTH_NAMES = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čer', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro']

interface YearlyBar { monthIdx: number; income: number; costs: number }
interface YearTotals { income: number; variable: number; extra: number; fixed: number }

export function YearlyBarChart({ data, totals, year }: { data: YearlyBar[]; totals: YearTotals; year: number }) {
  const chartData = data.map(d => ({
    month: MONTH_NAMES[d.monthIdx - 1],
    Příjmy: d.income,
    Náklady: d.costs,
  }))

  const totalCosts = totals.variable + totals.extra + totals.fixed
  const profit = totals.income - totalCosts

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <CardTitle className="text-base font-semibold">Příjmy vs Náklady · {year}</CardTitle>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Příjmy{' '}
              <span className="font-medium text-green-700 tabular-nums">{formatCZK(totals.income)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Náklady{' '}
              <span className="font-medium text-red-600 tabular-nums">{formatCZK(totalCosts)}</span>
            </span>
            <span className={profit >= 0 ? 'text-primary-900 font-medium' : 'text-red-600 font-medium'}>
              Zisk: {formatCZK(profit)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
              <YAxis
                tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                width={48}
              />
              <Tooltip
                formatter={(v: number) => formatCZK(v)}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar dataKey="Příjmy" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Bar dataKey="Náklady" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
