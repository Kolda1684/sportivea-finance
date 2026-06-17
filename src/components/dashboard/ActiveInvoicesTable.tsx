'use client'

import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { formatCZK, formatDate, incomeStatusConfig } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Income, IncomeStatus } from '@/types'

type SortKey = 'client' | 'project_name' | 'date' | 'amount' | 'status' | 'billed_to'
type SortDir = 'asc' | 'desc'

const STATUS_LABEL: Record<IncomeStatus, string> = {
  cekame: 'Čekáme',
  potvrzeno: 'Potvrzeno',
  vystaveno: 'Vystaveno',
  zaplaceno: 'Zaplaceno',
}

const BILLED_TO_COLORS: Record<string, string> = {
  Martin:    'bg-blue-100 text-blue-800',
  Honza:     'bg-orange-100 text-orange-800',
  Sportivea: 'bg-green-100 text-green-800',
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

export function ActiveInvoicesTable({ incomes }: { incomes: Income[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return incomes
    return [...incomes].sort((a, b) => {
      const cmp = compareValues(a[sortKey] as unknown, b[sortKey] as unknown)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [incomes, sortKey, sortDir])

  const totalAmount = sorted.reduce((s, i) => s + (i.amount ?? 0), 0)

  return (
    <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50/60 border-b">
            <tr>
              <SortHeader label="Klient"     sortKey="client"       currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
              <SortHeader label="Projekt"    sortKey="project_name" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
              <SortHeader label="Datum"      sortKey="date"         currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
              <SortHeader label="Částka"     sortKey="amount"       currentKey={sortKey} currentDir={sortDir} onClick={handleSort} align="right" />
              <SortHeader label="Status"     sortKey="status"       currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
              <SortHeader label="Fakturace"  sortKey="billed_to"    currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Žádné otevřené dealy</td></tr>
            )}
            {sorted.map(inc => {
              const cfg = incomeStatusConfig[inc.status]
              return (
                <tr key={inc.id} className="hover:bg-gray-50/70">
                  <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{inc.client}</td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{inc.project_name}</td>
                  <td className="px-3 py-2 text-gray-500 tabular-nums border-r border-gray-100">{formatDate(inc.date)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700 tabular-nums border-r border-gray-100">
                    {inc.amount != null ? formatCZK(inc.amount) : '—'}
                  </td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', cfg.className)}>
                      {STATUS_LABEL[inc.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {inc.billed_to ? (
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        BILLED_TO_COLORS[inc.billed_to] ?? 'bg-gray-100 text-gray-700'
                      )}>
                        {inc.billed_to}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {sorted.length > 0 && (
            <tfoot className="bg-gray-50/60 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-100">Celkem</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-bold text-green-700 border-r border-gray-100">{formatCZK(totalAmount)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
  )
}
