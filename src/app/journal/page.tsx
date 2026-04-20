'use client'

import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Settings2, Download, RefreshCw, GitMerge, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BankAccount {
  id: string
  name: string
  account_number: string | null
  starting_balance: number
}

interface JournalEntry {
  id: string
  date: string
  amount: number
  amount_czk: number
  currency: string
  counterparty_name: string | null
  counterparty_account: string | null
  variable_symbol: string | null
  message: string | null
  type: 'income' | 'expense'
  status: string
  match_zone: string | null
  match_confidence: number | null
  match_method: string | null
  account_id: string | null
  invoices?: { number: string; subject_name: string } | null
  expense_invoices?: { supplier_name: string } | null
}

function fmtCZK(n: number) {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MatchBadge({ entry }: { entry: JournalEntry }) {
  const { status, match_zone, match_confidence, match_method } = entry
  if (status === 'matched' || match_zone === 'auto') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium" title={match_method ?? ''}>✓ Jistá</span>
  }
  if (match_zone === 'suggest') {
    const conf = match_confidence ?? 0
    const label = conf >= 60 ? 'Pravděpodobná' : 'Ke kontrole'
    return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs font-medium" title={match_method ?? ''}>{conf}% {label}</span>
  }
  if (match_zone === 'manual') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium" title={match_method ?? ''}>? Nezjistit</span>
  }
  return null
}

function entryDescription(e: JournalEntry): string {
  if (e.invoices) return `${e.invoices.number} · ${e.invoices.subject_name}`
  if (e.expense_invoices?.supplier_name) return e.expense_invoices.supplier_name
  if (e.counterparty_name) return e.counterparty_name
  if (e.message) return e.message.replace(/^n[aá]kup:\s*/i, '').split(',')[0].trim()
  return e.variable_symbol ?? '—'
}

function entryCounterparty(e: JournalEntry, description: string): string {
  return e.counterparty_name ?? description
}

function entryDocNumber(e: JournalEntry): string {
  return e.invoices?.number ?? ''
}

function EditTransactionModal({ entry, onSaved, onClose }: {
  entry: JournalEntry
  onSaved: () => void
  onClose: () => void
}) {
  const [counterparty, setCounterparty] = useState(entry.counterparty_name ?? '')
  const [message, setMessage] = useState(entry.message ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/banking/transactions/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counterparty_name: counterparty || null, message: message || null }),
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Upravit transakci</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Protiúčet / název</Label>
            <Input value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="Název protistrany" />
          </div>
          <div className="space-y-1">
            <Label>Popis / zpráva</Label>
            <Input value={message} onChange={e => setMessage(e.target.value)} placeholder="Popis transakce" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Zrušit</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Ukládám…' : 'Uložit'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InlineCell({ value, onSave, className, mono }: {
  value: string
  onSave: (v: string) => void
  className?: string
  mono?: boolean
}) {
  const [active, setActive] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    setActive(false)
    if (draft !== value) onSave(draft)
  }

  if (active) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setActive(false) } }}
        onClick={e => e.stopPropagation()}
        className={cn('w-full bg-white border border-primary-900 rounded px-1 py-0 outline-none text-xs', mono && 'font-mono', className)}
      />
    )
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setActive(true); setDraft(value) }}
      className={cn('block w-full cursor-text truncate', mono && 'font-mono', className)}
      title={value}
    >
      {value || <span className="text-gray-300">—</span>}
    </span>
  )
}

