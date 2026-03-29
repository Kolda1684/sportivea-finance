'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Upload, Link2, Link2Off, CheckCircle, AlertCircle, X, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Transaction {
  id: string
  date: string
  amount: number
  amount_czk: number
  currency: string
  exchange_rate: number
  counterparty_name: string | null
  variable_symbol: string | null
  message: string | null
  type: 'income' | 'expense'
  status: 'unmatched' | 'matched' | 'ignored'
  invoices?: { number: string; subject_name: string } | null
  expense_invoices?: { supplier_name: string; variable_symbol: string } | null
}

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

const STATUS_BADGE = {
  matched:   'bg-green-100 text-green-800',
  unmatched: 'bg-yellow-100 text-yellow-800',
  ignored:   'bg-gray-100 text-gray-500',
}

interface BankAccount { id: string; name: string; account_number: string | null; starting_balance: number }

// ─── CSV Import Banner ───────────────────────────────────────────────────────
function CsvImportBanner({ accounts, onImported }: { accounts: BankAccount[]; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [accountId, setAccountId] = useState<string>('')

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) { setStatus('error'); setMessage('Soubor musí být CSV'); return }
    setStatus('uploading')
    const form = new FormData()
    form.append('file', file)
    if (accountId) form.append('account_id', accountId)
    try {
      const res = await fetch('/api/banking/import', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Chyba importu')
      setStatus('ok')
      setMessage(`Importováno ${json.imported} transakcí`)
      onImported()
    } catch (e: unknown) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Chyba importu')
    }
  }

  if (status === 'ok') return (
    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
      <p className="text-sm text-green-800 flex-1">{message}</p>
      <button onClick={() => setStatus('idle')}><X className="h-4 w-4 text-green-600" /></button>
    </div>
  )

  if (status === 'error') return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
      <p className="text-sm text-red-700 flex-1">{message}</p>
      <button onClick={() => setStatus('idle')}><X className="h-4 w-4 text-red-500" /></button>
    </div>
  )

  return (
    <div className="space-y-3">
      {accounts.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Účet:</span>
          <select
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
          >
            <option value="">— nevybráno —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}{a.account_number ? ` (${a.account_number})` : ''}</option>
            ))}
          </select>
        </div>
      )}
      <div
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onDragOver={e => e.preventDefault()}
        className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center hover:border-primary-900 hover:bg-primary-50 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
        {status === 'uploading' ? (
          <p className="text-sm text-gray-600 font-medium">Importuji…</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">Přetáhni CSV z Fio banky nebo klikni pro výběr</p>
            <p className="text-xs text-gray-500 mt-1">Fio: Internetové bankovnictví → Pohyby → Exportovat → CSV</p>
            <p className="text-xs text-gray-400 mt-0.5">Podporuje CZK, EUR, USD — kurzy se načítají automaticky</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Add Expense Invoice Modal ───────────────────────────────────────────────
function AddExpenseInvoiceModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (inv: ExpenseInvoice) => void }) {
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
        <DialogHeader><DialogTitle>Přidat nákladovou fakturu</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Dodavatel</Label>
            <Input value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} placeholder="Název firmy" />
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Zrušit</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Ukládám…' : 'Uložit'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Hlavní stránka ──────────────────────────────────────────────────────────
export default function BankingPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [expenseInvoices, setExpenseInvoices] = useState<ExpenseInvoice[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [matching, setMatching] = useState(false)
  const [matchMsg, setMatchMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [syncingExpenses, setSyncingExpenses] = useState(false)

  useEffect(() => {
    fetch('/api/banking/accounts').then(r => r.json()).then(d => setAccounts(Array.isArray(d) ? d : []))
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    const [txRes, expRes] = await Promise.all([
      fetch(`/api/banking/transactions?${params}`),
      fetch('/api/expense-invoices'),
    ])
    const txData = await txRes.json()
    const expData = await expRes.json()
    setTransactions(Array.isArray(txData) ? txData : [])
    setExpenseInvoices(Array.isArray(expData) ? expData : [])
    setLoading(false)
  }, [statusFilter, typeFilter])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  async function handleSyncExpenses() {
    setSyncingExpenses(true)
    setMatchMsg(null)
    try {
      const res = await fetch('/api/expense-invoices/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMatchMsg({ ok: true, text: `Staženo ${data.imported} přijatých faktur z Fakturoid` })
      fetchTransactions()
    } catch (e: unknown) {
      setMatchMsg({ ok: false, text: e instanceof Error ? e.message : 'Chyba synchronizace' })
    } finally {
      setSyncingExpenses(false)
    }
  }

  async function handleMatch() {
    setMatching(true)
    setMatchMsg(null)
    try {
      const res = await fetch('/api/banking/match', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMatchMsg({ ok: true, text: `Spárováno ${data.matched} z ${data.total} transakcí` })
      fetchTransactions()
    } catch (e: unknown) {
      setMatchMsg({ ok: false, text: e instanceof Error ? e.message : 'Chyba párování' })
    } finally {
      setMatching(false)
    }
  }

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount_czk ?? t.amount), 0)
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount_czk ?? t.amount), 0)
  const unmatched = transactions.filter(t => t.status === 'unmatched' && t.type === 'income').length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bankovní centrum</h1>
          <p className="text-sm text-gray-500 mt-1">Fio banka · Import CSV · Párování faktur</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncExpenses} disabled={syncingExpenses}>
            <RefreshCw className={cn('h-4 w-4 mr-2', syncingExpenses && 'animate-spin')} />
            {syncingExpenses ? 'Stahuji…' : 'Sync přijaté faktury'}
          </Button>
          <Button variant="outline" onClick={handleMatch} disabled={matching}>
            <RefreshCw className={cn('h-4 w-4 mr-2', matching && 'animate-spin')} />
            {matching ? 'Páruji…' : 'Auto-párování'}
          </Button>
          <Button onClick={() => setAddExpenseOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Přidat ručně
          </Button>
        </div>
      </div>

      {/* CSV Import */}
      <CsvImportBanner accounts={accounts} onImported={fetchTransactions} />

      {/* Match zpráva */}
      {matchMsg && (
        <div className={cn('flex items-center gap-3 rounded-xl border p-4 text-sm',
          matchMsg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        )}>
          {matchMsg.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {matchMsg.text}
        </div>
      )}

      {/* Statistiky */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground font-medium">Příchozí platby</p>
          <p className="text-xl font-bold text-green-700 mt-1">{formatCZK(totalIncome)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground font-medium">Odchozí platby</p>
          <p className="text-xl font-bold text-red-600 mt-1">{formatCZK(totalExpense)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground font-medium">Nespárované příjmy</p>
          <p className={cn('text-xl font-bold mt-1', unmatched > 0 ? 'text-yellow-600' : 'text-gray-400')}>{unmatched}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground font-medium">Transakce celkem</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{transactions.length}</p>
        </div>
      </div>

      {/* Filtry */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny statusy</SelectItem>
            <SelectItem value="unmatched">Nespárované</SelectItem>
            <SelectItem value="matched">Spárované</SelectItem>
            <SelectItem value="ignored">Ignorované</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Typ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Příjem i výdaj</SelectItem>
            <SelectItem value="income">Pouze příjmy</SelectItem>
            <SelectItem value="expense">Pouze výdaje</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabulka transakcí */}
      {loading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Datum', 'Protistrana', 'VS', 'Zpráva', 'Původní částka', 'CZK', 'Spárováno s', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>Žádné transakce — importuj CSV z Fio banky</p>
                  </td>
                </tr>
              ) : transactions.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(tx.date)}</td>
                  <td className="px-4 py-2.5 max-w-[180px] truncate" title={tx.counterparty_name ?? ''}>
                    {tx.counterparty_name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{tx.variable_symbol ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate" title={tx.message ?? ''}>
                    {tx.message ?? '—'}
                  </td>
                  <td className={cn('px-4 py-2.5 font-medium', tx.amount > 0 ? 'text-green-700' : 'text-red-600')}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('cs-CZ')} {tx.currency}
                    {tx.currency !== 'CZK' && (
                      <span className="text-xs text-muted-foreground ml-1">({tx.exchange_rate?.toFixed(2)})</span>
                    )}
                  </td>
                  <td className={cn('px-4 py-2.5 font-bold', tx.amount_czk > 0 ? 'text-green-700' : 'text-red-600')}>
                    {formatCZK(Math.abs(tx.amount_czk ?? tx.amount))}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {tx.invoices ? (
                      <span className="flex items-center gap-1 text-green-700">
                        <Link2 className="h-3 w-3" />
                        {tx.invoices.number} · {tx.invoices.subject_name}
                      </span>
                    ) : tx.expense_invoices ? (
                      <span className="flex items-center gap-1 text-orange-700">
                        <Link2 className="h-3 w-3" />
                        {tx.expense_invoices.supplier_name ?? tx.expense_invoices.variable_symbol ?? 'Náklad'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Link2Off className="h-3 w-3" />—
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[tx.status])}>
                      {tx.status === 'matched' ? 'Spárováno' : tx.status === 'ignored' ? 'Ignorováno' : 'Nespárováno'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nákladové faktury */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4">Nákladové faktury</h2>
        {expenseInvoices.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-gray-50 p-8 text-center text-muted-foreground text-sm">
            Žádné nákladové faktury — přidej pomocí tlačítka výše
          </div>
        ) : (
          <div className="rounded-xl border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Dodavatel', 'Datum', 'Splatnost', 'Částka', 'VS', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {expenseInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium">{inv.supplier_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(inv.date)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(inv.due_date)}</td>
                    <td className="px-4 py-2.5 font-bold text-red-600">
                      {inv.amount != null ? `${inv.amount.toLocaleString('cs-CZ')} ${inv.currency}` : '—'}
                      {inv.currency !== 'CZK' && inv.amount_czk && (
                        <span className="text-xs text-muted-foreground ml-1">({formatCZK(inv.amount_czk)})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{inv.variable_symbol ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        inv.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      )}>
                        {inv.status === 'paid' ? 'Zaplacena' : 'Nezaplacena'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddExpenseInvoiceModal
        open={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        onSaved={inv => setExpenseInvoices(prev => [inv, ...prev])}
      />
    </div>
  )
}
