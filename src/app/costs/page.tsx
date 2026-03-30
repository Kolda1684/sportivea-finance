'use client'

import { useEffect, useState, useCallback } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import type { VariableCost, FixedCost, ExtraCost } from '@/types'
import { cn } from '@/lib/utils'

type View = 'vše' | 'zaměstnanci' | 'klienti'

type CostRow = {
  id: string
  type: 'variabilní' | 'fixní' | 'extra'
  name: string
  client: string | null
  team_member: string | null
  amount: number
  date: string | null
  category: string | null
}

export default function AllCostsPage() {
  const [variable, setVariable] = useState<VariableCost[]>([])
  const [fixed, setFixed] = useState<FixedCost[]>([])
  const [extra, setExtra] = useState<ExtraCost[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentMonth())
  const [typeFilter, setTypeFilter] = useState<'all' | 'variabilní' | 'fixní' | 'extra'>('all')
  const [view, setView] = useState<View>('vše')

  const months = getLastNMonths(12)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [varRes, fixRes, extRes] = await Promise.all([
      fetch(`/api/costs/variable?month=${month}`).then(r => r.json()),
      fetch('/api/costs/fixed').then(r => r.json()),
      fetch(`/api/costs/extra?month=${month}`).then(r => r.json()),
    ])
    setVariable(varRes)
    setFixed(fixRes.filter((f: FixedCost) => f.active))
    setExtra(extRes)
    setLoading(false)
  }, [month])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rows: CostRow[] = [
    ...variable.map(v => ({
      id: v.id,
      type: 'variabilní' as const,
      name: v.task_name ?? v.task_type ?? 'Bez názvu',
      client: v.client,
      team_member: v.team_member,
      amount: v.price ?? 0,
      date: v.date,
      category: v.task_type,
    })),
    ...fixed.map(f => ({
      id: f.id,
      type: 'fixní' as const,
      name: f.name,
      client: null,
      team_member: null,
      amount: f.amount,
      date: null,
      category: null,
    })),
    ...extra.map(e => ({
      id: e.id,
      type: 'extra' as const,
      name: e.name,
      client: null,
      team_member: null,
      amount: e.amount,
      date: e.date,
      category: e.category,
    })),
  ]

  const filtered = (typeFilter === 'all' ? rows : rows.filter(r => r.type === typeFilter))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.amount - a.amount)

  const totalVariable = variable.reduce((s, v) => s + (v.price ?? 0), 0)
  const totalFixed = fixed.reduce((s, f) => s + f.amount, 0)
  const totalExtra = extra.reduce((s, e) => s + e.amount, 0)
  const totalAll = totalVariable + totalFixed + totalExtra

  // Agregace po zaměstnancích (variabilní náklady)
  const byMember = variable.reduce<Record<string, { price: number; hours: number; tasks: number }>>((acc, v) => {
    const name = v.team_member ?? 'Neznámý'
    if (!acc[name]) acc[name] = { price: 0, hours: 0, tasks: 0 }
    acc[name].price += v.price ?? 0
    acc[name].hours += v.hours ?? 0
    acc[name].tasks += 1
    return acc
  }, {})

  // Agregace po klientech (variabilní náklady)
  const byClient = variable.reduce<Record<string, { price: number; hours: number; tasks: number }>>((acc, v) => {
    const name = v.client ?? 'Bez klienta'
    if (!acc[name]) acc[name] = { price: 0, hours: 0, tasks: 0 }
    acc[name].price += v.price ?? 0
    acc[name].hours += v.hours ?? 0
    acc[name].tasks += 1
    return acc
  }, {})

  const typeBadge: Record<string, string> = {
    variabilní: 'bg-blue-100 text-blue-700',
    fixní: 'bg-purple-100 text-purple-700',
    extra: 'bg-orange-100 text-orange-700',
  }

  const tabs: { id: View; label: string }[] = [
    { id: 'vše', label: 'Všechny náklady' },
    { id: 'zaměstnanci', label: 'Zaměstnanci' },
    { id: 'klienti', label: 'Klienti' },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Hlavička */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Přehled nákladů</h1>
        <p className="text-sm text-gray-500 mt-1">
          {formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)} · celkem {formatCZK(totalAll)}
        </p>
      </div>

      {/* Souhrnné karty */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Celkem', value: totalAll, count: rows.length, color: 'text-gray-900', filter: 'all' as const },
          { label: 'Variabilní', value: totalVariable, count: variable.length, color: 'text-blue-600', filter: 'variabilní' as const },
          { label: 'Fixní', value: totalFixed, count: fixed.length, color: 'text-purple-600', filter: 'fixní' as const },
          { label: 'Extra', value: totalExtra, count: extra.length, color: 'text-orange-600', filter: 'extra' as const },
        ].map(card => (
          <div
            key={card.label}
            onClick={() => { setTypeFilter(card.filter); setView('vše') }}
            className={cn(
              'rounded-xl border bg-white p-4 cursor-pointer transition-all hover:shadow-sm',
              typeFilter === card.filter && view === 'vše' && 'border-primary-900 shadow-sm'
            )}
          >
            <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
            <p className={cn('text-xl font-bold mt-1', card.color)}>{formatCZK(card.value)}</p>
            <p className="text-xs text-muted-foreground">{card.count} položek</p>
          </div>
        ))}
      </div>

      {/* Tabs + filtr měsíce */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-lg border bg-white p-1 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                view === tab.id
                  ? 'bg-primary-900 text-white'
                  : 'text-muted-foreground hover:bg-gray-100'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {formatMonth(m).charAt(0).toUpperCase() + formatMonth(m).slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <>
          {/* VIEW: Zaměstnanci */}
          {view === 'zaměstnanci' && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Zaměstnanec', 'Úkonů', 'Hodin', 'Náklady'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.keys(byMember).length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Žádná data</td></tr>
                  ) : Object.entries(byMember)
                    .sort(([, a], [, b]) => b.price - a.price)
                    .map(([name, d]) => (
                      <tr key={name} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">{name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{d.tasks}</td>
                        <td className="px-4 py-3 text-muted-foreground">{d.hours} h</td>
                        <td className="px-4 py-3 font-bold text-red-600">{formatCZK(d.price)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-muted-foreground">CELKEM</td>
                    <td className="px-4 py-3 font-bold text-red-600">
                      {formatCZK(Object.values(byMember).reduce((s, d) => s + d.price, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* VIEW: Klienti */}
          {view === 'klienti' && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Klient', 'Úkonů', 'Hodin', 'Náklady'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.keys(byClient).length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Žádná data</td></tr>
                  ) : Object.entries(byClient)
                    .sort(([, a], [, b]) => b.price - a.price)
                    .map(([name, d]) => (
                      <tr key={name} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">{name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{d.tasks}</td>
                        <td className="px-4 py-3 text-muted-foreground">{d.hours} h</td>
                        <td className="px-4 py-3 font-bold text-red-600">{formatCZK(d.price)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-muted-foreground">CELKEM</td>
                    <td className="px-4 py-3 font-bold text-red-600">
                      {formatCZK(Object.values(byClient).reduce((s, d) => s + d.price, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* VIEW: Všechny náklady */}
          {view === 'vše' && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Typ', 'Název', 'Klient', 'Zaměstnanec', 'Datum', 'Částka'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Žádné záznamy</td></tr>
                  ) : filtered.map(row => (
                    <tr key={`${row.type}-${row.id}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', typeBadge[row.type])}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium max-w-[200px] truncate" title={row.name}>
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {row.client ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {row.team_member ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{row.date ? formatDate(row.date) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-600">{formatCZK(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 font-bold text-sm text-muted-foreground">
                      CELKEM {typeFilter !== 'all' && `(${typeFilter})`}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600 text-base">
                      {formatCZK(filtered.reduce((s, r) => s + r.amount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
