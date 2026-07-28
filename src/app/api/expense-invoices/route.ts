import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// GET bez dynamických parametrů by Next cachoval (i Supabase fetch) → vždy čerstvá data
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('expense_invoices')
    .select('*')
    .eq('review_status', 'approved')
    .order('date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // U cizoměnových faktur rozliš, jestli je částka v Kč skutečná (z bankovního
  // výpisu), nebo jen odhad kurzem ČNB. Stav "zaplaceno" to neurčuje — faktury
  // po splatnosti se označují zaplacené i bez nalezené platby.
  const rows = data ?? []
  const foreignIds = rows.filter(r => r.currency && r.currency !== 'CZK').map(r => r.id)
  const bankBacked = new Set<string>()
  if (foreignIds.length > 0) {
    const { data: txs } = await supabase
      .from('bank_transactions')
      .select('matched_expense_invoice_id')
      .in('matched_expense_invoice_id', foreignIds)
      .eq('status', 'matched')
    for (const tx of txs ?? []) bankBacked.add(tx.matched_expense_invoice_id as string)
  }

  return NextResponse.json(rows.map(r => ({ ...r, czk_from_bank: bankBacked.has(r.id) })))
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('expense_invoices')
    .insert({
      supplier_name: body.supplier_name || null,
      amount: body.amount ? parseFloat(body.amount) : null,
      amount_czk: body.amount_czk ? parseFloat(body.amount_czk) : body.amount ? parseFloat(body.amount) : null,
      currency: body.currency || 'CZK',
      date: body.date || null,
      due_date: body.due_date || null,
      variable_symbol: body.variable_symbol || null,
      status: body.status || 'unpaid',
      review_status: 'approved',
      note: body.note || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
