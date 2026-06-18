'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Loader2, X, Search, Pencil, Settings2, Plus, Trash2, Zap, Sparkles, Check, ArrowLeftRight, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BankAccount {
  id: string
  name: string
  account_number: string | null
  starting_balance: number | null
  currency: string
  sort_order: number | null
}

interface BankTx {
  id: string
  date: string
  amount: number
  amount_czk: number | null
  currency: string
  type: string
  status: string
  message: string | null
  note: string | null
  counterparty_name: string | null
  variable_symbol: string | null
  account_id: string | null
  matched_invoice_id: string | null
  matched_expense_invoice_id: string | null
  match_confidence: number | null
  match_method: string | null
  is_internal_transfer: boolean | null
  invoices?: { number: string; subject_name: string | null } | null
  expense_invoices?: { supplier_name: string | null; variable_symbol: string | null; note: string | null } | null
}

interface BankTxRow extends BankTx { runningBalance: number }

interface Invoice {
  id: string
  number: string
  subject_name: string | null
  total: number
  currency: string
  issued_on: string | null
  status: string | null
}

interface ExpenseInvoice {
  id: string
  supplier_name: string | null
  amount: number | null
  amount_czk: number | null
  currency: string
  date: string | null
  variable_symbol: string | null
  note: string | null
  status: string | null
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return `${dt.getDate()}.${dt.getMonth() + 1}.`
}

