'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCZK, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface ExpenseInvoice {
  id: string
  supplier_name: string | null
  amount: number | null
  amount_czk: number | null
  currency: string
  date: string | null
  due_date: string | null
  variable_symbol: string | null
  status: string
  note: string | null
}

function AddModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (inv: ExpenseInvoice) => void }) {
  const [form, setForm] = useState({ supplier_name: '', amount: '', currency: 'CZK', date: '', due_date: '', variable_symbol: '', note: '' })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/expense-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Chyba uložení')
      const saved = await res.json()
      onSaved(saved)
      onClose()
      setForm({ supplier_name: '', amount: '', currency: 'CZK', date: '', due_date: '', variable_symbol: '', note: '' })
    } catch { alert('Nepodařilo se uložit.') }
    finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Přidat přijatou fakturu</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Dodavatel *</Label>
            <Input required value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} placeholder="Název firmy" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Částka</Label>
              <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Měna</Label>
              <Select value={form.currency} onValueChange={v => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CZK">CZK</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Splatnost</Label>
              <Input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Variabilní symbol</Label>
            <Input value={form.variable_symbol} onChange={e => set('variable_symbol', e.target.value)} placeholder="Číslo faktury" />
          </div>
          <div className="space-y-1">
            <Label>Poznámka</Label>
            <Input value={form.note} onChange={e => set('note', e.target.value)} placeholder="Volitelná poznámka" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Zrušit</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Ukládám…' : 'Uložit'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ExpenseInvoicesPage() {
  const [invoices, setInvoices] = useState<ExpenseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [addOpen, setAddOpen] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/expense-invoices')
    const data = await res.json()
    const all: ExpenseInvoice[] = Array.isArray(data) ? data : []
    setInvoices(statusFilter === 'all' ? all : all.filter(i => i.status === statusFilter))
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  async function handleSync() {
    setSyncing(true)
    setMsg(null)
    try {
      const res = await fetch('/api/expense-invoices/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ ok: true, text: `Staženo ${data.imported} přijatých faktur z Fakturoid` })
      fetchInvoices()
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Chyba synchronizace' })
    } finally { setSyncing(false) }
  }

  const totalUnpaid = invoices.filter(i => i.status === 'unpaid').reduce((s, i) => s + (i.amount_czk ?? i.amount ?? 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount_czk ?? i.amount ?? 0), 0)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Přijaté faktury</h1>
          <p className="text-sm text-gray-500 mt-1">{invoices.length} faktur · náklady od dodavatelů</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', syncing && 'animate-spin')} />
            {syncing ? 'Stahuji…' : 'Sync z Fakturoid'}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Přidat ručně
          </Button>
        </div>
      </div>

      {msg && (
        <div className={cn('flex items-center gap-3 rounded-xl border p-4 text-sm',
          msg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        )}>
          {msg.ok ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Statistiky */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground font-medium">Celkem faktur</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{invoices.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground font-medium">Nezaplaceno</p>
          <p className="text-xl font-bold text-red-600 mt-1">{formatCZK(totalUnpaid)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground font-medium">Zaplaceno</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatCZK(totalPaid)}</p>
        </div>
      </div>

      {/* Filtr */}
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Všechny</SelectItem>
          <SelectItem value="unpaid">Nezaplacené</SelectItem>
          <SelectItem value="paid">Zaplacené</SelectItem>
        </SelectContent>
      </Select>

      {/* Tabulka */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Dodavatel', 'Datum', 'Splatnost', 'Částka', 'VS', 'Poznámka', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Žádné přijaté faktury — sync z Fakturoid nebo přidej ručně
                  </td>
                </tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{inv.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.due_date)}</td>
                  <td className="px-4 py-3 font-bold text-red-600">
                    {inv.amount != null ? `${inv.amount.toLocaleString('cs-CZ')} ${inv.currency}` : '—'}
                    {inv.currency !== 'CZK' && inv.amount_czk && (
                      <span className="text-xs text-muted-foreground ml-1">({formatCZK(inv.amount_czk)})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.variable_symbol ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{inv.note ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      inv.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    )}>
                      {inv.status === 'paid' ? 'Zaplacena' : 'Nezaplacena'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {invoices.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">CELKEM</td>
                  <td className="px-4 py-2.5 font-bold text-red-600 text-sm">
                    {formatCZK(invoices.reduce((s, i) => s + (i.amount_czk ?? i.amount ?? 0), 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={inv => setInvoices(prev => [inv, ...prev])} />
    </div>
  )
}
