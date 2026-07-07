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

interface OwnerInvoice {
  id: string
  owner_name: string
  description: string | null
  client: string | null
  amount: number
  month: string
  created_at: string
}

const DEFAULT_OWNERS = ['Jan Kolář', 'Martin Remeš']

export default function SalariesPage() {
  const [salaries, setSalaries] = useState<OwnerSalary[]>([])
  const [invoices, setInvoices] = useState<OwnerInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [newOwnerName, setNewOwnerName] = useState('')
  const [showAddOwner, setShowAddOwner] = useState(false)

  async function fetchSalaries() {
    setLoading(true)
    const [salRes, invRes] = await Promise.all([
      fetch(`/api/costs/salaries?year=${year}`),
      fetch(`/api/costs/owner-invoices?year=${year}`),
    ])
    if (salRes.ok) setSalaries(await salRes.json())
    if (invRes.ok) setInvoices(await invRes.json())
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

  const gridTotal = Object.values(totalsByOwner).reduce((s, o) => s + o.total, 0)
  const paidTotal = Object.values(totalsByOwner).reduce((s, o) => s + o.paid, 0)
  const invoicesTotal = invoices.reduce((s, i) => s + (i.amount ?? 0), 0)
  const grandTotal = gridTotal + invoicesTotal

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

  // ── Faktury majitelů (ruční tabulka) ──────────────────────────────────
  const [invForm, setInvForm] = useState({ owner_name: '', description: '', client: '', amount: '', month: getCurrentMonth() })
  const [addingInvoice, setAddingInvoice] = useState(false)

  async function addInvoice() {
    const amount = parseFloat(invForm.amount.replace(/\s/g, '').replace(',', '.')) || 0
    if (!invForm.owner_name || amount <= 0) return
    setAddingInvoice(true)
    const res = await fetch('/api/costs/owner-invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...invForm, amount }),
    })
    if (res.ok) {
      const created: OwnerInvoice = await res.json()
      setInvoices(prev => [created, ...prev])
      setInvForm(f => ({ ...f, description: '', client: '', amount: '' }))
    }
    setAddingInvoice(false)
  }

  async function deleteInvoice(id: string) {
    await fetch(`/api/costs/owner-invoices?id=${id}`, { method: 'DELETE' })
    setInvoices(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platy majitelů</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rok {year}: <span className="font-semibold text-red-600">{formatCZK(grandTotal)}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              · platy {formatCZK(gridTotal)}{invoicesTotal > 0 && <> + faktury {formatCZK(invoicesTotal)}</>}
              {' · '}vyplaceno {formatCZK(paidTotal)} ({gridTotal > 0 ? Math.round((paidTotal / gridTotal) * 100) : 0} %)
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
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="numeric"
                                defaultValue={cell?.amount ? cell.amount.toLocaleString('cs-CZ') : ''}
                                placeholder="0"
                                disabled={saving}
                                className="w-28 text-right rounded border border-gray-200 pl-2 pr-8 py-1 text-sm tabular-nums focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none disabled:opacity-50"
                                onFocus={e => { e.target.value = e.target.value.replace(/\s/g, '') }}
                                onBlur={e => {
                                  // Povol mezery i tečky jako oddělovače tisíců, čárku jako desetinnou
                                  const raw = e.target.value.replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
                                  const v = parseFloat(raw || '0') || 0
                                  const prev = cell?.amount ?? 0
                                  e.target.value = v ? v.toLocaleString('cs-CZ') : ''
                                  if (v !== prev) upsertCell(owner, month, { amount: v })
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                }}
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Kč</span>
                            </div>
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

      {/* ── Faktury majitelů (ruční) ────────────────────────────────────── */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-sm">Faktury majitelů {year}</h2>
          <span className="text-xs text-muted-foreground">
            {invoices.length} položek · <span className="font-semibold text-red-600">{formatCZK(invoicesTotal)}</span>
          </span>
        </div>

        {/* Přidání řádku */}
        <div className="grid grid-cols-[1.2fr_1.6fr_1.4fr_0.8fr_1fr_auto] gap-2 px-4 py-3 border-b bg-white items-center">
          <select
            value={invForm.owner_name}
            onChange={e => setInvForm(f => ({ ...f, owner_name: e.target.value }))}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-sm bg-white"
          >
            <option value="">Kdo…</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            value={invForm.description}
            onChange={e => setInvForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Za co (popis)"
            className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          />
          <input
            value={invForm.client}
            onChange={e => setInvForm(f => ({ ...f, client: e.target.value }))}
            placeholder="Klient"
            className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          />
          <select
            value={invForm.month}
            onChange={e => setInvForm(f => ({ ...f, month: e.target.value }))}
            className="rounded-md border border-gray-200 px-2 py-1.5 text-sm bg-white capitalize"
          >
            {months.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
          <div className="relative">
            <input
              value={invForm.amount}
              onChange={e => setInvForm(f => ({ ...f, amount: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addInvoice()}
              placeholder="0"
              inputMode="numeric"
              className="w-full text-right rounded-md border border-gray-200 pl-2 pr-7 py-1.5 text-sm tabular-nums"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">Kč</span>
          </div>
          <Button size="sm" onClick={addInvoice} disabled={addingInvoice || !invForm.owner_name}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50/60 border-b">
            <tr className="text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2 text-left font-medium">Kdo vystavuje</th>
              <th className="px-4 py-2 text-left font-medium">Za co</th>
              <th className="px-4 py-2 text-left font-medium">Klient</th>
              <th className="px-4 py-2 text-left font-medium">Měsíc</th>
              <th className="px-4 py-2 text-right font-medium">Kolik</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoices.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Zatím žádné faktury — přidej nahoře</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="group hover:bg-gray-50/70">
                <td className="px-4 py-2.5 font-medium text-gray-900">{inv.owner_name}</td>
                <td className="px-4 py-2.5 text-gray-600">{inv.description ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{inv.client ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 capitalize whitespace-nowrap">{formatMonth(inv.month)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-red-600 tabular-nums whitespace-nowrap">{formatCZK(inv.amount)}</td>
                <td className="px-2 py-2.5">
                  <button
                    onClick={() => deleteInvoice(inv.id)}
                    title="Smazat"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {invoices.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Celkem faktury</td>
                <td className="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums">{formatCZK(invoicesTotal)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
