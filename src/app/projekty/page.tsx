'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderKanban, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCZK, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ProjectCostRow, ProjectIncomeRow } from '@/lib/project-stats'

interface ProjectWithStats {
  id: string
  name: string
  client: string | null
  keywords: string
  date_from: string | null
  date_to: string | null
  active: boolean
  stats: { income: number; costs: number; travel: number; profit: number }
  incomeRows: ProjectIncomeRow[]
  costRows: ProjectCostRow[]
}

interface FormState {
  name: string
  client: string
  keywords: string
  date_from: string
  date_to: string
}

const EMPTY_FORM: FormState = { name: '', client: '', keywords: '', date_from: '', date_to: '' }

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/projects')
    const data = await res.json()
    setNeedsMigration(Boolean(data.needsMigration))
    setProjects(data.projects ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: ProjectWithStats) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      client: p.client ?? '',
      keywords: p.keywords,
      date_from: p.date_from ?? '',
      date_to: p.date_to ?? '',
    })
    setShowForm(true)
  }

  async function submitForm() {
    if (!form.name.trim() || !form.keywords.trim()) return
    setSaving(true)
    const payload = {
      name: form.name,
      client: form.client || null,
      keywords: form.keywords,
      date_from: form.date_from || null,
      date_to: form.date_to || null,
    }
    if (editingId) {
      await fetch(`/api/projects/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false)
    setShowForm(false)
    fetchProjects()
  }

  async function removeProject(id: string) {
    if (!confirm('Smazat projekt? (Data příjmů a nákladů zůstávají, maže se jen definice projektu.)')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    fetchProjects()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-8 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projekty</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ziskovost napříč projekty — příjmy a náklady se přiřazují podle klíčových slov
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Nový projekt</Button>
      </div>

      {needsMigration && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Tabulka projektů v databázi zatím neexistuje — je potřeba spustit SQL migraci 029 v Supabase.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Počítám projekty…
        </div>
      ) : projects.length === 0 && !needsMigration ? (
        <div className="rounded-xl border bg-white p-10 text-center text-gray-400">
          <FolderKanban className="h-8 w-8 mx-auto mb-3 text-gray-300" />
          Zatím žádné projekty. Založ první — třeba „WTA Šťavnice&ldquo; s klíčovými slovy „WTA, Šťavnice&ldquo;.
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map(p => {
            const isOpen = expanded.has(p.id)
            const marginPct = p.stats.income > 0 ? Math.round((p.stats.profit / p.stats.income) * 100) : null
            return (
              <div key={p.id} className="rounded-xl border bg-white overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/70"
                  onClick={() => toggleExpand(p.id)}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {p.client && <span>{p.client} · </span>}
                      klíčová slova: {p.keywords}
                      {(p.date_from || p.date_to) && (
                        <span> · {p.date_from ? formatDate(p.date_from) : '…'} – {p.date_to ? formatDate(p.date_to) : '…'}</span>
                      )}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-5 text-right whitespace-nowrap">
                    <div>
                      <p className="text-xs text-gray-400">Příjmy</p>
                      <p className="font-semibold text-green-700 tabular-nums">{formatCZK(p.stats.income)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Náklady</p>
                      <p className="font-semibold text-red-600 tabular-nums">{formatCZK(p.stats.costs)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Zisk{marginPct != null && ` · ${marginPct} %`}</p>
                      <p className={cn('font-bold tabular-nums', p.stats.profit >= 0 ? 'text-gray-900' : 'text-red-600')}>
                        {formatCZK(p.stats.profit)}
                      </p>
                    </div>
                    <div className="flex gap-1 pl-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(p) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={e => { e.stopPropagation(); removeProject(p.id) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
                    {/* Příjmy */}
                    <div>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-green-700">
                        Příjmy ({p.incomeRows.length})
                      </p>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                          {p.incomeRows.length === 0 && (
                            <tr><td className="px-4 py-4 text-gray-400 text-xs">Žádné příjmy neodpovídají klíčovým slovům</td></tr>
                          )}
                          {p.incomeRows.map((r, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2 text-gray-900">{r.project_name || r.client || '—'}
                                {r.client && r.project_name && <span className="block text-xs text-gray-400">{r.client}</span>}
                              </td>
                              <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{r.date ? formatDate(r.date) : r.month}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-green-700 whitespace-nowrap">{formatCZK(r.amount ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Náklady */}
                    <div>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-red-600">
                        Náklady ({p.costRows.length})
                        {p.stats.travel > 0 && <span className="text-teal-600 normal-case font-normal"> · z toho cesťáky {formatCZK(p.stats.travel)}</span>}
                      </p>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                          {p.costRows.length === 0 && (
                            <tr><td className="px-4 py-4 text-gray-400 text-xs">Žádné tasky neodpovídají klíčovým slovům</td></tr>
                          )}
                          {p.costRows.map((r, i) => (
                            <tr key={i} className={cn(r.task_type === 'Cesťák' && 'bg-teal-50/40')}>
                              <td className="px-4 py-2">
                                <span className="text-gray-900">{r.task_name ?? '—'}</span>
                                <span className="block text-xs text-gray-400">
                                  {r.team_member}{r.hours ? ` · ${r.hours} h` : ''}{r.task_type === 'Cesťák' ? ' · cesťák' : ''}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">{r.date ? formatDate(r.date) : r.month}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-red-600 whitespace-nowrap">{formatCZK(r.price ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Formulář */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-lg">{editingId ? 'Upravit projekt' : 'Nový projekt'}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500">Název projektu</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="WTA Šťavnice" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Klíčová slova (oddělená čárkou)</label>
                <Input value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} placeholder="WTA, Šťavnice" />
                <p className="text-xs text-gray-400 mt-1">Podle nich se přiřazují tasky z Notionu a příjmy z faktur</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Klient (volitelné, jen popisné)</label>
                <Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Český tenis" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Od (volitelné)</label>
                  <Input type="date" value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Do (volitelné)</label>
                  <Input type="date" value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowForm(false)}>Zrušit</Button>
              <Button onClick={submitForm} disabled={saving || !form.name.trim() || !form.keywords.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? 'Uložit' : 'Vytvořit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
