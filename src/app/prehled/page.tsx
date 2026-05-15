'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'

function fmtH(h: number) { return h > 0 ? Math.round(h * 10) / 10 : '—' }

// ── Types ──────────────────────────────────────────────────────────────────
interface IncomeRow  { id: string; client: string; project_name: string; amount: number | null; status: string }
interface VarClient  { client: string; count: number; hours: number; price: number }
interface VarMember  { member: string; count: number; hours: number; price: number }
interface ExtraCost  { id: string; name: string; amount: number }
interface Totals     { totalIncome: number; totalVar: number; totalFixed: number; totalExtra: number; totalCosts: number; profit: number; margin: number }

interface PrehledData {
  income:      IncomeRow[]
  varByClient: VarClient[]
  varByMember: VarMember[]
  totals:      Totals
}

// ── Extra costs inline table ───────────────────────────────────────────────
function ExtraTable({ month, onTotalsChange }: { month: string; onTotalsChange: (total: number) => void }) {
  const [rows, setRows]       = useState<ExtraCost[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newAmt, setNewAmt]   = useState('')
  const [saving, setSaving]   = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/costs/extra?month=${month}`)
    const data: ExtraCost[] = await res.json()
    setRows(data)
    onTotalsChange(data.reduce((s, r) => s + r.amount, 0))
    setLoading(false)
  }, [month, onTotalsChange])

  useEffect(() => { fetch_() }, [fetch_])

  const addRow = async () => {
    const name = newName.trim()
    const amount = parseFloat(newAmt.replace(',', '.'))
    if (!name || isNaN(amount) || amount <= 0 || saving) return
    setSaving(true)
    const res = await fetch('/api/costs/extra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, amount, month }),
    })
    if (res.ok) {
      const created: ExtraCost = await res.json()
      const next = [...rows, created]
      setRows(next)
      onTotalsChange(next.reduce((s, r) => s + r.amount, 0))
      setNewName('')
      setNewAmt('')
      nameRef.current?.focus()
    }
    setSaving(false)
  }

  const deleteRow = async (id: string) => {
    const res = await fetch(`/api/costs/extra?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      const next = rows.filter(r => r.id !== id)
      setRows(next)
      onTotalsChange(next.reduce((s, r) => s + r.amount, 0))
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addRow()
  }

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-900 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Extra náklady</h2>
        {!loading && rows.length > 0 && (
          <span className="text-sm font-semibold text-gray-300">{formatCZK(total)}</span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-5 py-2.5 font-medium text-gray-500">Název</th>
            <th className="text-right px-5 py-2.5 font-medium text-gray-500 w-40">Částka</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading && (
            <tr><td colSpan={3} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-48" /></td></tr>
          )}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={3} className="px-5 py-6 text-center text-gray-400 text-xs">Žádné extra náklady — přidej první položku níže</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={row.id} className={cn('group hover:bg-red-50/30', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
              <td className="px-5 py-2.5 text-gray-800">{row.name}</td>
              <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCZK(row.amount)}</td>
              <td className="px-3 py-2.5 text-right">
                <button
                  onClick={() => deleteRow(row.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}

          {/* Add row */}
          <tr className="bg-gray-50/60 border-t border-dashed border-gray-200">
            <td className="px-3 py-2">
              <input
                ref={nameRef}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Název nákladu…"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white"
              />
            </td>
            <td className="px-3 py-2">
              <input
                value={newAmt}
                onChange={e => setNewAmt(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Kč"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white text-right"
              />
            </td>
            <td className="px-3 py-2">
              <button
                onClick={addRow}
                disabled={!newName.trim() || !newAmt || saving}
                className="p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Přidat (nebo Enter)"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </td>
          </tr>
        </tbody>
        {rows.length > 0 && (
          <tfoot className="border-t-2 border-gray-300 bg-gray-100">
            <tr>
              <td className="px-5 py-3 font-bold text-gray-900 text-xs uppercase tracking-wide">Celkem</td>
              <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCZK(total)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function PrehledPage() {
  const [month, setMonth]     = useState(getCurrentMonth())
  const [data, setData]       = useState<PrehledData | null>(null)
  const [loading, setLoading] = useState(true)
  const [extraTotal, setExtraTotal] = useState(0)
  const months = getLastNMonths(18)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prehled?month=${month}`)
      setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])

  const t = data?.totals
  // Use live extraTotal from the inline table instead of stale prehled totals
  const totalCosts = (t?.totalVar ?? 0) + extraTotal + (t?.totalFixed ?? 0)
  const profit     = (t?.totalIncome ?? 0) - totalCosts
  const margin     = (t?.totalIncome ?? 0) > 0 ? Math.round((profit / t!.totalIncome) * 100) : 0
  const isProfit   = profit >= 0

  const clientRows = data?.varByClient ?? []
  const memberRows = data?.varByMember ?? []
  const maxRows    = Math.max(clientRows.length, memberRows.length)

  return (
    <div className="p-6 space-y-6 w-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Měsíční přehled</h1>
          <p className="text-sm text-gray-500 mt-0.5">Příjmy, náklady, výsledek</p>
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : data && t ? (
        <>
          {/* ── Kombinovaná tabulka variabilních nákladů ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-900">
              <h2 className="text-sm font-semibold text-white">Variabilní náklady</h2>
            </div>
            <div className="flex divide-x divide-gray-200">

              {/* Dle klienta */}
              <div className="flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">Klient</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-20">Záznamy</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-20">Hodiny</th>
                      <th className="text-right px-5 py-2.5 font-medium text-gray-500 w-32">Cena</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientRows.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">Žádná data</td></tr>
                    )}
                    {Array.from({ length: maxRows }).map((_, i) => {
                      const row = clientRows[i]
                      return row ? (
                        <tr key={i} className={cn('hover:bg-blue-50/30', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
                          <td className="px-5 py-2.5 font-medium text-gray-800">{row.client}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{row.count}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{fmtH(row.hours)}</td>
                          <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCZK(row.price)}</td>
                        </tr>
                      ) : (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                          <td colSpan={4} className="py-2.5">&nbsp;</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {clientRows.length > 0 && (
                    <tfoot className="border-t-2 border-gray-300 bg-gray-100">
                      <tr>
                        <td className="px-5 py-3 font-bold text-gray-900 text-xs uppercase tracking-wide">Celkový součet</td>
                        <td className="px-3 py-3 text-center font-bold text-gray-900">{clientRows.reduce((s, r) => s + r.count, 0)}</td>
                        <td className="px-3 py-3 text-center font-bold text-gray-900">{fmtH(clientRows.reduce((s, r) => s + r.hours, 0))}</td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCZK(t.totalVar)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Dle zaměstnance */}
              <div className="flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">Zaměstnanec</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-20">Záznamy</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-20">Hodiny</th>
                      <th className="text-right px-5 py-2.5 font-medium text-gray-500 w-32">Cena</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {memberRows.length === 0 && (
                      <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">Žádná data</td></tr>
                    )}
                    {Array.from({ length: maxRows }).map((_, i) => {
                      const row = memberRows[i]
                      return row ? (
                        <tr key={i} className={cn('hover:bg-blue-50/30', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
                          <td className="px-5 py-2.5 font-medium text-gray-800">{row.member}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{row.count}</td>
                          <td className="px-3 py-2.5 text-center text-gray-500">{fmtH(row.hours)}</td>
                          <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCZK(row.price)}</td>
                        </tr>
                      ) : (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                          <td colSpan={4} className="py-2.5">&nbsp;</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {memberRows.length > 0 && (
                    <tfoot className="border-t-2 border-gray-300 bg-gray-100">
                      <tr>
                        <td className="px-5 py-3 font-bold text-gray-900 text-xs uppercase tracking-wide">Celkový součet</td>
                        <td className="px-3 py-3 text-center font-bold text-gray-900">{memberRows.reduce((s, r) => s + r.count, 0)}</td>
                        <td className="px-3 py-3 text-center font-bold text-gray-900">{fmtH(memberRows.reduce((s, r) => s + r.hours, 0))}</td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCZK(t.totalVar)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>

          {/* ── Extra náklady tabulka ── */}
          <ExtraTable month={month} onTotalsChange={setExtraTotal} />

          {/* ── Souhrn nákladů ── */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Variabilní náklady</div>
              <div className="text-xl font-bold text-gray-900">{formatCZK(t.totalVar)}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Extra náklady</div>
              <div className="text-xl font-bold text-gray-900">{formatCZK(extraTotal)}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Fixní náklady</div>
              <div className="text-xl font-bold text-gray-900">{formatCZK(t.totalFixed)}</div>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 px-5 py-4">
              <div className="text-xs font-medium text-red-600 mb-1">Náklady celkem</div>
              <div className="text-xl font-bold text-red-700">{formatCZK(totalCosts)}</div>
            </div>
          </div>

          {/* ── Výsledek měsíce ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-900">
              <h2 className="text-sm font-semibold text-white">Výsledek měsíce</h2>
            </div>
            <div className="grid grid-cols-4 divide-x divide-gray-200">
              <div className="px-6 py-5">
                <div className="text-xs font-medium text-gray-500 mb-1">Příjmy</div>
                <div className="text-2xl font-bold text-green-700">{formatCZK(t.totalIncome)}</div>
                <div className="text-xs text-gray-400 mt-1">{data.income.length} {data.income.length === 1 ? 'položka' : 'položek'}</div>
              </div>
              <div className="px-6 py-5">
                <div className="text-xs font-medium text-gray-500 mb-1">Náklady celkem</div>
                <div className="text-2xl font-bold text-red-600">{formatCZK(totalCosts)}</div>
                <div className="text-xs text-gray-400 mt-1">var + extra + fixní</div>
              </div>
              <div className="px-6 py-5">
                <div className="text-xs font-medium text-gray-500 mb-1">Marže</div>
                <div className={cn('text-2xl font-bold', isProfit ? 'text-green-700' : 'text-red-600')}>
                  {margin} %
                </div>
                <div className="text-xs text-gray-400 mt-1">{isProfit ? 'v zisku' : 've ztrátě'}</div>
              </div>
              <div className={cn('px-6 py-5', isProfit ? 'bg-green-50' : 'bg-red-50')}>
                <div className={cn('text-xs font-medium mb-1', isProfit ? 'text-green-600' : 'text-red-600')}>
                  {isProfit ? 'Zisk' : 'Ztráta'}
                </div>
                <div className={cn('text-2xl font-bold', isProfit ? 'text-green-700' : 'text-red-700')}>
                  {formatCZK(Math.abs(profit))}
                </div>
                <div className={cn('text-xs mt-1', isProfit ? 'text-green-500' : 'text-red-400')}>příjmy − náklady</div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
