import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { extractInvoiceData, processFileBuffer } from '@/lib/invoice-extract'
import { uploadInvoiceFile } from '@/lib/invoice-storage'

const MAX_MB = 10

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Chybí soubor' }, { status: 400 })
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Soubor je větší než ${MAX_MB} MB` }, { status: 400 })
  }

  const rawBytes = Buffer.from(await file.arrayBuffer())
  const filename = file.name || 'faktura'
  const supabase = createAdminSupabaseClient()

  let processed: Awaited<ReturnType<typeof processFileBuffer>>
  try {
    processed = await processFileBuffer({ bytes: rawBytes, name: filename, type: file.type })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Soubor nelze zpracovat' }, { status: 400 })
  }

  // 1) OCR + schema validace
  let extracted, warnings
  try {
    const out = await extractInvoiceData(processed.buffer, processed.mediaType)
    extracted = out.data
    warnings = out.warnings
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI extrakce selhala' }, { status: 502 })
  }

  // 2) Duplicate detection — match podle (ico, vs, amount, date)
  const amount = extracted.total_with_vat ?? extracted.total_without_vat ?? null
  let duplicateOf: { id: string; supplier_name: string | null; amount: number | null; date: string | null; review_status: string } | null = null
  if (extracted.supplier_ico || extracted.variable_symbol) {
    const dedupQuery = supabase
      .from('expense_invoices')
      .select('id, supplier_name, amount, date, review_status')
      .limit(1)
    if (extracted.supplier_ico) dedupQuery.eq('supplier_ico', extracted.supplier_ico)
    if (extracted.variable_symbol) dedupQuery.eq('variable_symbol', extracted.variable_symbol)
    if (amount !== null) dedupQuery.eq('amount', amount)
    if (extracted.issued_on) dedupQuery.eq('date', extracted.issued_on)
    const { data } = await dedupQuery
    if (data && data.length > 0) duplicateOf = data[0]
  }

  // 3) Insert draft (před uploadem do storage — potřebujeme ID jako prefix)
  const { data: draft, error: insErr } = await supabase
    .from('expense_invoices')
    .insert({
      supplier_name: extracted.supplier_name,
      supplier_ico: extracted.supplier_ico,
      amount,
      amount_czk: extracted.currency === 'CZK' || !extracted.currency ? amount : null,
      currency: extracted.currency ?? 'CZK',
      date: extracted.issued_on,
      due_date: extracted.due_on,
      variable_symbol: extracted.variable_symbol,
      note: extracted.invoice_number,
      review_status: 'draft',
      extracted_data: extracted,
      ocr_warnings: warnings,
      original_filename: filename,
      status: 'unpaid',
    })
    .select('id')
    .single()

  if (insErr || !draft) {
    return NextResponse.json({ error: `Uložení draftu selhalo: ${insErr?.message ?? 'unknown'}` }, { status: 500 })
  }

  // 4) Upload zpracovaného souboru do Storage (PDF zůstává PDF, HEIC/img → JPEG)
  const baseName = filename.replace(/\.[^.]+$/, '') || 'faktura'
  const storedName = processed.isPdf ? `${baseName}.pdf` : `${baseName}.jpg`
  let filePath: string | null = null
  try {
    filePath = await uploadInvoiceFile(draft.id, storedName, processed.buffer, processed.mediaType)
    await supabase.from('expense_invoices').update({ file_path: filePath }).eq('id', draft.id)
  } catch (e) {
    // Storage selhal — smaž draft, ať neukotvíme orphan
    await supabase.from('expense_invoices').delete().eq('id', draft.id)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload souboru selhal' }, { status: 500 })
  }

  return NextResponse.json({
    draft_id: draft.id,
    extracted,
    warnings,
    duplicate_of: duplicateOf,
    file_path: filePath,
  })
}
