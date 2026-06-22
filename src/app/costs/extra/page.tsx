'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ExtraCost } from '@/types'

const CATEGORIES = ['software', 'hardware', 'cestování', 'kancelář', 'marketing', 'jiné']

export default function ExtraCostsPage() {
  const [costs, setCosts] = useState<ExtraCost[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentMonth())
  const months = getLastNMonths(12)

  const fetchCosts = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/costs/extra?month=${month}`)
    setCosts(await res.json())
    setLoading(false)
  }, [month])

  useEffect(() => { fetchCosts() }, [fetchCosts])

  const total = costs.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Extra náklady</h1>
          <p className="text-sm text-gray-500 mt-1">
            {costs.length} položek · {formatCZK(total)} celkem
          </p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" />Přidat náklad</Button>
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

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Název', 'Částka', 'Datum', 'Kategorie', 'Poznámka'].map((h, i, arr) => (
                  <th key={h || i} className={cn(
                    'px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide',
                    i === 1 ? 'text-right' : 'text-left',
                    i < arr.length - 1 && 'border-r border-gray-100',
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {costs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Žádné záznamy</td></tr>
              ) : costs.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/70">
                  <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{c.name}</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-600 tabular-nums border-r border-gray-100">{formatCZK(c.amount)}</td>
                  <td className="px-3 py-2 text-gray-500 tabular-nums border-r border-gray-100">{formatDate(c.date)}</td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    {c.category && (
                      <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs">{c.category}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{c.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            {costs.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-3 py-2.5 font-semibold text-xs text-gray-500 uppercase tracking-wide border-r border-gray-100">Celkem</td>
                  <td className="px-3 py-2.5 text-right font-bold text-red-600 tabular-nums border-r border-gray-100">{formatCZK(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
