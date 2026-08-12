'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [assigning, setAssigning] = useState(false)
  const months = getLastNMonths(12)

  const fetchCosts = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/costs/extra?month=${month}`)
    setCosts(await res.json())
    setLoading(false)
  }, [month])

  useEffect(() => { fetchCosts() }, [fetchCosts])

  // Výběr platí pro konkrétní řádky — po změně měsíce už nejsou vidět
  useEffect(() => { setSelected(new Set()) }, [month])

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => setProjects((d.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]))
  }, [])

  const total = costs.reduce((s, c) => s + c.amount, 0)
  const allSelected = costs.length > 0 && costs.every(c => selected.has(c.id))

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function assignToProject(value: string) {
    if (value === '__none') return
    setAssigning(true)
    try {
      const res = await fetch('/api/costs/extra/assign-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selected),
          project_id: value === '__clear' ? null : value,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? 'Přiřazení selhalo'); return }
      setSelected(new Set())
      fetchCosts()
    } finally {
      setAssigning(false)
    }
  }

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

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-2.5 flex-wrap">
          <span className="text-sm font-medium text-gray-900">
            Vybráno {selected.size} {selected.size === 1 ? 'položka' : selected.size < 5 ? 'položky' : 'položek'}
          </span>
          <Select onValueChange={assignToProject} disabled={assigning}>
            <SelectTrigger className="w-56 bg-white">
              <SelectValue placeholder="Přiřadit k projektu…" />
            </SelectTrigger>
            <SelectContent>
              {projects.length === 0 && <SelectItem value="__none" disabled>Žádné projekty</SelectItem>}
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              <SelectItem value="__clear">— zrušit přiřazení —</SelectItem>
            </SelectContent>
          </Select>
          {assigning && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-gray-500 hover:text-gray-900">
            Zrušit výběr
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-9 px-3 py-2 border-r border-gray-100">
                  <input
                    type="checkbox"
                    aria-label="Vybrat vše"
                    className="h-3.5 w-3.5 cursor-pointer align-middle accent-primary-900"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && !allSelected }}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(costs.map(c => c.id)))}
                  />
                </th>
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
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Žádné záznamy</td></tr>
              ) : costs.map(c => (
                <tr key={c.id} className={cn(selected.has(c.id) ? 'bg-primary-50/60' : 'hover:bg-gray-50/70')}>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <input
                      type="checkbox"
                      aria-label={`Vybrat ${c.name}`}
                      className="h-3.5 w-3.5 cursor-pointer align-middle accent-primary-900"
                      checked={selected.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">
                    {c.name}
                    {c.project_id && (
                      <span className="ml-1.5 inline-flex rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-900">
                        {projects.find(p => p.id === c.project_id)?.name ?? 'projekt'}
                      </span>
                    )}
                  </td>
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
                  <td className="border-r border-gray-100" />
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
