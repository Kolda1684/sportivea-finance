'use client'

import { useState, useMemo } from 'react'
import { Table2, PieChart as PieIcon } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { formatCZK } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ActiveInvoicesTable } from './ActiveInvoicesTable'
import type { Income, IncomeStatus } from '@/types'

type ViewMode = 'table' | 'pie'
type GroupKey = 'client' | 'status' | 'billed_to'

const STATUS_LABEL: Record<IncomeStatus, string> = {
  cekame: 'Čekáme',
  potvrzeno: 'Potvrzeno',
  vystaveno: 'Vystaveno',
  zaplaceno: 'Zaplaceno',
}

const STATUS_COLORS: Record<IncomeStatus, string> = {
  cekame:    '#f59e0b',
  potvrzeno: '#3b82f6',
  vystaveno: '#8b5cf6',
  zaplaceno: '#16a34a',
}

const BILLED_TO_COLORS: Record<string, string> = {
  Martin:    '#3b82f6',
  Honza:     '#f97316',
  Sportivea: '#16a34a',
}

// Stabilní paleta pro klienty (cyklí kolem)
const CLIENT_PALETTE = [
  '#0ea5e9', '#10b981', '#f97316', '#8b5cf6', '#ec4899',
  '#f59e0b', '#06b6d4', '#22c55e', '#a855f7', '#ef4444',
  '#3b82f6', '#14b8a6',
]

export function IncomesSection({ incomes }: { incomes: Income[] }) {
  const [view, setView] = useState<ViewMode>('table')
  const [groupBy, setGroupBy] = useState<GroupKey>('client')

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50/40">
          <div className="flex items-center rounded-lg border bg-white p-1 gap-1">
            <button
              onClick={() => setView('table')}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'table' ? 'bg-primary-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              <Table2 className="h-3.5 w-3.5" />
              Tabulka
            </button>
            <button
              onClick={() => setView('pie')}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'pie' ? 'bg-primary-900 text-white' : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              <PieIcon className="h-3.5 w-3.5" />
              Koláč
            </button>
          </div>

          {view === 'pie' && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              Rozdělit podle:
              <select
                value={groupBy}
                onChange={e => setGroupBy(e.target.value as GroupKey)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-900"
              >
                <option value="client">Klient</option>
                <option value="status">Status</option>
                <option value="billed_to">Fakturace</option>
              </select>
            </div>
          )}
        </div>

        {view === 'table'
          ? <ActiveInvoicesTable incomes={incomes} />
          : <IncomesPie incomes={incomes} groupBy={groupBy} />
        }
      </CardContent>
    </Card>
  )
}

function IncomesPie({ incomes, groupBy }: { incomes: Income[]; groupBy: GroupKey }) {
  const slices = useMemo(() => {
    const groups = new Map<string, number>()
    for (const inc of incomes) {
      if (inc.amount == null) continue
      const key = (() => {
        if (groupBy === 'client') return inc.client || '— bez klienta —'
        if (groupBy === 'status') return STATUS_LABEL[inc.status]
        if (groupBy === 'billed_to') return inc.billed_to || '— bez fakturace —'
        return ''
      })()
      groups.set(key, (groups.get(key) ?? 0) + Number(inc.amount))
    }
    return Array.from(groups.entries())
      .map(([name, value], i) => ({
        name, value,
        color: pickColor(name, groupBy, i),
      }))
      .filter(s => s.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [incomes, groupBy])

  const total = slices.reduce((s, r) => s + r.value, 0)

  if (slices.length === 0) {
    return <div className="px-4 py-16 text-center text-gray-400 text-sm">Žádné příjmy za tento měsíc</div>
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              formatter={(v: number, name) => [
                `${formatCZK(v)} (${Math.round((v / total) * 100)} %)`,
                name,
              ]}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: 12 }}
              iconType="circle"
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={2}
              label={({ percent }: { percent?: number }) =>
                percent && percent > 0.05 ? `${Math.round(percent * 100)} %` : ''
              }
              labelLine={false}
            >
              {slices.map(s => <Cell key={s.name} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {slices.map(s => (
          <div key={s.name} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-sm font-medium text-gray-900 truncate">{s.name}</span>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-sm font-semibold text-green-700 tabular-nums">{formatCZK(s.value)}</div>
              <div className="text-xs text-gray-400 tabular-nums">{Math.round((s.value / total) * 100)} %</div>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 px-2 py-2 border-t-2 mt-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Celkem</span>
          <span className="font-bold text-green-700 tabular-nums">{formatCZK(total)}</span>
        </div>
      </div>
    </div>
  )
}

function pickColor(name: string, groupBy: GroupKey, idx: number): string {
  if (groupBy === 'status') {
    const statusKey = Object.entries(STATUS_LABEL).find(([, l]) => l === name)?.[0] as IncomeStatus | undefined
    if (statusKey) return STATUS_COLORS[statusKey]
  }
  if (groupBy === 'billed_to' && BILLED_TO_COLORS[name]) {
    return BILLED_TO_COLORS[name]
  }
  return CLIENT_PALETTE[idx % CLIENT_PALETTE.length]
}
