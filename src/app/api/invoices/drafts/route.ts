import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signInvoiceUrl } from '@/lib/invoice-storage'

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('expense_invoices')
    .select('id, supplier_name, amount, currency, date, variable_symbol, extracted_data, ocr_warnings, file_path, original_filename, created_at')
    .eq('review_status', 'draft')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const withUrls = await Promise.all((data ?? []).map(async draft => ({
    ...draft,
    file_url: draft.file_path ? await signInvoiceUrl(draft.file_path, 3600) : null,
  })))

  return NextResponse.json({ drafts: withUrls })
}
