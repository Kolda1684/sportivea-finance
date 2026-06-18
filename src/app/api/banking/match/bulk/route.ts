import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Hromadné schválení / odmítnutí návrhů (pending_review)
// Body: { tx_ids: string[], action: 'approve' | 'reject' }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const txIds: string[] = Array.isArray(body.tx_ids) ? body.tx_ids : []
  const action = body.action

  if (txIds.length === 0) return NextResponse.json({ error: 'Žádné transakce' }, { status: 400 })
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action musí být approve nebo reject' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Načti aktuální stav (kvůli sekundárním aktualizacím invoice/expense_invoice)
  const { data: txs } = await supabase
    .from('bank_transactions')
    .select('id, date, matched_invoice_id, matched_expense_invoice_id')
    .in('id', txIds)

  if (!txs) return NextResponse.json({ error: 'Načtení selhalo' }, { status: 500 })

  let processed = 0

  for (const tx of txs) {
    if (action === 'approve') {
      const { error } = await supabase
        .from('bank_transactions')
        .update({
          status: 'matched',
          match_zone: 'manual',
          match_confirmed_at: new Date().toISOString(),
          match_confirmed_by: 'user',
        })
        .eq('id', tx.id)
      if (error) continue
      if (tx.matched_invoice_id) {
        await supabase.from('invoices').update({ status: 'paid', paid_on: tx.date }).eq('id', tx.matched_invoice_id)
      }
      if (tx.matched_expense_invoice_id) {
        await supabase.from('expense_invoices').update({ status: 'paid' }).eq('id', tx.matched_expense_invoice_id)
      }
      processed++
    } else {
      // reject — revert linked invoice statuses + clear match
      if (tx.matched_invoice_id) {
        await supabase.from('invoices').update({ status: 'open', paid_on: null }).eq('id', tx.matched_invoice_id)
      }
      if (tx.matched_expense_invoice_id) {
        await supabase.from('expense_invoices').update({ status: 'unpaid' }).eq('id', tx.matched_expense_invoice_id)
      }
      const { error } = await supabase
        .from('bank_transactions')
        .update({
          status: 'unmatched',
          matched_invoice_id: null,
          matched_expense_invoice_id: null,
          match_confidence: 0,
          match_method: null,
          match_zone: null,
          match_confirmed_at: null,
          match_confirmed_by: null,
        })
        .eq('id', tx.id)
      if (!error) processed++
    }
  }

  return NextResponse.json({ ok: true, processed })
}
