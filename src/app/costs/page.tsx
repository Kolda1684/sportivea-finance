'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import type { VariableCost, FixedCost, ExtraCost } from '@/types'
import { cn } from '@/lib/utils'

type CostType = 'variabilní' | 'fixní' | 'extra'
type SortKey = 'type' | 'name' | 'client' | 'team_member' | 'date' | 'amount'
type SortDir = 'asc' | 'desc'
type GroupBy = 'none' | 'type' | 'client' | 'team_member'

interface CostRow {
  id: string
  type: CostType
  name: string
  client: string | null
  team_member: string | null
  amount: number
  date: string | null
}

const TYPE_BADGE: Record<CostType, string> = {
  variabilní: 'bg-blue-100 text-blue-700',
  fixní:      'bg-purple-100 text-purple-700',
  extra:      'bg-orange-100 text-orange-700',
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'cs')
}

function SortHeader({ label, sortKey, currentKey, currentDir, onClick, align = 'left' }: {
  label: string; sortKey: SortKey; currentKey: SortKey | null; currentDir: SortDir
  onClick: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = currentKey === sortKey
  return (
    <th className={cn(
      'px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-100 last:border-r-0',
      align === 'right' ? 'text-right' : 'text-left',
    )}>
      <button onClick={() => onClick(sortKey)} className="inline-flex items-center gap-1 hover:text-gray-900">
        {label}
        {!active && <ArrowUpDown className="h-3 w-3 text-gray-300" />}
        {active && currentDir === 'asc' && <ArrowUp className="h-3 w-3" />}
        {active && currentDir === 'desc' && <ArrowDown className="h-3 w-3" />}
      </button>
    </th>
  )
}

export default function AllCostsPage() {
  const [variable, setVariable] = useState<VariableCost[]>([])
  const [fixed, setFixed] = useState<FixedCost[]>([])
  const [extra, setExtra] = useState<ExtraCost[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentMonth())
  const [typeFilter, setTypeFilter] = useState<Set<CostType>>(new Set<CostType>(['variabilní', 'fixní', 'extra']))
  const [sortKey, setSortKey] = useState<SortKey | null>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')

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

  function toggleType(t: CostType) {
    setTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc')
    }
  }

  const allRows = useMemo<CostRow[]>(() => [
    ...variable.map(v => ({
      id: v.id, type: 'variabilní' as const,
      name: v.task_name ?? v.task_type ?? 'Bez názvu',
      client: v.client, team_member: v.team_member,
      amount: v.price ?? 0, date: v.date,
    })),
    ...fixed.map(f => ({
      id: f.id, type: 'fixní' as const, name: f.name,
      client: null, team_member: null, amount: f.amount, date: null,
    })),
    ...extra.map(e => ({
      id: e.id, type: 'extra' as const, name: e.name,
      client: null, team_member: null, amount: e.amount, date: e.date,
    })),
  ], [variable, fixed, extra])

  const filteredSorted = useMemo(() => {
    const filtered = allRows.filter(r => typeFilter.has(r.type))
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const cmp = compareValues(a[sortKey] as unknown, b[sortKey] as unknown)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [allRows, typeFilter, sortKey, sortDir])

  const totalAmount = filteredSorted.reduce((s, r) => s + r.amount, 0)
  const totalVariable = variable.reduce((s, v) => s + (v.price ?? 0), 0)
  const totalFixed = fixed.reduce((s, f) => s + f.amount, 0)
  const totalExtra = extra.reduce((s, e) => s + e.amount, 0)
  const totalAll = totalVariable + totalFixed + totalExtra

  const grouped = useMemo(() => {
    if (groupBy === 'none') return null
    const groups = new Map<string, CostRow[]>()
    for (const r of filteredSorted) {
      const key = (() => {
        if (groupBy === 'type') return r.type
        if (groupBy === 'client') return r.client ?? '— bez klienta —'
        if (groupBy === 'team_member') return r.team_member ?? '— bez zaměstnance —'
        return ''
      })()
      const arr = groups.get(key) ?? []
      arr.push(r)
      groups.set(key, arr)
    }
    return Array.from(groups.entries()).map(([key, items]) => ({
      key, items, total: items.reduce((s, i) => s + i.amount, 0),
    }))
  }, [filteredSorted, groupBy])

  return (
    <div className="p-8 space-y-5">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Přehled nákladů</h1>
        <p className="text-sm text-gray-500 mt-1">
          {formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)} · celkem <span className="font-semibold text-red-600">{formatCZK(totalAll)}</span>
        </p>
      </div>

      {/* KPI karty — klikatelné jako filter toggles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: 'Variabilní', value: totalVariable, count: variable.length, color: 'text-blue-600',   type: 'variabilní' as const },
          { label: 'Fixní',      value: totalFixed,    count: fixed.length,    color: 'text-purple-600', type: 'fixní' as const },
          { label: 'Extra',      value: totalExtra,    count: extra.length,    color: 'text-orange-600', type: 'extra' as const },
          { label: 'Celkem',     value: totalAll,      count: allRows.length,  color: 'text-gray-900',   type: null },
        ]).map(card => {
          const active = card.type === null
            ? typeFilter.size === 3
            : typeFilter.has(card.type) && typeFilter.size === 1
          return (
            <button
              key={card.label}
              onClick={() => {
                if (card.type === null) setTypeFilter(new Set<CostType>(['variabilní', 'fixní', 'extra']))
                else setTypeFilter(new Set<CostType>([card.type]))
              }}
              className={cn(
                'rounded-xl border bg-white p-4 text-left transition-all hover:shadow-sm',
                active && 'border-primary-900 shadow-sm'
              )}
            >
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className={cn('text-xl font-bold mt-1', card.color)}>{formatCZK(card.value)}</p>
              <p className="text-xs text-gray-500">{card.count} položek</p>
            </button>
          )
        })}
      </div>

      {/* Filtry */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {formatMonth(m).charAt(0).toUpperCase() + formatMonth(m).slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Multi-select typ — pill-toggles */}
        <div className="flex items-center gap-1 bg-white border rounded-lg p-1">
          {(['variabilní', 'fixní', 'extra'] as CostType[]).map(t => {
            const isActive = typeFilter.has(t)
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  isActive ? TYPE_BADGE[t] : 'text-gray-400 hover:bg-gray-100',
                )}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            )
          })}
        </div>

        <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Seskupit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Bez seskupení</SelectItem>
            <SelectItem value="type">Seskupit podle Typ</SelectItem>
            <SelectItem value="client">Seskupit podle Klient</SelectItem>
            <SelectItem value="team_member">Seskupit podle Zaměstnanec</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabulka */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortHeader label="Typ"         sortKey="type"        currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Název"       sortKey="name"        currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Klient"      sortKey="client"      currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Zaměstnanec" sortKey="team_member" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Datum"       sortKey="date"        currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Částka"      sortKey="amount"      currentKey={sortKey} currentDir={sortDir} onClick={handleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSorted.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Žádné záznamy pro vybrané filtry</td></tr>
              )}

              {grouped !== null && grouped.map(group => (
                <RowGroup key={group.key} title={group.key} subtotal={group.total} colSpan={6}>
                  {group.items.map(r => <CostRowEl key={`${r.type}-${r.id}`} row={r} />)}
                </RowGroup>
              ))}

              {grouped === null && filteredSorted.map(r => <CostRowEl key={`${r.type}-${r.id}`} row={r} />)}
            </tbody>
            {filteredSorted.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-100">CELKEM</td>
                  <td className="px-3 py-2.5 font-bold text-red-600 text-right tabular-nums">{formatCZK(totalAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

function CostRowEl({ row }: { row: CostRow }) {
  return (
    <tr className="hover:bg-gray-50/70 group">
      <td className="px-3 py-2 border-r border-gray-100">
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TYPE_BADGE[row.type])}>
          {row.type}
        </span>
      </td>
      <td className="px-3 py-2 font-medium text-gray-900 max-w-[220px] truncate border-r border-gray-100" title={row.name}>{row.name}</td>
      <td className="px-3 py-2 text-gray-500 text-xs border-r border-gray-100">{row.client ?? '—'}</td>
      <td className="px-3 py-2 text-gray-500 text-xs border-r border-gray-100">{row.team_member ?? '—'}</td>
      <td className="px-3 py-2 text-gray-500 tabular-nums border-r border-gray-100">{row.date ? formatDate(row.date) : '—'}</td>
      <td className="px-3 py-2 text-right font-semibold text-red-600 tabular-nums">{formatCZK(row.amount)}</td>
    </tr>
  )
}

function RowGroup({ title, subtotal, colSpan, children }: {
  title: string; subtotal: number; colSpan: number; children: React.ReactNode
}) {
  return (
    <>
      <tr className="bg-gray-50/60">
        <td colSpan={colSpan} className="px-3 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {title}
          <span className="ml-3 text-gray-400 normal-case tracking-normal tabular-nums">
            {formatCZK(subtotal)}
          </span>
        </td>
      </tr>
      {children}
    </>
  )
}
