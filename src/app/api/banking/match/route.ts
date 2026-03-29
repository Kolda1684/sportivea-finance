import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()

  // Načti všechny nespárované transakce (příjmy i výdaje)
  const { data: transactions, error: txError } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('status', 'unmatched')

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })
  if (!transactions?.length) return NextResponse.json({ matched: 0 })

  // Načti příjmové faktury
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id, number, subject_name, total, due_on, variable_symbol, status')
    .neq('status', 'cancelled')

  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 })

  // Načti nákladové faktury
  const { data: expenseInvoices } = await supabase
    .from('expense_invoices')
    .select('id, supplier_name, amount_czk, amount, due_date, variable_symbol')
    .eq('status', 'unpaid')

  let matched = 0
  const updates: { id: string; matched_invoice_id?: string; matched_expense_invoice_id?: string; status: string }[] = []

  for (const tx of transactions) {
    let matchedInvoice = null
    const isExpense = tx.type === 'expense'

    const searchText = [tx.counterparty_name, tx.message, tx.variable_symbol].filter(Boolean).join(' ').toLowerCase()
    const txAmount = Math.abs(tx.amount_czk ?? tx.amount)
    const txDate = new Date(tx.date)

    if (isExpense) {
      // ── Párování výdajů s nákladovými fakturami ──
      const pool = expenseInvoices ?? []
      const counterparty = (tx.counterparty_name ?? '').toLowerCase()
      const msg = (tx.message ?? '').toLowerCase()
      const allText = [tx.counterparty_name, tx.message, tx.variable_symbol].filter(Boolean).join(' ').toLowerCase()

      // 1. Variabilní symbol (přesná shoda)
      if (tx.variable_symbol) {
        const txVs = tx.variable_symbol.replace(/\s/g, '')
        matchedInvoice = pool.find(inv =>
          inv.variable_symbol && inv.variable_symbol.replace(/\s/g, '') === txVs
        ) ?? null
      }

      // 2. VS faktury se vyskytuje v poznámce nebo zprávě
      if (!matchedInvoice) {
        matchedInvoice = pool.find(inv => {
          if (!inv.variable_symbol) return false
          const vs = inv.variable_symbol.replace(/\s/g, '')
          return allText.includes(vs)
        }) ?? null
      }

      // 3. Jméno dodavatele v protistraně NEBO zprávě (obousměrně)
      if (!matchedInvoice) {
        matchedInvoice = pool.find(inv => {
          if (!inv.supplier_name) return false
          const name = inv.supplier_name.toLowerCase()
          // Slovo z dodavatele v textu transakce
          const nameInText = name.split(/\s+/).some((w: string) => w.length >= 3 && allText.includes(w))
          // Slovo z protistrany v názvu dodavatele
          const textInName = counterparty.split(/\s+/).some((w: string) => w.length >= 3 && name.includes(w))
          // Slovo ze zprávy v názvu dodavatele
          const msgInName = msg.split(/\s+/).some((w: string) => w.length >= 4 && name.includes(w))
          return nameInText || textInName || msgInName
        }) ?? null
      }

      // 4. Částka ±2 % + datum ±30 dní (relaxed)
      if (!matchedInvoice) {
        matchedInvoice = pool.find(inv => {
          const invAmount = inv.amount_czk ?? inv.amount ?? 0
          if (invAmount === 0) return false
          const pctDiff = Math.abs(invAmount - txAmount) / invAmount
          if (pctDiff > 0.02) return false
          if (!inv.due_date) return true
          const diffDays = Math.abs((txDate.getTime() - new Date(inv.due_date).getTime()) / 86400000)
          return diffDays <= 30
        }) ?? null
      }
    } else {
      // ── Párování příjmů s vydanými fakturami ──

      // 1. Variabilní symbol
      if (tx.variable_symbol) {
        matchedInvoice = (invoices ?? []).find(inv =>
          inv.variable_symbol &&
          inv.variable_symbol.replace(/\s/g, '') === tx.variable_symbol.replace(/\s/g, '')
        ) ?? null
      }

      // 2. Číslo faktury ve VS nebo zprávě
      if (!matchedInvoice && (tx.variable_symbol || tx.message)) {
        matchedInvoice = (invoices ?? []).find(inv => {
          const invNum = inv.number?.replace(/\s/g, '')
          if (!invNum) return false
          return tx.variable_symbol?.includes(invNum) || tx.message?.includes(invNum)
        }) ?? null
      }

      // 3. Jméno klienta v protistraně nebo zprávě
      if (!matchedInvoice && searchText) {
        matchedInvoice = (invoices ?? []).find(inv => {
          if (!inv.subject_name) return false
          const invName = inv.subject_name.toLowerCase()
          return invName.split(' ').some((w: string) => w.length >= 4 && searchText.includes(w))
        }) ?? null
      }

      // 4. Číslo faktury ve zprávě
      if (!matchedInvoice && tx.message) {
        matchedInvoice = (invoices ?? []).find(inv => {
          const invNum = inv.number?.replace(/\s/g, '')
          return invNum ? tx.message!.includes(invNum) : false
        }) ?? null
      }

      // 5. Částka ±1 Kč + datum ±14 dní
      if (!matchedInvoice) {
        matchedInvoice = (invoices ?? []).find(inv => {
          if (!inv.total || Math.abs(inv.total - txAmount) > 1) return false
          if (!inv.due_on) return true
          const diffDays = Math.abs((txDate.getTime() - new Date(inv.due_on).getTime()) / 86400000)
          return diffDays <= 14
        }) ?? null
      }
    }

    if (matchedInvoice) {
      updates.push(
        isExpense
          ? { id: tx.id, matched_expense_invoice_id: matchedInvoice.id, status: 'matched' }
          : { id: tx.id, matched_invoice_id: matchedInvoice.id, status: 'matched' }
      )
      matched++
    }
  }

  // Ulož výsledky párování
  for (const update of updates) {
    const { id, ...fields } = update
    await supabase
      .from('bank_transactions')
      .update(fields)
      .eq('id', id)
  }

  return NextResponse.json({ matched, total: transactions.length })
}
