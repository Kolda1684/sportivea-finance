'use client'

import { useState, useMemo } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCZK } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface EmployeeRow { member: string; count: number; hours: number; price: number }

type SortKey = 'member' | 'hours' | 'count' | 'price'
type SortDir = 'asc' | 'desc'

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

export function EmployeesTable({ members }: { members: EmployeeRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>('price')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'member' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return members
    return [...members].sort((a, b) => {
      const cmp = compareValues(a[sortKey] as unknown, b[sortKey] as unknown)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [members, sortKey, sortDir])

  const totalHours = members.reduce((s, m) => s + Number(m.hours ?? 0), 0)
  const totalCount = members.reduce((s, m) => s + (m.count ?? 0), 0)
  const totalPrice = members.reduce((s, m) => s + Number(m.price ?? 0), 0)

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-10 text-center text-gray-400 text-sm">
          <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          Žádný zápis za tento měsíc
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50/60 border-b">
            <tr>
              <SortHeader label="Jméno"      sortKey="member" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} />
              <SortHeader label="Hodin"      sortKey="hours"  currentKey={sortKey} currentDir={sortDir} onClick={handleSort} align="right" />
              <SortHeader label="Úkonů"      sortKey="count"  currentKey={sortKey} currentDir={sortDir} onClick={handleSort} align="right" />
              <SortHeader label="Cena celkem" sortKey="price" currentKey={sortKey} currentDir={sortDir} onClick={handleSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(m => (
              <tr key={m.member} className="hover:bg-gray-50/70">
                <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{m.member}</td>
                <td className="px-3 py-2 text-right text-gray-500 tabular-nums border-r border-gray-100">
                  {Number(m.hours).toLocaleString('cs-CZ')} h
                </td>
                <td className="px-3 py-2 text-right text-gray-500 tabular-nums border-r border-gray-100">{m.count}</td>
                <td className="px-3 py-2 text-right font-semibold text-green-700 tabular-nums">{formatCZK(m.price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50/60 border-t-2 border-gray-200">
            <tr>
              <td className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-100">Celkem</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 font-medium border-r border-gray-100">
                {totalHours.toLocaleString('cs-CZ')} h
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 font-medium border-r border-gray-100">{totalCount}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-green-700">{formatCZK(totalPrice)}</td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  )
}
