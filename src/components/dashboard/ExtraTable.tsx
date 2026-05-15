'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { formatCZK } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ExtraCost { id: string; name: string; amount: number }

export function ExtraTable({ month, onTotalsChange }: { month: string; onTotalsChange: (total: number) => void }) {
  const [rows, setRows]       = useState<ExtraCost[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newAmt, setNewAmt]   = useState('')
  const [saving, setSaving]   = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/costs/extra?month=${month}`)
    const data: ExtraCost[] = await res.json()
    setRows(data)
    onTotalsChange(data.reduce((s, r) => s + r.amount, 0))
    setLoading(false)
  }, [month, onTotalsChange])

  useEffect(() => { load() }, [load])

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

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-900 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Extra náklady</h2>
        {!loading && rows.length > 0 && <span className="text-sm font-semibold text-gray-300">{formatCZK(total)}</span>}
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
          {loading && <tr><td colSpan={3} className="px-5 py-4"><div className="h-4 bg-gray-100 rounded animate-pulse w-48" /></td></tr>}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={3} className="px-5 py-6 text-center text-gray-400 text-xs">Žádné extra náklady — přidej první položku níže</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={row.id} className={cn('group hover:bg-red-50/30', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
              <td className="px-5 py-2.5 text-gray-800">{row.name}</td>
              <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCZK(row.amount)}</td>
              <td className="px-3 py-2.5 text-right">
                <button onClick={() => deleteRow(row.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50/60 border-t border-dashed border-gray-200">
            <td className="px-3 py-2">
              <input ref={nameRef} value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRow()}
                placeholder="Název nákladu…"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white" />
            </td>
            <td className="px-3 py-2">
              <input value={newAmt} onChange={e => setNewAmt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRow()}
                placeholder="Kč"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white text-right" />
            </td>
            <td className="px-3 py-2">
              <button onClick={addRow} disabled={!newName.trim() || !newAmt || saving}
                className="p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
