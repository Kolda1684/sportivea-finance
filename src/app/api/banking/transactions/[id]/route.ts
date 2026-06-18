import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  if (body.action === 'confirm_match') {
    const { data: tx, error: txError } = await supabase
      .from('bank_transactions')
      .select('id, date, matched_invoice_id, matched_expense_invoice_id')
      .eq('id', params.id)
      .single()

    if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

    const { error } = await supabase
      .from('bank_transactions')
      .update({
        status: 'matched',
        match_zone: 'manual',
        match_confirmed_at: new Date().toISOString(),
        match_confirmed_by: 'user',
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (tx.matched_invoice_id) {
      await supabase.from('invoices').update({ status: 'paid', paid_on: tx.date }).eq('id', tx.matched_invoice_id)
    }
    if (tx.matched_expense_invoice_id) {
      await supabase.from('expense_invoices').update({ status: 'paid' }).eq('id', tx.matched_expense_invoice_id)
    }

    return NextResponse.json({ ok: true })
  }

  if (body.action === 'set_match') {
    const invoiceId: string | null = body.invoice_id ?? null
    const expenseInvoiceId: string | null = body.expense_invoice_id ?? null

    // Načti stávající match — pro revert staré faktury
    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('date, matched_invoice_id, matched_expense_invoice_id')
      .eq('id', params.id)
      .single()

    // Revert stávající faktury zpět na open/unpaid
    if (existing?.matched_invoice_id && existing.matched_invoice_id !== invoiceId) {
      await supabase.from('invoices').update({ status: 'open', paid_on: null }).eq('id', existing.matched_invoice_id)
    }
    if (existing?.matched_expense_invoice_id && existing.matched_expense_invoice_id !== expenseInvoiceId) {
      await supabase.from('expense_invoices').update({ status: 'unpaid' }).eq('id', existing.matched_expense_invoice_id)
    }

    await supabase.from('bank_transactions').update({
      status: 'matched',
      matched_invoice_id: invoiceId,
      matched_expense_invoice_id: expenseInvoiceId,
      match_zone: 'manual',
      match_method: 'Ruční párování',
      match_confidence: 100,
      match_confirmed_at: new Date().toISOString(),
      match_confirmed_by: 'user',
    }).eq('id', params.id)

    if (invoiceId && existing?.date) {
      await supabase.from('invoices').update({ status: 'paid', paid_on: existing.date }).eq('id', invoiceId)
    }
    if (expenseInvoiceId) {
      await supabase.from('expense_invoices').update({ status: 'paid' }).eq('id', expenseInvoiceId)
    }

    return NextResponse.json({ ok: true })
  }

  if (body.action === 'reject_match') {
    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('matched_invoice_id, matched_expense_invoice_id')
      .eq('id', params.id)
      .single()

    if (existing?.matched_invoice_id) {
      await supabase.from('invoices').update({ status: 'open', paid_on: null }).eq('id', existing.matched_invoice_id)
    }
    if (existing?.matched_expense_invoice_id) {
      await supabase.from('expense_invoices').update({ status: 'unpaid' }).eq('id', existing.matched_expense_invoice_id)
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
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'mark_internal_transfer') {
    // Označit jako vlastní převod — vypadne z matching fronty, případně odpáruje
    const { data: existing } = await supabase
      .from('bank_transactions')
      .select('matched_invoice_id, matched_expense_invoice_id')
      .eq('id', params.id)
      .single()

    if (existing?.matched_invoice_id) {
      await supabase.from('invoices').update({ status: 'open', paid_on: null }).eq('id', existing.matched_invoice_id)
    }
    if (existing?.matched_expense_invoice_id) {
      await supabase.from('expense_invoices').update({ status: 'unpaid' }).eq('id', existing.matched_expense_invoice_id)
    }

    const { error } = await supabase
      .from('bank_transactions')
      .update({
        is_internal_transfer: true,
        status: 'ignored',
        matched_invoice_id: null,
        matched_expense_invoice_id: null,
        match_zone: null,
        match_method: 'Vlastní převod',
        match_confidence: 0,
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'unmark_internal_transfer') {
    const { error } = await supabase
      .from('bank_transactions')
      .update({
        is_internal_transfer: false,
        status: 'unmatched',
        match_method: null,
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const allowed = ['counterparty_name', 'message', 'note']
  const update: Record<string, string | null> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key] ?? null
  }

  const { error } = await supabase
    .from('bank_transactions')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
