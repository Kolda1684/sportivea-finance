import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { matchTransaction, DbTransaction, DbInvoice } from '@/lib/matching'
import { setRateCache } from '@/lib/exchange-rates'

export async function POST() {
  const supabase = createAdminSupabaseClient()

  // Předplň sync kurzy do memory cache
  const { data: rates } = await supabase
    .from('exchange_rate_cache')
    .select('currency, rate')
    .order('date', { ascending: false })

  const seen = new Set<string>()
  for (const r of rates ?? []) {
    if (!seen.has(r.currency)) {
      setRateCache(r.currency, Number(r.rate))
      seen.add(r.currency)
    }
  }

  // Načti nespárované income transakce
  const { data: txs, error: txErr } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('type', 'income')
    .in('status', ['unmatched', 'pending_review'])

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })
  if (!txs || txs.length === 0) return NextResponse.json({ total: 0, auto: 0, suggest: 0, manual: 0 })

  // Načti všechny faktury kromě stornovaných — chceme párovat i zaplacené
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, number, subject_name, issued_on, due_on, total, currency, status, variable_symbol')
    .not('status', 'eq', 'cancelled')

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  const stats = { total: txs.length, auto: 0, suggest: 0, manual: 0 }

  for (const tx of txs as DbTransaction[]) {
    const result = await matchTransaction(tx, (invoices ?? []) as DbInvoice[])

    if (result.zone === 'auto') {
      await supabase.from('bank_transactions').update({
        status: 'matched',
        matched_invoice_id: result.invoiceId,
        match_confidence: result.confidence,
        match_method: result.method,
        match_zone: 'auto',
        match_confirmed_at: new Date().toISOString(),
        match_confirmed_by: 'auto',
      }).eq('id', tx.id)
      stats.auto++
    } else {
      await supabase.from('bank_transactions').update({
        status: 'pending_review',
        matched_invoice_id: result.invoiceId,
        match_confidence: result.confidence,
        match_method: result.method,
        match_zone: result.zone,
      }).eq('id', tx.id)
      if (result.zone === 'suggest') stats.suggest++
      else stats.manual++
    }
  }

  return NextResponse.json(stats)
}
