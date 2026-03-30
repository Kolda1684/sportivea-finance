'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Table2, Columns, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AddIncomeModal } from '@/components/income/AddIncomeModal'
import { IncomeKanban } from '@/components/income/IncomeKanban'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate, incomeStatusConfig, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import type { Income, IncomeStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<IncomeStatus, string> = {
  cekame:    'warning',
  potvrzeno: 'info',
  vystaveno: 'purple',
  zaplaceno: 'success',
}

const BILLED_TO_COLORS: Record<string, string> = {
  Martin:    'bg-blue-100 text-blue-800',
  Honza:     'bg-orange-100 text-orange-800',
  Sportivea: 'bg-green-100 text-green-800',
}

export default function IncomePage() {
  const [view, setView] = useState<'table' | 'kanban'>('table')
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentMonth())
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editIncome, setEditIncome] = useState<Income | null>(null)

  const months = getLastNMonths(12)

  const fetchIncomes = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ month })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const res = await fetch(`/api/income?${params}`)
    const data: Income[] = await res.json()
    setIncomes(data)
    setLoading(false)
  }, [month, statusFilter])

  useEffect(() => { fetchIncomes() }, [fetchIncomes])

  async function handleDelete(id: string) {
    if (!confirm('Opravdu smazat tento příjem?')) return
    setIncomes(prev => prev.filter(i => i.id !== id))
    await fetch(`/api/income/${id}`, { method: 'DELETE' })
  }

  async function handleStatusChange(id: string, status: IncomeStatus) {
    setIncomes(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    await fetch(`/api/income/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  const totalAmount = incomes.reduce((s, i) => s + (i.amount ?? 0), 0)

  return (
    <div className="p-8 space-y-6">
      {/* Hlavička */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Příjmy & Projekty</h1>
          <p className="text-sm text-gray-500 mt-1">
            {incomes.length} záznamů · {formatCZK(totalAmount)} celkem
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Přidat příjem
        </Button>
      </div>

      {/* Filtry + přepínač pohledu */}
      <div className="flex items-center gap-3 flex-wrap">
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny</SelectItem>
            <SelectItem value="cekame">Čekáme</SelectItem>
            <SelectItem value="potvrzeno">Potvrzeno</SelectItem>
            <SelectItem value="vystaveno">Vystaveno</SelectItem>
            <SelectItem value="zaplaceno">Zaplaceno</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center rounded-lg border bg-white p-1 gap-1">
          <button
            onClick={() => setView('table')}
            className={cn('rounded p-1.5 transition-colors', view === 'table' ? 'bg-primary-900 text-white' : 'text-muted-foreground hover:bg-muted')}
          >
            <Table2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('kanban')}
            className={cn('rounded p-1.5 transition-colors', view === 'kanban' ? 'bg-primary-900 text-white' : 'text-muted-foreground hover:bg-muted')}
          >
            <Columns className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Obsah */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : view === 'kanban' ? (
        <IncomeKanban incomes={incomes} onStatusChange={handleStatusChange} />
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Klient', 'Projekt', 'Příjem', 'Datum', 'Status', 'Fakturujeme na', 'Poznámka', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {incomes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Žádné záznamy
                  </td>
                </tr>
              ) : incomes.map((income) => {
                const cfg = incomeStatusConfig[income.status]
                return (
                  <tr key={income.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium">{income.client}</td>
                    <td className="px-4 py-3 text-muted-foreground">{income.project_name}</td>
                    <td className="px-4 py-3 font-bold text-green-700">
                      {income.amount != null ? formatCZK(income.amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(income.date)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={income.status}
                        onChange={(e) => handleStatusChange(income.id, e.target.value as IncomeStatus)}
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-semibold border-0 cursor-pointer appearance-none text-center',
                          cfg.className
                        )}
                      >
                        <option value="cekame">Čekáme</option>
                        <option value="potvrzeno">Potvrzeno</option>
                        <option value="vystaveno">Vystaveno</option>
                        <option value="zaplaceno">Zaplaceno</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {income.billed_to ? (
                        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', BILLED_TO_COLORS[income.billed_to] ?? 'bg-gray-100 text-gray-700')}>
                          {income.billed_to}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                      {income.note ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditIncome(income)}
                          className="text-muted-foreground hover:text-gray-900 transition-colors"
                          title="Upravit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(income.id)}
                          className="text-muted-foreground hover:text-red-600 transition-colors"
                          title="Smazat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {incomes.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">CELKEM</td>
                  <td className="px-4 py-2.5 font-bold text-green-700 text-sm">{formatCZK(totalAmount)}</td>
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