function fmtNum(n: number) {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function scoreMatch(
  tx: BankTx,
  invAmount: number,
  invName: string | null,
  invStatus: string | null
): number {
  const txAmt = Math.abs(tx.amount_czk ?? tx.amount)
  let score = 0

  // Amount similarity — 0-60 pts
  if (invAmount > 0 && txAmt > 0) {
    const ratio = Math.min(invAmount, txAmt) / Math.max(invAmount, txAmt)
    score += ratio * 60
  }

  // Name/text similarity — 0-40 pts (word overlap)
  const txText = [tx.counterparty_name, tx.message, tx.note]
    .filter(Boolean).join(' ').toLowerCase()
  const invText = (invName ?? '').toLowerCase()
  if (txText.length > 0 && invText.length > 0) {
    const txWords = txText.split(/\W+/).filter(w => w.length > 2)
    const invWords = invText.split(/\W+/).filter(w => w.length > 2)
    const hits = txWords.filter(w =>
      invWords.some(iw => iw.includes(w) || w.includes(iw))
    ).length
    score += (hits / Math.max(1, Math.min(txWords.length, invWords.length))) * 40
  }

  // Penalize already paid/matched
  if (invStatus === 'paid' || invStatus === 'matched') score -= 25

  return Math.round(score)
}

function accountLabel(acc: BankAccount) {
  return acc.name.replace('FIO_ucet_', 'Účet ').replace(/_/g, ' ')
}

export default function BankingPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [txs, setTxs] = useState<BankTx[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenseInvoices, setExpenseInvoices] = useState<ExpenseInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())

  // Per-account editable starting balances (override DB value locally)
  const [balanceOverrides, setBalanceOverrides] = useState<Record<string, number>>({})
  const [editingBalance, setEditingBalance] = useState(false)

  // Picker
  const [pickerTxId, setPickerTxId] = useState<string | null>(null)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Inline note editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')

  // Modals
  const [showAccountsModal, setShowAccountsModal] = useState(false)
  const [showAddTxModal, setShowAddTxModal] = useState(false)

  // Párování — run state + pending review panel
  const [matchRunning, setMatchRunning] = useState<'auto' | 'ai' | null>(null)
  const [matchResult, setMatchResult] = useState<string | null>(null)
  const [pendingExpanded, setPendingExpanded] = useState(true)
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [txData, invData, expData, accData] = await Promise.all([
      fetch('/api/banking/transactions?limit=2000').then(r => r.json()),
      fetch('/api/invoices').then(r => r.json()),
      fetch('/api/expense-invoices').then(r => r.json()),
      fetch('/api/banking/accounts').then(r => r.json()),
    ])
    const accs: BankAccount[] = Array.isArray(accData) ? accData : []
    setAccounts(accs)
    if (accs.length > 0 && !selectedId) setSelectedId(accs[0].id)
    setTxs(Array.isArray(txData) ? txData : [])
    setInvoices(Array.isArray(invData) ? invData : [])
    setExpenseInvoices(Array.isArray(expData) ? expData : [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (pickerTxId) setTimeout(() => searchRef.current?.focus(), 50)
  }, [pickerTxId])

  // Current account
  const currentAccount = accounts.find(a => a.id === selectedId)
  const startingBal = selectedId && balanceOverrides[selectedId] !== undefined
    ? balanceOverrides[selectedId]
    : Number(currentAccount?.starting_balance ?? 0)

  // Filter by account + year, calculate running balance ascending, then reverse for display
  const accountTxs = txs
    .filter(tx => tx.account_id === selectedId && tx.date.startsWith(String(yearFilter)))
    .sort((a, b) => a.date.localeCompare(b.date))

  let bal = startingBal
  const withBalances: BankTxRow[] = accountTxs.map(tx => {
    const amt = Math.abs(tx.amount_czk ?? tx.amount)
    if (tx.type === 'income') bal += amt
    else bal -= amt
    return { ...tx, runningBalance: bal }
  })
  // Oldest first — od 1. ledna dolů
  const rows = withBalances
  const currentBalance = withBalances.length > 0 ? withBalances[withBalances.length - 1].runningBalance : startingBal
  const unmatched = rows.filter(r => r.status === 'unmatched').length

  function getDocNumber(tx: BankTx): string | null {
    if (tx.invoices?.number) return tx.invoices.number
    if (tx.expense_invoices?.variable_symbol) return tx.expense_invoices.variable_symbol
    if (tx.expense_invoices?.note) return tx.expense_invoices.note.slice(0, 24)
    return null
  }

  function getDescription(tx: BankTx): string {
    if (tx.note) return tx.note
    if (tx.invoices?.subject_name) return tx.invoices.subject_name
    if (tx.expense_invoices?.supplier_name) return tx.expense_invoices.supplier_name
    return tx.counterparty_name || tx.message || '—'
  }

  function openPicker(txId: string, el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    setPickerPos({ top: rect.bottom + 6, left: rect.left })
    setPickerTxId(txId)
    setSearch('')
  }

  function closePicker() {
    setPickerTxId(null)
    setPickerPos(null)
    setSearch('')
  }

  async function handleSetMatch(txId: string, invoiceId: string | null, expenseInvoiceId: string | null) {
    await fetch(`/api/banking/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_match', invoice_id: invoiceId, expense_invoice_id: expenseInvoiceId }),
    })
    const inv = invoices.find(i => i.id === invoiceId)
    const exp = expenseInvoices.find(e => e.id === expenseInvoiceId)
    setTxs(prev => prev.map(tx => tx.id !== txId ? tx : {
      ...tx, status: 'matched',
      matched_invoice_id: invoiceId,
      matched_expense_invoice_id: expenseInvoiceId,
      invoices: inv ? { number: inv.number, subject_name: inv.subject_name } : null,
      expense_invoices: exp ? { supplier_name: exp.supplier_name, variable_symbol: exp.variable_symbol, note: exp.note ?? null } : null,
    }))
    closePicker()
  }

  async function handleRemoveMatch(txId: string) {
    await fetch(`/api/banking/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject_match' }),
    })
    setTxs(prev => prev.map(tx => tx.id !== txId ? tx : {
      ...tx, status: 'unmatched',
      matched_invoice_id: null, matched_expense_invoice_id: null,
      invoices: null, expense_invoices: null,
    }))
  }

  async function handleSync() {
    setSyncing(true)
    await fetch('/api/banking/sync', { method: 'POST' })
    await load()
    setSyncing(false)
  }

  function startEditNote(tx: BankTx) {
    setEditingNoteId(tx.id)
    setNoteValue(tx.note ?? '')
  }

  async function saveNote(txId: string) {
    const val = noteValue.trim() || null
    setTxs(prev => prev.map(tx => tx.id !== txId ? tx : { ...tx, note: val }))
    setEditingNoteId(null)
    await fetch(`/api/banking/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: val }),
    })
  }

  async function reloadAccounts() {
    const r = await fetch('/api/banking/accounts')
    const data = await r.json()
    if (Array.isArray(data)) setAccounts(data)
  }

  async function runMatching(kind: 'auto' | 'ai') {
    setMatchRunning(kind)
    setMatchResult(null)
    try {
      const res = await fetch(kind === 'auto' ? '/api/banking/match' : '/api/banking/match-ai', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMatchResult(`❌ ${data.error ?? 'Selhalo'}`)
      } else {
        const summary = kind === 'auto'
          ? `✓ Příjmy ${data.income?.auto ?? 0} auto / ${data.income?.suggest ?? 0} suggest · Výdaje ${data.expense?.auto ?? 0} / ${data.expense?.suggest ?? 0}`
          : `✓ AI prošla ${data.total ?? 0} transakcí (${data.input_tokens ?? 0} → ${data.output_tokens ?? 0} tokenů)`
        setMatchResult(summary)
        await load()
      }
    } catch (e) {
      setMatchResult(`❌ ${e instanceof Error ? e.message : 'Chyba'}`)
    } finally {
      setMatchRunning(null)
    }
  }

  async function bulkAction(action: 'approve' | 'reject') {
    const ids = Array.from(selectedPending)
    if (ids.length === 0) return
    const res = await fetch('/api/banking/match/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_ids: ids, action }),
    })
    if (res.ok) {
      setSelectedPending(new Set())
      await load()
    }
  }

  async function markInternalTransfer(txId: string) {
    await fetch(`/api/banking/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_internal_transfer' }),
    })
    closePicker()
    await load()
  }

  async function addManualTransaction(form: {
    date: string; type: 'income' | 'expense'; amount: number;
    note: string; counterparty_name: string; variable_symbol: string;
  }) {
    if (!selectedId) return { ok: false, error: 'Vyber účet' }
    const res = await fetch('/api/banking/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: selectedId, ...form }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? 'Selhalo přidání transakce' }
    setTxs(prev => [data, ...prev])
    return { ok: true }
  }

  // Picker items — scored by amount + name similarity, then filtered by search
  const pickerTx = txs.find(t => t.id === pickerTxId) ?? null
  const sl = search.toLowerCase()
  const pickerItems = pickerTx?.type === 'income'
    ? invoices
        .filter(i => !sl || i.number?.toLowerCase().includes(sl) || i.subject_name?.toLowerCase().includes(sl))
        .map(i => ({
          id: i.id, label: i.number, sub: i.subject_name,
          amount: i.total, currency: i.currency, isExpense: false,
          score: pickerTx ? scoreMatch(pickerTx, i.total, i.subject_name, i.status) : 0,
        }))
        .sort((a, b) => b.score - a.score)
    : expenseInvoices
        .filter(i => !sl || i.supplier_name?.toLowerCase().includes(sl) || i.variable_symbol?.toLowerCase().includes(sl))
        .map(i => ({
          id: i.id, label: i.variable_symbol || i.supplier_name || '—', sub: i.supplier_name,
          amount: i.amount_czk ?? i.amount ?? 0, currency: i.currency, isExpense: true,
          score: pickerTx ? scoreMatch(pickerTx, i.amount_czk ?? i.amount ?? 0, i.supplier_name, i.status) : 0,
        }))
        .sort((a, b) => b.score - a.score)

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 2, currentYear - 1, currentYear]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bankovní výpis</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {rows.length} transakcí
            {unmatched > 0 && <span className="ml-2 text-orange-600 font-medium">· {unmatched} bez dokladu</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={yearFilter}
            onChange={e => setYearFilter(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => runMatching('auto')}
            disabled={matchRunning !== null}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
            title="Spustit pravidlové párování"
          >
            {matchRunning === 'auto' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Spustit párování
          </button>
          <button
            onClick={() => runMatching('ai')}
            disabled={matchRunning !== null}
            className="flex items-center gap-2 border border-purple-300 text-purple-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-purple-50 disabled:opacity-60 transition-colors"
            title="AI fallback pro nesnadné případy"
          >
            {matchRunning === 'ai' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI pomoc
          </button>
          <button
            onClick={() => setShowAccountsModal(true)}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
            title="Spravovat účty"
          >
            <Settings2 className="h-4 w-4" />
            Účty
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 transition-colors"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync z FIO
          </button>
        </div>
      </div>

      {matchResult && (
        <div className={cn(
          'mt-3 rounded-lg border p-3 flex items-center gap-2 text-sm',
          matchResult.startsWith('✓') ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'
        )}>
          <span className="flex-1">{matchResult}</span>
          <button onClick={() => setMatchResult(null)} className="text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Účet tabs */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-1 mb-4 border-b">
          {accounts.map(acc => (
            <button
              key={acc.id}
              onClick={() => setSelectedId(acc.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                selectedId === acc.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {accountLabel(acc)} <span className="text-xs text-gray-400 ml-1">{acc.currency}</span>
            </button>
          ))}
          {selectedId && (
            <button
              onClick={() => setShowAddTxModal(true)}
              className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 px-3 py-2"
              title="Přidat ruční transakci"
            >
              <Plus className="h-3.5 w-3.5" />
              Přidat transakci
            </button>
          )}
        </div>
      )}

      {!loading && (() => {
        const pendingTxs = txs.filter(t =>
          t.account_id === selectedId
          && t.status === 'pending_review'
          && t.date.startsWith(String(yearFilter))
        )
        if (pendingTxs.length === 0) return null

        const selectedCount = pendingTxs.filter(t => selectedPending.has(t.id)).length
        const allSelected = selectedCount === pendingTxs.length && pendingTxs.length > 0

        function toggleAll() {
          if (allSelected) setSelectedPending(new Set())
          else setSelectedPending(new Set(pendingTxs.map(t => t.id)))
        }
        function toggleOne(id: string) {
          setSelectedPending(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
          })
        }

        return (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setPendingExpanded(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-yellow-100/50 transition-colors"
            >
              <span className="text-sm font-semibold text-yellow-900">
                {pendingTxs.length} návrh{pendingTxs.length === 1 ? '' : pendingTxs.length < 5 ? 'y' : 'ů'} ke schválení
              </span>
              <div className="flex items-center gap-2">
                {selectedCount > 0 && (
                  <span className="text-xs text-yellow-700">{selectedCount} vybráno</span>
                )}
                {pendingExpanded ? <ChevronUp className="h-4 w-4 text-yellow-700" /> : <ChevronDown className="h-4 w-4 text-yellow-700" />}
              </div>
            </button>
            {pendingExpanded && (
              <div className="border-t border-yellow-200">
                <div className="flex items-center justify-between px-4 py-2 bg-white/40 border-b border-yellow-200">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                    <span>Vybrat vše</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => bulkAction('approve')}
                      disabled={selectedCount === 0}
                      className="flex items-center gap-1.5 bg-green-600 text-white text-xs px-3 py-1.5 rounded-md font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
                    >
                      <Check className="h-3 w-3" /> Schválit ({selectedCount})
                    </button>
                    <button
                      onClick={() => bulkAction('reject')}
                      disabled={selectedCount === 0}
                      className="flex items-center gap-1.5 border border-gray-300 text-gray-700 text-xs px-3 py-1.5 rounded-md font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      <X className="h-3 w-3" /> Odmítnout
                    </button>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {pendingTxs.map(tx => {
                      const amt = Math.abs(tx.amount_czk ?? tx.amount)
                      const docNum = getDocNumber(tx)
                      const desc = getDescription(tx)
                      const isSelected = selectedPending.has(tx.id)
                      return (
                        <tr key={tx.id} className={cn('border-b last:border-b-0 hover:bg-white/60', isSelected && 'bg-yellow-100/40')}>
                          <td className="px-3 py-2 w-8">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOne(tx.id)} className="rounded" />
                          </td>
                          <td className="px-2 py-2 text-gray-500 tabular-nums w-16">{fmtDate(tx.date)}</td>
                          <td className="px-2 py-2 text-blue-700 font-medium w-44 truncate">{docNum ?? '—'}</td>
                          <td className="px-2 py-2 text-gray-800">{desc}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium">
                            <span className={tx.type === 'income' ? 'text-green-700' : 'text-red-600'}>
                              {fmtNum(amt)}
                            </span>
                          </td>
                          <td className="px-2 py-2 w-20 text-right">
                            <span className="text-xs text-yellow-700">
                              {tx.match_confidence ?? 0}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Datum</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Č.dokl.</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Popis</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Příjmy</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Výdaje</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Zůstatek</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* Počáteční stav — nahoře (1. ledna) */}
              {rows.length > 0 && (
                <tr className="bg-gray-50/60 border-b-2 border-gray-200">
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-medium">BV</td>
                  <td className="px-3 py-2.5 font-bold text-gray-600 text-xs">x</td>
                  <td className="px-3 py-2.5 font-bold text-gray-800">Počáteční stav</td>
                  <td />
                  <td />
                  <td className="px-3 py-2.5 text-right font-bold text-gray-900 tabular-nums">
                    {editingBalance ? (
                      <input
                        autoFocus
                        type="number"
                        value={selectedId ? (balanceOverrides[selectedId] ?? Number(currentAccount?.starting_balance ?? 0)) : 0}
                        onChange={e => selectedId && setBalanceOverrides(prev => ({ ...prev, [selectedId]: Number(e.target.value) }))}
                        onBlur={() => setEditingBalance(false)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingBalance(false) }}
                        className="w-32 text-right border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingBalance(true)}
                        className="hover:bg-gray-200 rounded px-1 tabular-nums"
                        title="Klikni pro úpravu počátečního zůstatku"
                      >
                        {fmtNum(startingBal)}
                      </button>
                    )}
                  </td>
                </tr>
              )}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    Žádné transakce pro {yearFilter} — klikni na Sync z FIO
                  </td>
                </tr>
              )}

              {rows.map(tx => {
                const docNum = getDocNumber(tx)
                const desc = getDescription(tx)
                const amt = Math.abs(tx.amount_czk ?? tx.amount)
                const isIncome = tx.type === 'income'
                const isMatched = !!(tx.matched_invoice_id || tx.matched_expense_invoice_id)

                return (
                  <tr key={tx.id} className="hover:bg-gray-50/70 group">
                    <td className="px-3 py-2.5 text-gray-500 tabular-nums">{fmtDate(tx.date)}</td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => openPicker(tx.id, e.currentTarget)}
                          className={cn(
                            'text-left truncate max-w-[156px] rounded px-1 -ml-1 text-sm',
                            docNum
                              ? 'text-blue-600 hover:text-blue-800 font-medium hover:underline'
                              : 'text-gray-300 hover:text-gray-500 italic'
                          )}
                        >
                          {docNum ?? '—'}
                        </button>
                        {isMatched && (
                          <button
                            onClick={() => handleRemoveMatch(tx.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity flex-shrink-0"
                            title="Odebrat párování"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-gray-800">
                      {editingNoteId === tx.id ? (
                        <input
                          autoFocus
                          value={noteValue}
                          onChange={e => setNoteValue(e.target.value)}
                          onBlur={() => saveNote(tx.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveNote(tx.id)
                            if (e.key === 'Escape') setEditingNoteId(null)
                          }}
                          className="w-full border-b border-blue-400 bg-transparent outline-none text-sm py-0.5"
                          placeholder="Přidat popis…"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 group/desc">
                          <span className={desc === '—' ? 'text-gray-300' : ''}>{desc}</span>
                          <button
                            onClick={() => startEditNote(tx)}
                            className="opacity-0 group-hover/desc:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity flex-shrink-0"
                            title="Upravit popis"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-green-700">
                      {isIncome ? fmtNum(amt) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-red-600">
                      {!isIncome ? fmtNum(amt) : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900">
                      {fmtNum(tx.runningBalance)}
                    </td>
                  </tr>
                )
              })}

              {/* Aktuální stav — dole (po všech transakcích) */}
              {rows.length > 0 && (
                <tr className="bg-gray-900 text-white border-t-2 border-gray-700">
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-medium">BV</td>
                  <td className="px-3 py-2.5 font-bold text-gray-300 text-xs">x</td>
                  <td className="px-3 py-2.5 font-bold">Aktuální stav</td>
                  <td />
                  <td />
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                    {fmtNum(currentBalance)}
                  </td>
                </tr>
              )}
            </tbody>

            {rows.length > 0 && (
              <tfoot className="border-t bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Celkem {yearFilter}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-green-700">
                    {fmtNum(rows.filter(r => r.type === 'income').reduce((s, r) => s + Math.abs(r.amount_czk ?? r.amount), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-red-600">
                    {fmtNum(rows.filter(r => r.type !== 'income').reduce((s, r) => s + Math.abs(r.amount_czk ?? r.amount), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Picker — fixed overlay */}
      {pickerTxId && pickerPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={closePicker} />
          <div
            className="fixed z-50 w-80 bg-white rounded-xl border shadow-xl"
            style={{ top: pickerPos.top, left: Math.min(pickerPos.left, window.innerWidth - 340) }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-gray-50 rounded-t-xl">
              <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={pickerTx?.type === 'income' ? 'Hledat fakturu…' : 'Hledat dodavatele…'}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
              <button onClick={closePicker} className="text-gray-300 hover:text-gray-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {pickerItems.length === 0 ? (
                <p className="px-3 py-5 text-center text-xs text-gray-400">Nic nenalezeno</p>
              ) : (() => {
                const top = pickerItems.filter(i => i.score >= 35).slice(0, 5)
                const rest = pickerItems.filter(i => i.score < 35).slice(0, 20)
                const renderItem = (item: typeof pickerItems[0]) => (
                  <button
                    key={item.id}
                    onClick={() => handleSetMatch(pickerTxId, item.isExpense ? null : item.id, item.isExpense ? item.id : null)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={cn(
                        'flex-shrink-0 h-2 w-2 rounded-full',
                        item.score >= 60 ? 'bg-green-400' : item.score >= 35 ? 'bg-orange-300' : 'bg-gray-200'
                      )} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-blue-600 truncate">{item.label}</div>
                        {item.sub && item.sub !== item.label && (
                          <div className="text-xs text-gray-500 truncate">{item.sub}</div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                      {Math.round(Number(item.amount)).toLocaleString('cs-CZ')} {item.currency}
                    </span>
                  </button>
                )
                return (
                  <>
                    {top.length > 0 && !sl && (
                      <>
                        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Nejlepší shody</p>
                        {top.map(renderItem)}
                      </>
                    )}
                    {rest.length > 0 && top.length > 0 && !sl && (
                      <p className="px-3 py-1 mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-300 border-t">Ostatní</p>
                    )}
                    {(sl ? pickerItems.slice(0, 25) : rest).map(renderItem)}
                  </>
                )
              })()}
            </div>
            <div className="border-t px-3 py-2 space-y-1">
              <button
                onClick={() => markInternalTransfer(pickerTxId)}
                className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 w-full text-left px-1 py-1 hover:bg-gray-50 rounded transition-colors"
                title="Označit jako vlastní převod — nevyžaduje fakturu"
              >
                <ArrowLeftRight className="h-3 w-3" />
                Vlastní převod (skrýt z fronty)
              </button>
              {(pickerTx?.matched_invoice_id || pickerTx?.matched_expense_invoice_id) && (
                <button
                  onClick={() => { handleRemoveMatch(pickerTxId); closePicker() }}
                  className="text-xs text-red-500 hover:text-red-700 w-full text-center py-0.5"
                >
                  Odebrat párování
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <AccountsManagerModal
        open={showAccountsModal}
        onClose={() => setShowAccountsModal(false)}
        accounts={accounts}
        onChanged={reloadAccounts}
      />

      <AddTransactionModal
        open={showAddTxModal}
        onClose={() => setShowAddTxModal(false)}
        accountCurrency={currentAccount?.currency ?? 'CZK'}
        accountName={currentAccount ? accountLabel(currentAccount) : ''}
        onSubmit={addManualTransaction}
      />
    </div>
  )
}

// ─── Modals ──────────────────────────────────────────────────────────────────

const CURRENCY_OPTIONS = ['CZK', 'EUR', 'USD', 'GBP', 'PLN', 'CHF']

function AccountsManagerModal({
  open, onClose, accounts, onChanged,
}: {
  open: boolean
  onClose: () => void
  accounts: BankAccount[]
  onChanged: () => Promise<void>
}) {
  const [newName, setNewName] = useState('')
  const [newCurrency, setNewCurrency] = useState('CZK')
  const [newAccountNumber, setNewAccountNumber] = useState('')
  const [newStartingBalance, setNewStartingBalance] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ name: string; currency: string; account_number: string; starting_balance: string }>({
    name: '', currency: 'CZK', account_number: '', starting_balance: '0',
  })

  async function handleAdd() {
    if (!newName.trim()) { setError('Vyplň název účtu'); return }
    setBusy(true); setError(null)
    const res = await fetch('/api/banking/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        currency: newCurrency,
        account_number: newAccountNumber.trim(),
        starting_balance: Number(newStartingBalance) || 0,
      }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Chyba'); return }
    setNewName(''); setNewCurrency('CZK'); setNewAccountNumber(''); setNewStartingBalance('0')
    await onChanged()
  }

  function startEdit(acc: BankAccount) {
    setEditingId(acc.id)
    setEditDraft({
      name: acc.name,
      currency: acc.currency,
      account_number: acc.account_number ?? '',
      starting_balance: String(acc.starting_balance ?? 0),
    })
  }

  async function saveEdit() {
    if (!editingId) return
    setBusy(true); setError(null)
    const res = await fetch('/api/banking/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        name: editDraft.name.trim(),
        currency: editDraft.currency,
        account_number: editDraft.account_number.trim(),
        starting_balance: Number(editDraft.starting_balance) || 0,
      }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Chyba'); return }
    setEditingId(null)
    await onChanged()
  }

  async function handleDelete(id: string) {
    if (!confirm('Smazat tento účet? Lze jen pokud nemá transakce.')) return
    setBusy(true); setError(null)
    const res = await fetch('/api/banking/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Chyba'); return }
    await onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bankovní účty</DialogTitle>
        </DialogHeader>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-2">{error}</div>}

        <div className="space-y-1">
          {accounts.map(acc => (
            <div key={acc.id} className="rounded-lg border p-3 space-y-2">
              {editingId === acc.id ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-gray-500">Název</Label>
                    <Input value={editDraft.name} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Měna</Label>
                    <select
                      value={editDraft.currency}
                      onChange={e => setEditDraft({ ...editDraft, currency: e.target.value })}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    >
                      {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Číslo účtu</Label>
                    <Input value={editDraft.account_number} onChange={e => setEditDraft({ ...editDraft, account_number: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Počáteční zůstatek</Label>
                    <Input type="number" step="0.01" value={editDraft.starting_balance} onChange={e => setEditDraft({ ...editDraft, starting_balance: e.target.value })} />
                  </div>
                  <div className="col-span-2 flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)} disabled={busy}>Zrušit</Button>
                    <Button size="sm" onClick={saveEdit} disabled={busy}>Uložit</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{acc.name} <span className="text-xs text-gray-500 ml-1">{acc.currency}</span></p>
                    <p className="text-xs text-gray-500">
                      {acc.account_number ?? 'bez čísla účtu'}
                      {' · '}
                      Počáteční: <span className="tabular-nums">{Number(acc.starting_balance ?? 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {acc.currency}</span>
                    </p>
                  </div>
                  <button onClick={() => startEdit(acc)} className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(acc.id)} className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-lg border-2 border-dashed border-gray-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Přidat účet</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500">Název *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="např. Revolut" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Měna</Label>
              <select
                value={newCurrency}
                onChange={e => setNewCurrency(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Číslo účtu</Label>
              <Input value={newAccountNumber} onChange={e => setNewAccountNumber(e.target.value)} placeholder="volitelné" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Počáteční zůstatek</Label>
              <Input type="number" step="0.01" value={newStartingBalance} onChange={e => setNewStartingBalance(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAdd} disabled={busy || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1.5" /> Přidat
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Zavřít</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddTransactionModal({
  open, onClose, accountCurrency, accountName, onSubmit,
}: {
  open: boolean
  onClose: () => void
  accountCurrency: string
  accountName: string
  onSubmit: (form: {
    date: string; type: 'income' | 'expense'; amount: number;
    note: string; counterparty_name: string; variable_symbol: string;
  }) => Promise<{ ok: boolean; error?: string }>
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [vs, setVs] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setDate(today); setType('expense'); setAmount(''); setNote('')
    setCounterparty(''); setVs(''); setError(null)
  }

  async function handleSave() {
    const amt = parseFloat(amount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) { setError('Částka musí být kladné číslo'); return }
    setBusy(true); setError(null)
    const res = await onSubmit({
      date, type, amount: amt,
      note: note.trim(),
      counterparty_name: counterparty.trim(),
      variable_symbol: vs.trim(),
    })
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Chyba'); return }
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Přidat transakci ({accountName})</DialogTitle>
        </DialogHeader>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-2">{error}</div>}

        <div className="space-y-3">
          <div className="flex gap-2">
            {(['income', 'expense'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg text-sm border transition-colors',
                  type === t
                    ? t === 'income'
                      ? 'bg-green-50 border-green-300 text-green-800'
                      : 'bg-red-50 border-red-300 text-red-800'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                {t === 'income' ? 'Příjem' : 'Výdaj'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500">Datum</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Částka ({accountCurrency})</Label>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-500">Popis</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="např. Zámečnická práce" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500">Protistrana</Label>
              <Input value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="volitelné" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Variabilní symbol</Label>
              <Input value={vs} onChange={e => setVs(e.target.value)} placeholder="volitelné" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }} disabled={busy}>Zrušit</Button>
          <Button onClick={handleSave} disabled={busy || !amount}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ukládám</> : 'Přidat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
