'use client'

import { useState, useCallback } from 'react'
import {
  RefreshCw, Sparkles, CheckCircle, AlertCircle, Loader2,
  TrendingUp, Link2, HelpCircle, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCZK, formatDate } from '@/lib/utils'

interface Transaction {
  id: string
  date: string
  amount_czk: number
  currency: string
  variable_symbol: string | null
  message: string | null
  counterparty_name: string | null
  status: string
  match_zone: string | null
  match_confidence: number | null
  match_method: string | null
  matched_invoice_id: string | null
  invoice?: { number: string | null; subject_name: string | null; total: number }
}

interface AiSuggestion {
  transaction_id: string
  invoice_id: string | null
  confidence: number
  reason: string
}

interface MatchStats {
  total: number
  auto: number
  suggest: number
  manual: number
}

const ZONE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  auto:    { label: 'Auto',     color: 'bg-green-100 text-green-800',  icon: <CheckCircle className="h-3 w-3" /> },
  suggest: { label: 'Návrh',   color: 'bg-yellow-100 text-yellow-800', icon: <HelpCircle className="h-3 w-3" /> },
  manual:  { label: 'Manuální', color: 'bg-red-100 text-red-800',      icon: <AlertCircle className="h-3 w-3" /> },
}

export default function BankingPage() {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [matchRunning, setMatchRunning] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null)
  const [aiResult, setAiResult] = useState<{ count: number; tokens: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/banking/transactions')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba načítání')
      setTxs(Array.isArray(data) ? data : data.transactions ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Chyba')
    } finally {
      setLoading(false)
    }
  }, [])

  async function runRuleMatch() {
    setMatchRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/banking/match', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba párování')
      setMatchStats(data)
      await loadTransactions()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Chyba')
    } finally {
      setMatchRunning(false)
    }
  }

  async function runAiMatch() {
    setAiRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/banking/match-ai', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI chyba')
      const aiSuggs: AiSuggestion[] = data.suggestions ?? []
      setAiResult({
        count: aiSuggs.filter((s: AiSuggestion) => s.invoice_id && s.confidence >= 30).length,
        tokens: (data.input_tokens ?? 0) + (data.output_tokens ?? 0),
      })
      await loadTransactions()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI chyba')
    } finally {
      setAiRunning(false)
    }
  }

  async function confirmMatch(txId: string, invoiceId: string) {
    await fetch(`/api/banking/transactions/${txId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'matched',
        matched_invoice_id: invoiceId,
        match_confirmed_at: new Date().toISOString(),
        match_confirmed_by: 'user',
        match_zone: 'auto',
      }),
    })
    await loadTransactions()
  }

  const unmatched = txs.filter(t => t.status !== 'matched')
  const matched   = txs.filter(t => t.status === 'matched')
  const manual    = unmatched.filter(t => t.match_zone === 'manual' || !t.match_zone)

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Párování transakcí</h1>
          <p className="text-sm text-gray-500 mt-1">Spáruj bankovní pohyby s fakturami — automaticky nebo pomocí AI</p>
        </div>
        <Button variant="outline" onClick={loadTransactions} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Načíst transakce
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      {txs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{matched.length}</p>
              <p className="text-xs text-gray-500">Spárovaných</p>
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
            <HelpCircle className="h-8 w-8 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{unmatched.filter(t => t.match_zone === 'suggest').length}</p>
              <p className="text-xs text-gray-500">K potvrzení (návrh)</p>
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{manual.length}</p>
              <p className="text-xs text-gray-500">Manuálních</p>
            </div>
          </div>
        </div>
      )}

      {/* Matching actions */}
      <div className="flex flex-wrap gap-3 items-center">
        <Button onClick={runRuleMatch} disabled={matchRunning || txs.length === 0}>
          <Link2 className={cn('h-4 w-4 mr-2', matchRunning && 'animate-spin')} />
          {matchRunning ? 'Páruji…' : 'Pravidlové párování'}
        </Button>

        <Button
          variant="outline"
          onClick={runAiMatch}
          disabled={aiRunning || manual.length === 0}
          className="border-purple-200 text-purple-700 hover:bg-purple-50"
        >
          <Sparkles className={cn('h-4 w-4 mr-2', aiRunning && 'animate-spin')} />
          {aiRunning ? 'Claude páruje…' : `AI párování (${manual.length} manuálních)`}
        </Button>

        {matchStats && (
          <span className="text-sm text-gray-500">
            Pravidla: <span className="font-medium text-green-600">{matchStats.auto} auto</span>
            {' · '}<span className="font-medium text-yellow-600">{matchStats.suggest} návrhů</span>
            {' · '}<span className="font-medium text-red-500">{matchStats.manual} manuálních</span>
          </span>
        )}

        {aiResult && (
          <span className="text-sm text-purple-600 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Claude navrhl {aiResult.count} shod · {aiResult.tokens.toLocaleString()} tokenů
          </span>
        )}
      </div>

      {/* Token cost note */}
      {manual.length > 0 && (
        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 text-xs text-purple-700 flex items-start gap-2">
          <TrendingUp className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            AI párování pošle {manual.length} transakcí Claudovi (Haiku model) — odhad ~{Math.round(manual.length * 150 + 2000)} tokenů,
            cca <strong>{(manual.length * 0.00025 + 0.003).toFixed(3)} USD</strong>. Velmi levné.
          </span>
        </div>
      )}

      {/* Transactions table */}
      {txs.length === 0 && !loading && (
        <div className="rounded-xl border bg-white p-12 text-center text-gray-400">
          <Link2 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Zatím žádné transakce</p>
          <p className="text-sm mt-1">Klikni na "Načíst transakce" pro zobrazení dat</p>
        </div>
      )}

      {txs.length > 0 && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Datum', 'Protiúčet', 'Zpráva', 'Částka', 'Stav', 'Faktura / Shoda', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {txs.map(tx => {
                const zone = tx.match_zone ?? 'manual'
                const cfg = ZONE_CONFIG[zone] ?? ZONE_CONFIG.manual
                return (
                  <tr key={tx.id} className={cn('hover:bg-gray-50 transition-colors', tx.status === 'matched' && 'opacity-60')}>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="px-4 py-3 font-medium text-xs max-w-[12rem] truncate">{tx.counterparty_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[14rem] truncate">{tx.message ?? '—'}</td>
                    <td className="px-4 py-3 font-bold text-green-700 whitespace-nowrap">{formatCZK(tx.amount_czk)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cfg.color)}>
                        {cfg.icon}{cfg.label}
                        {tx.match_confidence != null && <span className="ml-0.5 opacity-70">{tx.match_confidence}%</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[16rem]">
                      {tx.invoice && (
                        <span className="text-gray-700">
                          <span className="font-mono">{tx.invoice.number}</span>
                          {tx.invoice.subject_name && <span className="text-gray-400"> · {tx.invoice.subject_name}</span>}
                        </span>
                      )}
                      {tx.match_method && !tx.invoice && (
                        <span className="text-gray-400 italic">{tx.match_method}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tx.status !== 'matched' && tx.matched_invoice_id && (
                        <button
                          onClick={() => confirmMatch(tx.id, tx.matched_invoice_id!)}
                          className="flex items-center gap-1 text-xs text-primary-900 hover:underline whitespace-nowrap"
                        >
                          Potvrdit <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
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
}
