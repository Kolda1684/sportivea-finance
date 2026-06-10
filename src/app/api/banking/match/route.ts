import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { matchTransaction, matchExpenseTransaction, DbTransaction, DbInvoice, DbExpenseInvoice } from '@/lib/matching'
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

  // Načti nespárované příjmové transakce
  const { data: incomeTxs, error: txErr } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('type', 'income')
    .in('status', ['unmatched', 'pending_review'])

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  // Načti všechny faktury kromě stornovaných — chceme párovat i zaplacené
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, number, subject_name, issued_on, due_on, total, currency, status, variable_symbol')
    .not('status', 'eq', 'cancelled')

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  const stats = { total: 0, auto: 0, suggest: 0, manual: 0, income: 0, expense: 0 }

  const { data: existingIncomeMatches, error: existingIncomeErr } = await supabase
    .from('bank_transactions')
    .select('id, matched_invoice_id')
    .not('matched_invoice_id', 'is', null)
    .in('status', ['matched', 'pending_review'])

  if (existingIncomeErr) return NextResponse.json({ error: existingIncomeErr.message }, { status: 500 })

  const usedIncomeInvoiceIds = new Set(
    (existingIncomeMatches ?? [])
      .filter(row => !(incomeTxs ?? []).some(tx => tx.id === row.id))
      .map(row => row.matched_invoice_id as string)
      .filter(Boolean)
  )

  for (const tx of (incomeTxs ?? []) as DbTransaction[]) {
    stats.total++
    stats.income++
    const availableInvoices = ((invoices ?? []) as DbInvoice[])
      .filter(inv => !usedIncomeInvoiceIds.has(inv.id))
    const result = await matchTransaction(tx, availableInvoices)

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
      if (result.invoiceId) {
        usedIncomeInvoiceIds.add(result.invoiceId)
        await supabase.from('invoices').update({
          status: 'paid',
          paid_on: tx.date,
        }).eq('id', result.invoiceId)
      }
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
      if (result.invoiceId) usedIncomeInvoiceIds.add(result.invoiceId)
    }
  }

  // Načti nespárované výdajové transakce a páruj proti přijatým fakturám
  const { data: expenseTxs, error: expenseTxErr } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('type', 'expense')
    .in('status', ['unmatched', 'pending_review'])

  if (expenseTxErr) return NextResponse.json({ error: expenseTxErr.message }, { status: 500 })

  const { data: expenseInvoices, error: expenseInvErr } = await supabase
    .from('expense_invoices')
    .select('id, supplier_name, amount, amount_czk, currency, date, due_date, variable_symbol, status, note')
    .not('status', 'eq', 'cancelled')

  if (expenseInvErr) return NextResponse.json({ error: expenseInvErr.message }, { status: 500 })

  const { data: existingExpenseMatches, error: existingExpenseErr } = await supabase
    .from('bank_transactions')
    .select('id, matched_expense_invoice_id')
    .not('matched_expense_invoice_id', 'is', null)
    .in('status', ['matched', 'pending_review'])

  if (existingExpenseErr) return NextResponse.json({ error: existingExpenseErr.message }, { status: 500 })

  const usedExpenseInvoiceIds = new Set(
    (existingExpenseMatches ?? [])
      .filter(row => !(expenseTxs ?? []).some(tx => tx.id === row.id))
      .map(row => row.matched_expense_invoice_id as string)
      .filter(Boolean)
  )

  for (const tx of (expenseTxs ?? []) as DbTransaction[]) {
    stats.total++
    stats.expense++
    const availableExpenseInvoices = ((expenseInvoices ?? []) as DbExpenseInvoice[])
      .filter(inv => !usedExpenseInvoiceIds.has(inv.id))
    const result = matchExpenseTransaction(tx, availableExpenseInvoices)

    if (result.zone === 'auto') {
      await supabase.from('bank_transactions').update({
        status: 'matched',
        matched_invoice_id: null,
        matched_expense_invoice_id: result.invoiceId,
        match_confidence: result.confidence,
        match_method: result.method,
        match_zone: 'auto',
        match_confirmed_at: new Date().toISOString(),
        match_confirmed_by: 'auto',
      }).eq('id', tx.id)
      if (result.invoiceId) {
        usedExpenseInvoiceIds.add(result.invoiceId)
        await supabase.from('expense_invoices').update({ status: 'paid' }).eq('id', result.invoiceId)
      }
      stats.auto++
    } else {
      await supabase.from('bank_transactions').update({
        status: 'pending_review',
        matched_invoice_id: null,
        matched_expense_invoice_id: result.invoiceId,
        match_confidence: result.confidence,
        match_method: result.method,
        match_zone: result.zone,
      }).eq('id', tx.id)
      if (result.zone === 'suggest') stats.suggest++
      else stats.manual++
      if (result.invoiceId) usedExpenseInvoiceIds.add(result.invoiceId)
    }
  }

  return NextResponse.json(stats)
}
