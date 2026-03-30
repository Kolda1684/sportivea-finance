'use client'

import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Settings2 } from 'lucide-react'
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
  variable_symbol: string | null
  message: string | null
  type: 'income' | 'expense'
  status: string
  account_id: string | null
  invoices?: { number: string; subject_name: string } | null
  expense_invoices?: { supplier_name: string } | null
}

function fmtCZK(n: number) {
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function entryLabel(e: JournalEntry): string {
  if (e.invoices) return `${e.invoices.number} · ${e.invoices.subject_name}`
  if (e.expense_invoices?.supplier_name) return e.expense_invoices.supplier_name
  if (e.counterparty_name) return e.counterparty_name
  if (e.message) return e.message.replace(/^n[aá]kup:\s*/i, '').split(',')[0].trim()
  return e.variable_symbol ?? '—'
}

function AccountTable({ account, entries, year }: {
  account: BankAccount
  entries: JournalEntry[]
  year: number
}) {
  const yearEntries = entries
    .filter(e => e.account_id === account.id && new Date(e.date).getFullYear() === year)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let balance = account.starting_balance
  const rows = yearEntries.map((entry, i) => {
    const czk = Math.abs(entry.amount_czk ?? entry.amount)
    const isIncome = entry.type === 'income'
    const income = isIncome ? czk : 0
    const expense = isIncome ? 0 : czk
    balance += isIncome ? czk : -czk
    return { entry, income, expense, balance, label: entryLabel(entry), idx: i + 1 }
  })

  const totalIncome = rows.reduce((s, r) => s + r.income, 0)
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0)
  const finalBalance = account.starting_balance + totalIncome - totalExpense

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-100 border-b">
          <tr>
            <th className="px-3 py-2 text-left text-gray-500 w-8">#</th>
            <th className="px-3 py-2 text-left text-gray-500 w-24">Datum</th>
            <th className="px-3 py-2 text-left text-gray-500 w-28">Doklad/VS</th>
            <th className="px-3 py-2 text-left text-gray-500">Popis</th>
            <th className="px-3 py-2 text-right text-gray-500 w-28">Příjmy</th>
            <th className="px-3 py-2 text-right text-gray-500 w-28">Výdaje</th>
            <th className="px-3 py-2 text-right text-gray-500 w-32">Zůstatek</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="bg-blue-50/60">
            <td className="px-3 py-2 text-gray-400" />
            <td className="px-3 py-2 text-gray-400" />
            <td className="px-3 py-2 font-mono text-gray-400 text-center">x</td>
            <td className="px-3 py-2 font-semibold text-gray-700">Počáteční stav</td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right font-bold text-gray-900">{fmtCZK(account.starting_balance)}</td>
          </tr>

          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-12 text-center text-gray-400">
                Žádné transakce pro rok {year}.<br />Importuj CSV a vyber tento účet.
              </td>
            </tr>
          )}

          {rows.map(r => {
            const isTransfer = r.label.toLowerCase().includes('převod')
            return (
              <tr key={r.entry.id} className={cn(
                'hover:bg-gray-50 transition-colors',
                isTransfer && 'bg-blue-50/40 text-blue-800'
              )}>
                <td className="px-3 py-2 text-gray-400">{r.idx}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(r.entry.date)}</td>
                <td className="px-3 py-2 font-mono text-gray-400 truncate max-w-[100px]" title={r.entry.variable_symbol ?? ''}>
                  {r.entry.variable_symbol ?? '—'}
                </td>
                <td className="px-3 py-2 truncate" title={r.label}>{r.label}</td>
                <td className="px-3 py-2 text-right text-green-700 font-medium tabular-nums">
                  {r.income > 0 ? fmtCZK(r.income) : ''}
                </td>
                <td className="px-3 py-2 text-right text-red-600 font-medium tabular-nums">
                  {r.expense > 0 ? fmtCZK(r.expense) : ''}
                </td>
                <td className={cn(
                  'px-3 py-2 text-right font-medium tabular-nums',
                  r.balance >= 0 ? 'text-gray-900' : 'text-red-600'
                )}>
                  {fmtCZK(r.balance)}
                </td>
              </tr>
            )
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-gray-700 text-xs">CELKEM {year}</td>
              <td className="px-3 py-2 text-right text-green-700 tabular-nums">{fmtCZK(totalIncome)}</td>
              <td className="px-3 py-2 text-right text-red-600 tabular-nums">{fmtCZK(totalExpense)}</td>
              <td className="px-3 py-2 text-right text-gray-900 tabular-nums">{fmtCZK(finalBalance)}</td>
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Účet</p>
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
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finanční deník</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pohyby na účtech · průběžný zůstatek</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">Rok:</span>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
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
            <AccountTable account={activeAccount} entries={entries} year={year} />
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
