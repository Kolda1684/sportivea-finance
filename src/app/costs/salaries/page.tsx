'use client'

import { useEffect, useState, useMemo } from 'react'
import { Plus, Check, Clock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatMonth, getCurrentMonth, getLastNMonths } from '@/lib/utils'

interface OwnerSalary {
  id: string
  owner_name: string
  amount: number
  month: string
  paid_on: string | null
  bank_transaction_id: string | null
  note: string | null
}

const DEFAULT_OWNERS = ['Jan Kolář', 'Martin Remeš']

export default function SalariesPage() {
  const [salaries, setSalaries] = useState<OwnerSalary[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [newOwnerName, setNewOwnerName] = useState('')
  const [showAddOwner, setShowAddOwner] = useState(false)

  async function fetchSalaries() {
    setLoading(true)
    const res = await fetch(`/api/costs/salaries?year=${year}`)
    if (res.ok) setSalaries(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchSalaries() }, [year])

  // Všichni majitelé (default + jakékoliv extra v datech)
  const owners = useMemo(() => {
    const set = new Set(DEFAULT_OWNERS)
    salaries.forEach(s => set.add(s.owner_name))
    return Array.from(set)
  }, [salaries])

  // Měsíce roku — 1..12 ve formátu "M,YYYY"
  const months = useMemo(() => {
    const all: string[] = []
    for (let m = 1; m <= 12; m++) all.push(`${m},${year}`)
    return all
  }, [year])

  // Lookup: salaries[owner][month] = záznam (nebo undefined)
  const lookup = useMemo(() => {
    const map: Record<string, Record<string, OwnerSalary>> = {}
    for (const s of salaries) {
      if (!map[s.owner_name]) map[s.owner_name] = {}
      map[s.owner_name][s.month] = s
    }
    return map
  }, [salaries])

  async function upsertCell(owner: string, month: string, patch: Partial<OwnerSalary>) {
    const key = `${owner}|${month}`
    setSavingKey(key)
    const existing = lookup[owner]?.[month]
    const body = {
      owner_name: owner,
      month,
      amount: patch.amount ?? existing?.amount ?? 0,
      paid_on: patch.paid_on !== undefined ? patch.paid_on : existing?.paid_on ?? null,
      note: patch.note !== undefined ? patch.note : existing?.note ?? null,
    }
    const res = await fetch('/api/costs/salaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const updated: OwnerSalary = await res.json()
      setSalaries(prev => {
        const idx = prev.findIndex(s => s.owner_name === owner && s.month === month)
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = updated
          return copy
        }
        return [...prev, updated]
      })
    }
    setSavingKey(null)
  }

  async function togglePaid(owner: string, month: string) {
    const existing = lookup[owner]?.[month]
    const today = new Date().toISOString().slice(0, 10)
    await upsertCell(owner, month, {
      paid_on: existing?.paid_on ? null : today,
    })
  }

  async function deleteSalary(id: string) {
    if (!confirm('Smazat tento záznam?')) return
    await fetch(`/api/costs/salaries/${id}`, { method: 'DELETE' })
    setSalaries(prev => prev.filter(s => s.id !== id))
  }

  async function addOwner() {
    const name = newOwnerName.trim()
    if (!name) return
    await upsertCell(name, getCurrentMonth(), { amount: 0 })
    setNewOwnerName('')
    setShowAddOwner(false)
  }

  // Totals
  const totalsByMonth = useMemo(() => {
    const m: Record<string, number> = {}
    for (const month of months) {
      m[month] = owners.reduce((s, o) => s + (lookup[o]?.[month]?.amount ?? 0), 0)
    }
    return m
  }, [months, owners, lookup])

  const totalsByOwner = useMemo(() => {
    const m: Record<string, { total: number; paid: number }> = {}
    for (const o of owners) {
      const all = months.map(mo => lookup[o]?.[mo]).filter(Boolean) as OwnerSalary[]
      m[o] = {
        total: all.reduce((s, x) => s + x.amount, 0),
        paid: all.filter(x => x.paid_on).reduce((s, x) => s + x.amount, 0),
      }
    }
    return m
  }, [owners, months, lookup])

  const grandTotal = Object.values(totalsByOwner).reduce((s, o) => s + o.total, 0)
  const paidTotal = Object.values(totalsByOwner).reduce((s, o) => s + o.paid, 0)

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platy majitelů</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rok {year}: <span className="font-semibold text-red-600">{formatCZK(grandTotal)}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              · vyplaceno {formatCZK(paidTotal)} ({grandTotal > 0 ? Math.round((paidTotal / grandTotal) * 100) : 0} %)
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm bg-white"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button size="sm" onClick={() => setShowAddOwner(s => !s)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Majitel
          </Button>
        </div>
      </div>

      {/* Add owner */}
      {showAddOwner && (
        <div className="rounded-lg border bg-white p-3 flex items-center gap-2">
          <input
            type="text"
            value={newOwnerName}
            onChange={e => setNewOwnerName(e.target.value)}
            placeholder="Jméno nového majitele"
            className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm"
            onKeyDown={e => e.key === 'Enter' && addOwner()}
            autoFocus
          />
          <Button size="sm" onClick={addOwner}>Přidat</Button>
          <Button size="sm" variant="outline" onClick={() => { setShowAddOwner(false); setNewOwnerName('') }}>Zrušit</Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-[140px] border-r border-gray-100">
                  Měsíc
                </th>
                {owners.map(o => (
                  <th key={o} className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-100">
                    {o}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Celkem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {months.map(month => {
                const isCurrent = month === getCurrentMonth()
                return (
                  <tr key={month} className={`hover:bg-gray-50/70 transition-colors ${isCurrent ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-3 py-2 font-medium capitalize whitespace-nowrap border-r border-gray-100">
                      {formatMonth(month)}
                      {isCurrent && <span className="ml-2 text-[10px] uppercase font-semibold text-blue-600">teď</span>}
                    </td>
                    {owners.map(owner => {
                      const cell = lookup[owner]?.[month]
                      const key = `${owner}|${month}`
                      const saving = savingKey === key
                      return (
                        <td key={key} className="px-2 py-1.5 border-r border-gray-100">
                          <div className="flex items-center gap-1.5 justify-end">
                            <input
                              type="number"
                              defaultValue={cell?.amount ?? ''}
                              placeholder="0"
                              disabled={saving}
                              className="w-24 text-right rounded border border-gray-200 px-2 py-1 text-sm tabular-nums focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none disabled:opacity-50"
                              onBlur={e => {
                                const v = parseFloat(e.target.value || '0')
                                const prev = cell?.amount ?? 0
                                if (v !== prev) upsertCell(owner, month, { amount: v })
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                            />
                            <button
                              onClick={() => togglePaid(owner, month)}
                              disabled={saving}
                              title={cell?.paid_on ? `Vyplaceno ${cell.paid_on}` : 'Označit jako vyplaceno'}
                              className={`p-1 rounded transition-colors ${cell?.paid_on
                                ? 'text-green-600 hover:bg-green-100'
                                : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                            >
                              {cell?.paid_on ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                            </button>
                            {cell && (
                              <button
                                onClick={() => deleteSalary(cell.id)}
                                disabled={saving}
                                title="Smazat záznam"
                                className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-red-600">
                      {totalsByMonth[month] > 0 ? formatCZK(totalsByMonth[month]) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-3 py-2.5 font-semibold text-xs uppercase tracking-wide text-gray-500 border-r border-gray-100">Celkem {year}</td>
                {owners.map(o => (
                  <td key={o} className="px-3 py-2.5 text-right font-bold text-red-600 tabular-nums border-r border-gray-100">
                    {formatCZK(totalsByOwner[o]?.total ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-bold text-red-700 tabular-nums">
                  {formatCZK(grandTotal)}
                </td>
              </tr>
              <tr className="text-xs text-gray-500">
                <td className="px-3 pb-2 border-r border-gray-100">z toho vyplaceno</td>
                {owners.map(o => (
                  <td key={o} className="px-3 pb-2 text-right tabular-nums border-r border-gray-100">
                    {formatCZK(totalsByOwner[o]?.paid ?? 0)}
                  </td>
                ))}
                <td className="px-3 pb-2 text-right tabular-nums">{formatCZK(paidTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        💡 Tip: Kliknutím na hodiny <Clock className="inline h-3 w-3" /> označíš plat jako vyplaceno (dnes).
        Plat lze pozdějí napárovat s bankovní transakcí přes detail.
      </p>
    </div>
  )
}
