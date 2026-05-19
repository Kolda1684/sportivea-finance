'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Loader2, X, Search, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BankAccount {
  id: string
  name: string
  account_number: string | null
  starting_balance: number | null
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
  if (acc.account_number) return acc.account_number
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
  // Newest first
  const rows = [...withBalances].reverse()
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
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 transition-colors"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync z FIO
          </button>
        </div>
      </div>

      {/* Účet tabs */}
      {accounts.length > 0 && (
        <div className="flex gap-1 mb-4 border-b">
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
              {accountLabel(acc)}
            </button>
          ))}
        </div>
      )}

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
              {/* Aktuální stav — nahoře */}
              <tr className="bg-gray-900 text-white">
                <td className="px-3 py-2.5 text-xs text-gray-400 font-medium">BV</td>
                <td className="px-3 py-2.5 font-bold text-gray-300 text-xs">x</td>
                <td className="px-3 py-2.5 font-bold">Aktuální stav</td>
                <td />
                <td />
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                  {fmtNum(currentBalance)}
                </td>
              </tr>

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

              {/* Počáteční stav — dole */}
              {rows.length > 0 && (
                <tr className="bg-gray-50/60 border-t-2 border-gray-200">
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
            {(pickerTx?.matched_invoice_id || pickerTx?.matched_expense_invoice_id) && (
              <div className="border-t px-3 py-2">
                <button
                  onClick={() => { handleRemoveMatch(pickerTxId); closePicker() }}
                  className="text-xs text-red-500 hover:text-red-700 w-full text-center py-0.5"
                >
                  Odebrat párování
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