function AccountTable({ account, entries, year, month, onRefresh }: {
  account: BankAccount
  entries: JournalEntry[]
  year: number
  month: number | 'all'
  onRefresh: () => void
}) {
  const [localEntries, setLocalEntries] = useState<JournalEntry[]>(entries)
  useEffect(() => { setLocalEntries(entries) }, [entries])

  // Chronologicky pro výpočet zůstatků
  const chronological = localEntries
    .filter(e => {
      const d = new Date(e.date)
      if (e.account_id !== account.id) return false
      if (d.getFullYear() !== year) return false
      if (month !== 'all' && d.getMonth() + 1 !== month) return false
      return true
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let balance = account.starting_balance
  const rows = chronological.map((entry, i) => {
    const czk = Math.abs(entry.amount_czk ?? entry.amount)
    const isIncome = entry.type === 'income'
    const income = isIncome ? czk : 0
    const expense = isIncome ? 0 : czk
    balance += isIncome ? czk : -czk
    const description = entryDescription(entry)
    return { entry, income, expense, balance, description, idx: i + 1 }
  })

  // Zobrazujeme nejnovější nahoře
  const displayRows = [...rows].reverse()

  const totalIncome = rows.reduce((s, r) => s + r.income, 0)
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0)
  const finalBalance = account.starting_balance + totalIncome - totalExpense

  async function saveField(id: string, field: string, value: string) {
    setLocalEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value || null } : e))
    await fetch(`/api/banking/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    })
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-gray-100 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left text-gray-500 w-8 border border-gray-200">#</th>
            <th className="px-3 py-2 text-left text-gray-500 w-24 border border-gray-200">Datum</th>
            <th className="px-3 py-2 text-left text-gray-500 w-24 border border-gray-200">Č.dokl.</th>
            <th className="px-3 py-2 text-left text-gray-500 border border-gray-200">Popis</th>
            <th className="px-3 py-2 text-right text-gray-500 w-28 border border-gray-200">Příjmy</th>
            <th className="px-3 py-2 text-right text-gray-500 w-28 border border-gray-200">Výdaje</th>
            <th className="px-3 py-2 text-right text-gray-500 w-32 border border-gray-200">Zůstatek</th>
            <th className="px-3 py-2 text-left text-gray-500 w-28 border border-gray-200">Shoda</th>
            <th className="px-3 py-2 text-left text-gray-400 w-24 border border-gray-200 bg-gray-50">VS</th>
            <th className="px-3 py-2 text-left text-gray-400 w-36 border border-gray-200 bg-gray-50">Protiúčet</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-12 text-center text-gray-400 border border-gray-200">
                Žádné transakce pro rok {year}.<br />Synchronizuj FIO nebo importuj CSV.
              </td>
            </tr>
          )}


          {displayRows.map(r => {
            const isTransfer = r.description.toLowerCase().includes('převod')
            const docNumber = entryDocNumber(r.entry)
            const counterparty = entryCounterparty(r.entry, r.description)
            return (
              <tr key={r.entry.id} className={cn(
                'hover:bg-blue-50/30 transition-colors',
                isTransfer && 'bg-blue-50/40 text-blue-800'
              )}>
                <td className="px-3 py-1.5 text-gray-400 border border-gray-200">{r.idx}</td>
                <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap border border-gray-200">{formatDate(r.entry.date)}</td>
                <td className="px-2 py-1 border border-gray-200">
                  <InlineCell
                    mono
                    value={docNumber}
                    onSave={v => saveField(r.entry.id, 'invoice_number', v)}
                    className="text-gray-500"
                  />
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <InlineCell
                    value={r.description}
                    onSave={v => saveField(r.entry.id, 'message', v)}
                  />
                </td>
                <td className="px-3 py-1.5 text-right text-green-700 font-medium tabular-nums border border-gray-200">
                  {r.income > 0 ? fmtCZK(r.income) : ''}
                </td>
                <td className="px-3 py-1.5 text-right text-red-600 font-medium tabular-nums border border-gray-200">
                  {r.expense > 0 ? fmtCZK(r.expense) : ''}
                </td>
                <td className={cn(
                  'px-3 py-1.5 text-right font-medium tabular-nums border border-gray-200',
                  r.balance >= 0 ? 'text-gray-900' : 'text-red-600'
                )}>
                  {fmtCZK(r.balance)}
                </td>
                <td className="px-2 py-1 border border-gray-200">
                  <MatchBadge entry={r.entry} />
                </td>
                <td className="px-2 py-1 font-mono text-gray-400 border border-gray-200 bg-gray-50/50" title={r.entry.variable_symbol ?? ''}>
                  {r.entry.variable_symbol ?? ''}
                </td>
                <td className="px-2 py-1 border border-gray-200 bg-gray-50/50">
                  <InlineCell
                    value={counterparty}
                    onSave={v => saveField(r.entry.id, 'counterparty_name', v)}
                    className="text-gray-500"
                  />
                </td>
              </tr>
            )
          })}

          <tr className="bg-blue-50/60">
            <td className="px-3 py-2 text-gray-400 border border-gray-200" />
            <td className="px-3 py-2 text-gray-400 border border-gray-200" />
            <td className="px-3 py-2 font-mono text-gray-400 text-center border border-gray-200">x</td>
            <td className="px-3 py-2 font-semibold text-gray-700 border border-gray-200">Počáteční stav</td>
            <td className="px-3 py-2 border border-gray-200" />
            <td className="px-3 py-2 border border-gray-200" />
            <td className="px-3 py-2 text-right font-bold text-gray-900 border border-gray-200">{fmtCZK(account.starting_balance)}</td>
            <td className="px-3 py-2 border border-gray-200" />
            <td className="px-3 py-2 border border-gray-200 bg-gray-50/50" />
            <td className="px-3 py-2 border border-gray-200 bg-gray-50/50" />
          </tr>
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-gray-700 text-xs border border-gray-300">CELKEM {year}</td>

              <td className="px-3 py-2 text-right text-green-700 tabular-nums border border-gray-300">{fmtCZK(totalIncome)}</td>
              <td className="px-3 py-2 text-right text-red-600 tabular-nums border border-gray-300">{fmtCZK(totalExpense)}</td>
              <td className="px-3 py-2 text-right text-gray-900 tabular-nums border border-gray-300">{fmtCZK(finalBalance)}</td>
              <td className="px-3 py-2 border border-gray-300 bg-gray-100" colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function AccountSettingsModal({ accounts, onSaved, onClose }: {
  accounts: BankAccount[]
  onSaved: () => void
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, { name: string; account_number: string; starting_balance: string }>>(
    Object.fromEntries(accounts.map(a => [a.id, {
      name: a.name,
      account_number: a.account_number ?? '',
      starting_balance: String(a.starting_balance),
    }]))
  )
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Smazat účet "${name}"?`)) return
    setDeletingId(id)
    await fetch('/api/banking/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDeletingId(null)
    onSaved()
    onClose()
  }

  async function handleSave() {
    setSaving(true)
    for (const [id, v] of Object.entries(values)) {
      await fetch('/api/banking/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: v.name,
          account_number: v.account_number || null,
          starting_balance: parseFloat(v.starting_balance) || 0,
        }),
      })
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nastavení bankovních účtů</DialogTitle></DialogHeader>
        <div className="space-y-5">
          {accounts.map(a => (
            <div key={a.id} className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Účet</p>
                <button
                  onClick={() => handleDelete(a.id, values[a.id]?.name ?? a.name)}
                  disabled={deletingId === a.id}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  {deletingId === a.id ? 'Mažu…' : 'Smazat účet'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Název</Label>
                  <Input
                    value={values[a.id]?.name ?? ''}
                    onChange={e => setValues(v => ({ ...v, [a.id]: { ...v[a.id], name: e.target.value } }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Číslo účtu</Label>
                  <Input
                    value={values[a.id]?.account_number ?? ''}
                    onChange={e => setValues(v => ({ ...v, [a.id]: { ...v[a.id], account_number: e.target.value } }))}
                    placeholder="1234567890/0800"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Počáteční zůstatek k 1. 1. {new Date().getFullYear()} (Kč)</Label>
                <Input
                  type="number"
                  value={values[a.id]?.starting_balance ?? '0'}
                  onChange={e => setValues(v => ({ ...v, [a.id]: { ...v[a.id], starting_balance: e.target.value } }))}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Zrušit</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Ukládám…' : 'Uložit'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function JournalPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState<number | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [matching, setMatching] = useState(false)
  const [aiMatching, setAiMatching] = useState(false)

  async function fetchData() {
    setLoading(true)
    const [accRes, txRes] = await Promise.all([
      fetch('/api/banking/accounts'),
      fetch('/api/banking/transactions?limit=2000'),
    ])
    const accData = await accRes.json()
    const txData = await txRes.json()
    const accs: BankAccount[] = Array.isArray(accData) ? accData : []
    setAccounts(accs)
    setEntries(Array.isArray(txData) ? txData : [])
    setActiveAccountId(prev => prev ?? accs[0]?.id ?? null)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const years = Array.from(new Set(entries.map(e => new Date(e.date).getFullYear()))).sort((a, b) => b - a)
  if (years.length === 0) years.push(new Date().getFullYear())

  const activeAccount = accounts.find(a => a.id === activeAccountId) ?? accounts[0]

  const MONTHS = [
    'Leden','Únor','Březen','Duben','Květen','Červen',
    'Červenec','Srpen','Září','Říjen','Listopad','Prosinec',
  ]

  async function handleMatch() {
    setMatching(true)
    try {
      const res = await fetch('/api/banking/match', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba párování')
      alert(`Párování dokončeno:\n✓ Auto: ${data.auto}\n⚠ Ke kontrole: ${data.suggest}\n! Manuální: ${data.manual}`)
      await fetchData()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Chyba párování')
    } finally {
      setMatching(false)
    }
  }

  async function handleAiMatch() {
    setAiMatching(true)
    try {
      const res = await fetch('/api/banking/match-ai', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI chyba')
      const matched = (data.suggestions ?? []).filter((s: { invoice_id: string | null; confidence: number }) => s.invoice_id && s.confidence >= 30).length
      alert(`AI párování dokončeno:\n${matched} návrhů přidáno ke kontrole`)
      await fetchData()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Chyba AI párování')
    } finally {
      setAiMatching(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/banking/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba synchronizace')
      await fetchData()
      const summary = data.results.map((r: { account: string; imported: number; skipped: number; errors: string[] }) =>
        `${r.account}: ${r.imported} nových, ${r.skipped} přeskočeno${r.errors?.length ? '\nChyby: ' + r.errors.join('; ') : ''}`
      ).join('\n\n')
      alert(`Synchronizace dokončena:\n\n${summary}`)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Chyba FIO synchronizace')
    } finally {
      setSyncing(false)
    }
  }

  function handleExport() {
    const params = new URLSearchParams({ year: String(year) })
    if (month !== 'all') params.set('month', String(month))
    if (activeAccountId) params.set('account_id', activeAccountId)
    window.location.href = `/api/journal/export?${params}`
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finanční deník</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pohyby na účtech · průběžný zůstatek</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={month}
            onChange={e => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
          >
            <option value="all">Celý rok</option>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={handleMatch} disabled={matching}>
            <GitMerge className={cn('h-4 w-4 mr-1.5', matching && 'animate-pulse')} />
            {matching ? 'Páruji…' : 'Spárovat faktury'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleAiMatch} disabled={aiMatching} className="border-purple-200 text-purple-700 hover:bg-purple-50">
            <Sparkles className={cn('h-4 w-4 mr-1.5', aiMatching && 'animate-spin')} />
            {aiMatching ? 'AI páruje…' : 'AI párování'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', syncing && 'animate-spin')} />
            {syncing ? 'Synchronizuji…' : 'Synchronizovat FIO'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            Exportovat CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1.5" />
            Nastavení účtů
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Načítám…</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-gray-400">
          <p className="font-medium">Nejsou nastaveny žádné bankovní účty.</p>
          <p className="text-sm mt-1">Nejdřív spusť SQL pro vytvoření tabulky bank_accounts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tab přepínač účtů */}
          <div className="flex gap-2">
            {accounts.map(account => (
              <button
                key={account.id}
                onClick={() => setActiveAccountId(account.id)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  activeAccountId === account.id
                    ? 'bg-primary-900 text-white border-primary-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary-900 hover:text-primary-900'
                )}
              >
                {account.name}
                {account.account_number && (
                  <span className="ml-1.5 opacity-60 font-normal">· {account.account_number}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tabulka aktivního účtu */}
          {activeAccount && (
            <AccountTable account={activeAccount} entries={entries} year={year} month={month} onRefresh={fetchData} />
          )}
        </div>
      )}

      {settingsOpen && (
        <AccountSettingsModal
          accounts={accounts}
          onSaved={fetchData}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
