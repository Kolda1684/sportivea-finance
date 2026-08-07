import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { extractInvoiceData, processFileBuffer } from '@/lib/invoice-extract'
import { uploadInvoiceFile } from '@/lib/invoice-storage'
import { reviewDraft, explainReasons } from '@/lib/invoice-review'

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

  // 2) Duplicate detection — primárně (dodavatel, číslo dokladu).
  // IČO je v datech vyplněné u nuly z 300 faktur a VS chybí u třetiny, takže
  // původní klíč (IČO + VS + částka + datum) se u 97 z nich vůbec nespustil.
  // Číslo dokladu má naopak 100% pokrytí a nula kolizí.
  const amount = extracted.total_with_vat ?? extracted.total_without_vat ?? null
  const verdict = await reviewDraft(supabase, {
    supplier_name: extracted.supplier_name,
    invoice_number: extracted.invoice_number,
    amount,
    warnings,
  })
  const duplicate = verdict.reasons.find(r => r.kind === 'duplicate')
  const duplicateOf = duplicate
    ? { id: duplicate.invoiceId, supplier_name: duplicate.supplier, date: duplicate.date, number: duplicate.number }
    : null

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
    // Serverové posouzení: agent podle něj pozná, jestli se má ptát.
    review_required: !verdict.clear,
    review_reasons: verdict.reasons,
    review_message: verdict.clear ? null : explainReasons(verdict.reasons),
    file_path: filePath,
  })
}
