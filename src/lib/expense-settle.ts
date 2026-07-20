import type { SupabaseClient } from '@supabase/supabase-js'
import { getExchangeRate } from './exchange-rates'

// Cizoměnové přijaté faktury (USD/EUR…): částka v Kč musí odpovídat tomu,
// co reálně odešlo z účtu — ne kurzu ČNB/Fakturoidu.
//
// - spárování s transakcí → amount_czk = skutečná stržená částka z výpisu
// - odpárování → amount_czk = odhad kurzem ČNB k datu faktury
// - po Fakturoid syncu (upsert přepíše amount_czk jeho kurzem) srovnává
//   reconcileForeignExpenseAmounts spárované faktury zpět na výpis

interface TxAmounts {
  amount: number
  amount_czk: number | null
  currency: string | null
}

// Transakce z korunového účtu nese přesnou částku v Kč; cizoměnový účet ne —
// tam necháme amount_czk být (odhad zůstane)
function realCzkFromTx(tx: TxAmounts): number | null {
  if (tx.currency && tx.currency !== 'CZK') return null
  return Math.abs(tx.amount_czk ?? tx.amount)
}

export async function settleExpenseInvoice(
  supabase: SupabaseClient,
  expenseInvoiceId: string,
  tx: TxAmounts
): Promise<void> {
  const update: Record<string, unknown> = { status: 'paid' }
  const { data: inv } = await supabase
    .from('expense_invoices')
    .select('currency')
    .eq('id', expenseInvoiceId)
    .single()
  if (inv && inv.currency && inv.currency !== 'CZK') {
    const real = realCzkFromTx(tx)
    if (real != null) update.amount_czk = real
  }
  await supabase.from('expense_invoices').update(update).eq('id', expenseInvoiceId)
}

export async function unsettleExpenseInvoice(
  supabase: SupabaseClient,
  expenseInvoiceId: string
): Promise<void> {
  const update: Record<string, unknown> = { status: 'unpaid' }
  const { data: inv } = await supabase
    .from('expense_invoices')
    .select('currency, amount, date')
    .eq('id', expenseInvoiceId)
    .single()
  if (inv && inv.currency && inv.currency !== 'CZK' && inv.amount != null) {
    const rate = await getExchangeRate(inv.currency, inv.date ? new Date(inv.date) : new Date())
    update.amount_czk = Math.round(Number(inv.amount) * rate * 100) / 100
  }
  await supabase.from('expense_invoices').update(update).eq('id', expenseInvoiceId)
}

export async function reconcileForeignExpenseAmounts(supabase: SupabaseClient): Promise<number> {
  const { data: foreign } = await supabase
    .from('expense_invoices')
    .select('id, amount, currency, date, amount_czk')
    .neq('currency', 'CZK')
  if (!foreign || foreign.length === 0) return 0

  const byId = new Map(foreign.map(f => [f.id as string, f]))
  const { data: txs } = await supabase
    .from('bank_transactions')
    .select('amount, amount_czk, currency, matched_expense_invoice_id')
    .in('matched_expense_invoice_id', Array.from(byId.keys()))
    .eq('status', 'matched')

  let fixed = 0
  const matchedIds = new Set<string>()
  for (const tx of txs ?? []) {
    const invId = tx.matched_expense_invoice_id as string
    matchedIds.add(invId)
    const real = realCzkFromTx(tx as TxAmounts)
    const inv = byId.get(invId)
    if (real == null || !inv) continue
    if (inv.amount_czk == null || Math.abs(Number(inv.amount_czk) - real) > 0.009) {
      await supabase.from('expense_invoices').update({ amount_czk: real }).eq('id', invId)
      fixed++
    }
  }

  // Nespárované cizoměnové faktury: odhad kurzem ČNB k datu faktury.
  // Fakturoid native_price bývá nespolehlivý (často jen kopie částky v měně).
  for (const inv of foreign) {
    if (matchedIds.has(inv.id as string) || inv.amount == null) continue
    const rate = await getExchangeRate(inv.currency as string, inv.date ? new Date(inv.date as string) : new Date())
    const estimate = Math.round(Number(inv.amount) * rate * 100) / 100
    if (inv.amount_czk == null || Math.abs(Number(inv.amount_czk) - estimate) > 0.009) {
      await supabase.from('expense_invoices').update({ amount_czk: estimate }).eq('id', inv.id)
      fixed++
    }
  }
  return fixed
}
