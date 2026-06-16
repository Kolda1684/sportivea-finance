'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Table2, Columns, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddIncomeModal } from '@/components/income/AddIncomeModal'
import { IncomeKanban } from '@/components/income/IncomeKanban'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate, incomeStatusConfig, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import type { Income, IncomeStatus } from '@/types'
import { cn } from '@/lib/utils'

const BILLED_TO_COLORS: Record<string, string> = {
  Martin:    'bg-blue-100 text-blue-800',
  Honza:     'bg-orange-100 text-orange-800',
  Sportivea: 'bg-green-100 text-green-800',
}

const STATUS_LABEL: Record<IncomeStatus, string> = {
  cekame: 'Čekáme',
  potvrzeno: 'Potvrzeno',
  vystaveno: 'Vystaveno',
  zaplaceno: 'Zaplaceno',
}

const ALL_STATUSES: IncomeStatus[] = ['cekame', 'potvrzeno', 'vystaveno', 'zaplaceno']

type SortKey = 'client' | 'project_name' | 'amount' | 'date' | 'status' | 'billed_to'
type SortDir = 'asc' | 'desc'
type GroupBy = 'none' | 'status' | 'client' | 'billed_to'

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

export default function IncomePage() {
  const [view, setView] = useState<'table' | 'kanban'>('table')
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentMonth())
  const [statusFilter, setStatusFilter] = useState<Set<IncomeStatus>>(new Set(ALL_STATUSES))
  const [addOpen, setAddOpen] = useState(false)
  const [editIncome, setEditIncome] = useState<Income | null>(null)
  const [sortKey, setSortKey] = useState<SortKey | null>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')

  const months = getLastNMonths(12)

  const fetchIncomes = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ month })
    const res = await fetch(`/api/income?${params}`)
    const data: Income[] = await res.json()
    setIncomes(data)
    setLoading(false)
  }, [month])

  useEffect(() => { fetchIncomes() }, [fetchIncomes])

  async function handleDelete(id: string) {
    if (!confirm('Opravdu smazat tento příjem?')) return
    setIncomes(prev => prev.filter(i => i.id !== id))
    await fetch(`/api/income/${id}`, { method: 'DELETE' })
  }

  async function handleStatusChange(id: string, status: IncomeStatus) {
    setIncomes(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    await fetch(`/api/income/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  async function handleBilledToChange(id: string, billed_to: string | null) {
    setIncomes(prev => prev.map(i => i.id === id ? { ...i, billed_to } : i))
    await fetch(`/api/income/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billed_to }),
    })
  }

  function toggleStatusFilter(s: IncomeStatus) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc')
    }
  }

  // Filter + sort
  const filteredSorted = useMemo(() => {
    const filtered = incomes.filter(i => statusFilter.has(i.status))
    if (!sortKey) return filtered
    const sorted = [...filtered].sort((a, b) => {
      const cmp = compareValues(a[sortKey] as unknown, b[sortKey] as unknown)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [incomes, statusFilter, sortKey, sortDir])

  const totalAmount = filteredSorted.reduce((s, i) => s + (i.amount ?? 0), 0)

  // Grouping
  const grouped = useMemo(() => {
    if (groupBy === 'none') return null
    const groups = new Map<string, Income[]>()
    for (const inc of filteredSorted) {
      const key = (() => {
        if (groupBy === 'status') return STATUS_LABEL[inc.status]
        if (groupBy === 'client') return inc.client || '— bez klienta —'
        if (groupBy === 'billed_to') return inc.billed_to || '— bez fakturace —'
        return ''
      })()
      const arr = groups.get(key) ?? []
      arr.push(inc)
      groups.set(key, arr)
    }
    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      items,
      total: items.reduce((s, i) => s + (i.amount ?? 0), 0),
    }))
  }, [filteredSorted, groupBy])

  return (
    <div className="p-8 space-y-5">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Příjmy & Projekty</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filteredSorted.length} záznamů · <span className="font-semibold text-green-700">{formatCZK(totalAmount)}</span> celkem
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Přidat příjem
        </Button>
      </div>

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

        {/* Multi-select status filter — pill toggles */}
        <div className="flex items-center gap-1 bg-white border rounded-lg p-1">
          {ALL_STATUSES.map(s => {
            const active = statusFilter.has(s)
            const cfg = incomeStatusConfig[s]
            return (
              <button
                key={s}
                onClick={() => toggleStatusFilter(s)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  active ? cfg.className : 'text-gray-400 hover:bg-gray-100',
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            )
          })}
        </div>

        {/* Group by */}
        <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Seskupit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Bez seskupení</SelectItem>
            <SelectItem value="status">Seskupit podle Status</SelectItem>
            <SelectItem value="client">Seskupit podle Klient</SelectItem>
            <SelectItem value="billed_to">Seskupit podle Fakturace</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center rounded-lg border bg-white p-1 gap-1">
          <button
            onClick={() => setView('table')}
            className={cn('rounded p-1.5 transition-colors', view === 'table' ? 'bg-primary-900 text-white' : 'text-gray-500 hover:bg-gray-100')}
            title="Tabulka"
          >
            <Table2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('kanban')}
            className={cn('rounded p-1.5 transition-colors', view === 'kanban' ? 'bg-primary-900 text-white' : 'text-gray-500 hover:bg-gray-100')}
            title="Kanban"
          >
            <Columns className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : view === 'kanban' ? (
        <IncomeKanban incomes={filteredSorted} onStatusChange={handleStatusChange} />
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortHeader label="Klient" sortKey="client" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Projekt" sortKey="project_name" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Příjem" sortKey="amount" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} align="right" />
                <SortHeader label="Datum" sortKey="date" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <SortHeader label="Fakturace" sortKey="billed_to" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
                <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left border-r border-gray-100">Poznámka</th>
                <th className="px-3 py-2 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">Žádné záznamy pro vybrané filtry</td>
                </tr>
              )}

              {grouped !== null && grouped.map(group => (
                <RowGroup key={group.key} title={group.key} subtotal={group.total} colSpan={8}>
                  {group.items.map(income => (
                    <IncomeRow
                      key={income.id}
                      income={income}
                      onStatusChange={handleStatusChange}
                      onBilledToChange={handleBilledToChange}
                      onEdit={() => setEditIncome(income)}
                      onDelete={() => handleDelete(income.id)}
                    />
                  ))}
                </RowGroup>
              ))}

              {grouped === null && filteredSorted.map(income => (
                <IncomeRow
                  key={income.id}
                  income={income}
                  onStatusChange={handleStatusChange}
                  onBilledToChange={handleBilledToChange}
                  onEdit={() => setEditIncome(income)}
                  onDelete={() => handleDelete(income.id)}
                />
              ))}
            </tbody>
            {filteredSorted.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">CELKEM</td>
                  <td className="px-3 py-2.5 font-bold text-green-700 text-right tabular-nums">{formatCZK(totalAmount)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <AddIncomeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(income) => setIncomes(prev => [income, ...prev])}
      />
      <AddIncomeModal
        open={!!editIncome}
        editing={editIncome}
        onClose={() => setEditIncome(null)}
        onSaved={(updated) => setIncomes(prev => prev.map(i => i.id === updated.id ? updated : i))}
      />
    </div>
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

function IncomeRow({ income, onStatusChange, onBilledToChange, onEdit, onDelete }: {
  income: Income
  onStatusChange: (id: string, s: IncomeStatus) => void
  onBilledToChange: (id: string, b: string | null) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const cfg = incomeStatusConfig[income.status]
  return (
    <tr className="hover:bg-gray-50/70 group">
      <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{income.client}</td>
      <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{income.project_name}</td>
      <td className="px-3 py-2 font-semibold text-green-700 text-right tabular-nums border-r border-gray-100">
        {income.amount != null ? formatCZK(income.amount) : '—'}
      </td>
      <td className="px-3 py-2 text-gray-500 tabular-nums border-r border-gray-100">{formatDate(income.date)}</td>
      <td className="px-3 py-2 border-r border-gray-100">
        <select
          value={income.status}
          onChange={e => onStatusChange(income.id, e.target.value as IncomeStatus)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold border-0 cursor-pointer appearance-none text-center',
            cfg.className
          )}
        >
          {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 border-r border-gray-100">
        <select
          value={income.billed_to ?? ''}
          onChange={e => onBilledToChange(income.id, e.target.value || null)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold border-0 cursor-pointer appearance-none text-center',
            income.billed_to
              ? (BILLED_TO_COLORS[income.billed_to] ?? 'bg-gray-100 text-gray-700')
              : 'bg-gray-100 text-gray-400'
          )}
        >
          <option value="">—</option>
          <option value="Martin">Martin</option>
          <option value="Honza">Honza</option>
          <option value="Sportivea">Sportivea</option>
        </select>
      </td>
      <td className="px-3 py-2 text-gray-500 text-xs max-w-[200px] truncate border-r border-gray-100" title={income.note ?? undefined}>
        {income.note ?? '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="text-gray-400 hover:text-gray-900 transition-colors" title="Upravit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="text-gray-400 hover:text-red-600 transition-colors" title="Smazat">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}
