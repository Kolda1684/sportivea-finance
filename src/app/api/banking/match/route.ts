import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()

  // Načti nespárované příchozí transakce
  const { data: transactions, error: txError } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('status', 'unmatched')
    .eq('type', 'income')

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })
  if (!transactions?.length) return NextResponse.json({ matched: 0 })

  // Načti faktury které nejsou zaplacené
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id, number, subject_name, total, due_on, variable_symbol, status')
    .neq('status', 'cancelled')

  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json({ matched: 0 })

  let matched = 0
  const updates: { id: string; matched_invoice_id: string; status: string }[] = []

  for (const tx of transactions) {
    let matchedInvoice = null

    // 1. Variabilní symbol (nejspolehlivější)
    if (tx.variable_symbol) {
      matchedInvoice = invoices.find(inv =>
        inv.variable_symbol &&
        inv.variable_symbol.replace(/\s/g, '') === tx.variable_symbol.replace(/\s/g, '')
      )
    }

    // 2. Číslo faktury ve VS nebo zprávě
    if (!matchedInvoice && (tx.variable_symbol || tx.message)) {
      matchedInvoice = invoices.find(inv => {
        const invNum = inv.number?.replace(/\s/g, '')
        if (!invNum) return false
        return (
          tx.variable_symbol?.includes(invNum) ||
          tx.message?.includes(invNum)
        )
      })
    }

    // 3. Jméno klienta v názvu protiúčtu
    if (!matchedInvoice && tx.counterparty_name) {
      const txName = tx.counterparty_name.toLowerCase()
      matchedInvoice = invoices.find(inv => {
        if (!inv.subject_name) return false
        const invName = inv.subject_name.toLowerCase()
        // Alespoň první slovo se shoduje
        const firstWord = invName.split(' ')[0]
        return txName.includes(firstWord) || invName.includes(txName.split(' ')[0])
      })
    }

    // 4. Částka + datum (±7 dní, tolerance ±1 Kč)
    if (!matchedInvoice) {
      const txDate = new Date(tx.date)
      const txAmount = Math.abs(tx.amount_czk ?? tx.amount)
      matchedInvoice = invoices.find(inv => {
        if (!inv.total) return false
        const amountMatch = Math.abs(inv.total - txAmount) <= 1
        if (!amountMatch) return false
        const dueDate = new Date(inv.due_on)
        const diffDays = Math.abs((txDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        return diffDays <= 14
      })
    }

    if (matchedInvoice) {
      updates.push({
        id: tx.id,
        matched_invoice_id: matchedInvoice.id,
        status: 'matched',
      })
      matched++
    }
  }

  // Ulož výsledky párování
  for (const update of updates) {
    await supabase
      .from('bank_transactions')
      .update({ status: update.status, matched_invoice_id: update.matched_invoice_id })
      .eq('id', update.id)
  }

  return NextResponse.json({ matched, total: transactions.length })
}
