'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { FixedCost } from '@/types'

export default function FixedCostsPage() {
  const [costs, setCosts] = useState<FixedCost[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchCosts() {
    setLoading(true)
    const res = await fetch('/api/costs/fixed')
    setCosts(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchCosts() }, [])

  async function toggleActive(cost: FixedCost) {
    const res = await fetch(`/api/costs/fixed/${cost.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !cost.active }),
    })
    if (res.ok) setCosts(prev => prev.map(c => c.id === cost.id ? { ...c, active: !c.active } : c))
  }

  const total = costs.filter(c => c.active).reduce((s, c) => s + c.amount, 0)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fixní náklady</h1>
          <p className="text-sm text-gray-500 mt-1">
            Měsíčně: <span className="font-semibold text-red-600">{formatCZK(total)}</span>
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Přidat položku
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Název', 'Měsíční částka', 'Poznámka', 'Aktivní', ''].map((h, i, arr) => (
                  <th key={h || i} className={cn(
                    'px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide',
                    i === 1 ? 'text-right' : 'text-left',
                    i < arr.length - 1 && 'border-r border-gray-100',
                  )}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {costs.map((cost) => (
                <tr key={cost.id} className={cn('hover:bg-gray-50/70 transition-colors group', !cost.active && 'opacity-50')}>
                  <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{cost.name}</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-600 tabular-nums border-r border-gray-100">{formatCZK(cost.amount)}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs border-r border-gray-100">{cost.note ?? '—'}</td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cost.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {cost.active ? 'Aktivní' : 'Neaktivní'}
                    </span>
                  </td>
                  <td className="px-3 py-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 text-gray-400 hover:text-primary-900 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(cost)}
                      className="p-1 text-gray-400 hover:text-primary-900 transition-colors"
                      title={cost.active ? 'Deaktivovat' : 'Aktivovat'}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-3 py-2.5 font-semibold text-xs text-gray-500 uppercase tracking-wide border-r border-gray-100">Celkem (aktivní)</td>
                <td className="px-3 py-2.5 text-right font-bold text-red-600 tabular-nums border-r border-gray-100">{formatCZK(total)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
