import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { fetchInvoices, mapFakturoidInvoiceToDb } from '@/lib/fakturoid'

export async function POST() {
  const email = process.env.FAKTUROID_EMAIL
  const token = process.env.FAKTUROID_API_TOKEN
  const slug = process.env.FAKTUROID_SLUG

  if (!email || !token || !slug) {
    return NextResponse.json(
      { error: 'Fakturoid přihlašovací údaje chybí v prostředí.' },
      { status: 500 }
    )
  }

  const supabase = createAdminSupabaseClient()

  // Stáhni max 3 stránky (75 faktur)
  const allInvoices = []
  for (let page = 1; page <= 3; page++) {
    try {
      const batch = await fetchInvoices(slug, email, token, page)
      if (!batch.length) break
      allInvoices.push(...batch)
      if (batch.length < 20) break // poslední stránka
    } catch {
      break
    }
  }

  if (allInvoices.length === 0) {
    return NextResponse.json({ imported: 0, total: 0 })
  }

  const rows = allInvoices.map(mapFakturoidInvoiceToDb)

  const { error } = await supabase
    .from('invoices')
    .upsert(rows, { onConflict: 'fakturoid_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ imported: rows.length, total: allInvoices.length })
}
