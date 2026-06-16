import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { downloadInvoiceFile } from '@/lib/invoice-storage'
import { pushExpenseToFakturoid } from '@/lib/fakturoid-expense'
import type { ExtractedInvoice } from '@/lib/invoice-extract'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabaseClient()
  const { data: draft, error: fetchErr } = await supabase
    .from('expense_invoices')
    .select('id, extracted_data, file_path, original_filename, review_status')
    .eq('id', params.id)
    .single()

  if (fetchErr || !draft) {
    return NextResponse.json({ error: 'Draft nenalezen' }, { status: 404 })
  }
  if (draft.review_status === 'approved') {
    return NextResponse.json({ error: 'Tento náklad už byl schválen' }, { status: 409 })
  }
  if (!draft.extracted_data) {
    return NextResponse.json({ error: 'Draft nemá extrahovaná data' }, { status: 400 })
  }

  const extracted = draft.extracted_data as ExtractedInvoice

  let attachment: { buffer: Buffer; contentType: string; originalName: string } | undefined
  if (draft.file_path) {
    try {
      const { buffer, contentType } = await downloadInvoiceFile(draft.file_path)
      attachment = { buffer, contentType, originalName: draft.original_filename ?? 'faktura' }
    } catch (e) {
      return NextResponse.json({ error: `Načtení souboru selhalo: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 500 })
    }
  }

  let pushed
  try {
    pushed = await pushExpenseToFakturoid(extracted, attachment)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fakturoid push selhal' }, { status: 502 })
  }

  const { error: updErr } = await supabase
    .from('expense_invoices')
    .update({
      review_status: 'approved',
      fakturoid_id: String(pushed.fakturoid_id),
    })
    .eq('id', params.id)

  if (updErr) {
    // Stav v Fakturoidu už je, ale DB se neaktualizovala — informuj přesně
    return NextResponse.json({
      error: `Vloženo do Fakturoidu (id ${pushed.fakturoid_id}), ale DB update selhal: ${updErr.message}`,
      fakturoid_id: pushed.fakturoid_id,
      number: pushed.number,
    }, { status: 500 })
  }

  // Auto-suggest bank match (stejná logika jako v původním submit)
  const amount = extracted.total_with_vat ?? extracted.total_without_vat ?? null
  let suggestedTx: { id: string; date: string; amount: number; amount_czk: number | null; currency: string; counterparty_name: string | null; message: string | null; score: number } | null = null
  if (amount && extracted.issued_on) {
    const issued = new Date(extracted.issued_on)
    const dateFrom = new Date(issued); dateFrom.setDate(dateFrom.getDate() - 60)
    const dateTo = new Date(issued); dateTo.setDate(dateTo.getDate() + 7)
    const { data: candidates } = await supabase
      .from('bank_transactions')
      .select('id, date, amount, amount_czk, currency, counterparty_name, message')
      .eq('status', 'unmatched')
      .eq('type', 'expense')
      .gte('date', dateFrom.toISOString().slice(0, 10))
      .lte('date', dateTo.toISOString().slice(0, 10))
      .limit(60)
    if (candidates && candidates.length > 0) {
      const supplierText = (extracted.supplier_name ?? '').toLowerCase()
      const scored = candidates.map(tx => {
        const txAmt = Math.abs(tx.amount_czk ?? tx.amount)
        const ratio = amount > 0 ? Math.min(txAmt, amount) / Math.max(txAmt, amount) : 0
        let score = ratio * 60
        const txText = [tx.counterparty_name, tx.message].filter(Boolean).join(' ').toLowerCase()
        if (txText && supplierText) {
          const txWords = txText.split(/\W+/).filter(w => w.length > 2)
          const invWords = supplierText.split(/\W+/).filter(w => w.length > 2)
          const hits = txWords.filter(w => invWords.some(iw => iw.includes(w) || w.includes(iw))).length
          score += (hits / Math.max(1, Math.min(txWords.length, invWords.length))) * 40
        }
        return { ...tx, score: Math.round(score) }
      }).sort((a, b) => b.score - a.score)
      if (scored[0].score >= 30) suggestedTx = scored[0]
    }
  }

  return NextResponse.json({
    ok: true,
    fakturoid_id: pushed.fakturoid_id,
    number: pushed.number,
    expenseInvoiceId: params.id,
    suggestedTx,
  })
}
