import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { deleteInvoiceFile } from '@/lib/invoice-storage'
import type { ExtractedInvoice } from '@/lib/invoice-extract'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as { extracted?: ExtractedInvoice }
  if (!body.extracted) return NextResponse.json({ error: 'Chybí extracted' }, { status: 400 })

  const ex = body.extracted
  const amount = ex.total_with_vat ?? ex.total_without_vat ?? null

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('expense_invoices')
    .update({
      supplier_name: ex.supplier_name,
      supplier_ico: ex.supplier_ico,
      amount,
      amount_czk: ex.currency === 'CZK' || !ex.currency ? amount : null,
      currency: ex.currency ?? 'CZK',
      date: ex.issued_on,
      due_date: ex.due_on,
      variable_symbol: ex.variable_symbol,
      note: ex.invoice_number,
      extracted_data: ex,
    })
    .eq('id', params.id)
    .eq('review_status', 'draft')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabaseClient()
  const { data: row } = await supabase
    .from('expense_invoices')
    .select('file_path, review_status')
    .eq('id', params.id)
    .single()
  if (!row) return NextResponse.json({ error: 'Draft nenalezen' }, { status: 404 })
  if (row.review_status !== 'draft') {
    return NextResponse.json({ error: 'Lze smazat jen draft, ne schválený náklad' }, { status: 409 })
  }

  if (row.file_path) {
    await deleteInvoiceFile(row.file_path).catch(() => null)
  }
  const { error } = await supabase.from('expense_invoices').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
