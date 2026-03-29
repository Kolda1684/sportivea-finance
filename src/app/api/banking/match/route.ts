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

  // Načti nákladové faktury (všechny — i zaplacené, abychom mohli spárovat transakce)
  const { data: expenseInvoices } = await supabase
    .from('expense_invoices')
    .select('id, supplier_name, amount_czk, amount, due_date, variable_symbol')

  // Normalizace: malá písmena + odstranění diakritiky + interpunkce → mezery
  const norm = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim()

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
      const txVs = tx.variable_symbol?.replace(/\s/g, '') ?? ''
      const txNorm = norm([tx.counterparty_name, tx.message].filter(Boolean).join(' '))

      // Pro platby kartou ("Nákup: MERCHANT, ...") extrahuj název obchodníka
      let merchantNorm = ''
      if (tx.message) {
        const m = tx.message.match(/n[aá]kup:\s*([^,]+)/i)
        if (m) merchantNorm = norm(m[1])
      }

      // 1. Variabilní symbol — přesná shoda + částka v rozumném rozsahu (±20 %)
      if (txVs) {
        matchedInvoice = pool.find(inv => {
          if (!inv.variable_symbol) return false
          if (inv.variable_symbol.replace(/\s/g, '') !== txVs) return false
          const invAmt = Math.abs(inv.amount_czk ?? inv.amount ?? 0)
          if (invAmt === 0) return true
          return Math.abs(invAmt - txAmount) / Math.max(invAmt, txAmount) <= 0.20
        }) ?? null

        // 1b. VS přesná shoda bez ohledu na částku (VS je spolehlivý identifikátor)
        if (!matchedInvoice) {
          matchedInvoice = pool.find(inv =>
            inv.variable_symbol?.replace(/\s/g, '') === txVs
          ) ?? null
        }
      }

      // 2. Název obchodníka z "Nákup:" ve jménu dodavatele (slova ≥ 5 znaků)
      if (!matchedInvoice && merchantNorm) {
        const merchantWords = merchantNorm.split(' ').filter((w: string) => w.length >= 5)
        if (merchantWords.length > 0) {
          matchedInvoice = pool.find(inv => {
            if (!inv.supplier_name) return false
            const supplier = norm(inv.supplier_name)
            return merchantWords.some((w: string) => supplier.includes(w))
          }) ?? null
        }
      }

      // 3. První významné slovo (≥ 5 znaků) z názvu dodavatele v textu transakce
      if (!matchedInvoice) {
        matchedInvoice = pool.find(inv => {
          if (!inv.supplier_name) return false
          const supplier = norm(inv.supplier_name)
          const firstWord = supplier.split(' ').find((w: string) => w.length >= 5)
          return firstWord ? txNorm.includes(firstWord) : false
        }) ?? null
      }

      // 4. Částka přesně ±1 Kč + datum splatnosti ±5 dní (obě podmínky nutné)
      if (!matchedInvoice) {
        matchedInvoice = pool.find(inv => {
          const invAmt = Math.abs(inv.amount_czk ?? inv.amount ?? 0)
          if (Math.abs(invAmt - txAmount) > 1) return false
          if (!inv.due_date) return false
          const diffDays = Math.abs((txDate.getTime() - new Date(inv.due_date).getTime()) / 86400000)
          return diffDays <= 5
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
