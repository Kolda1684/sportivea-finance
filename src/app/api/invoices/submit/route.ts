import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const FAKTUROID_BASE = 'https://app.fakturoid.cz/api/v3/accounts'
const TOKEN_URL = 'https://app.fakturoid.cz/api/v3/oauth/token'

async function getAccessToken(): Promise<string> {
  const clientId = process.env.FAKTUROID_CLIENT_ID
  const clientSecret = process.env.FAKTUROID_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Chybí FAKTUROID_CLIENT_ID nebo FAKTUROID_CLIENT_SECRET')

  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Fakturoid OAuth chyba: ${res.status}`)
  const data = await res.json()
  return data.access_token
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { extracted, file_base64, file_type } = body

  const slug = process.env.FAKTUROID_SLUG
  if (!slug) return NextResponse.json({ error: 'Chybí FAKTUROID_SLUG' }, { status: 500 })

  let token: string
  try {
    token = await getAccessToken()
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'SportiveaFinanceDashboard/1.0',
  }

  // 1. Najdi nebo vytvoř subjekt (dodavatele)
  let subjectId: number | null = null

  if (extracted.supplier_ico) {
    const searchRes = await fetch(
      `${FAKTUROID_BASE}/${slug}/subjects/search.json?query=${extracted.supplier_ico}`,
      { headers }
    )
    if (searchRes.ok) {
      const subjects = await searchRes.json()
      const found = Array.isArray(subjects)
        ? subjects.find((s: { registration_no?: string }) => s.registration_no === extracted.supplier_ico)
        : null
      if (found) subjectId = found.id
    }
  }

  if (!subjectId && extracted.supplier_name) {
    const createSubRes = await fetch(`${FAKTUROID_BASE}/${slug}/subjects.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: extracted.supplier_name,
        registration_no: extracted.supplier_ico ?? undefined,
        vat_no: extracted.supplier_dic ?? undefined,
        street: extracted.supplier_address ?? undefined,
        type: 'supplier',
      }),
    })
    if (createSubRes.ok) {
      const sub = await createSubRes.json()
      subjectId = sub.id
    }
  }

  // 2. Sestav expense payload
  const today = new Date().toISOString().slice(0, 10)
  const addDays = (d: string, n: number) => {
    const dt = new Date(d)
    dt.setDate(dt.getDate() + n)
    return dt.toISOString().slice(0, 10)
  }

  const payload: Record<string, unknown> = {
    document_type: extracted.document_type === 'receipt' ? 'receipt' : 'invoice',
    variable_symbol: extracted.variable_symbol ?? extracted.invoice_number ?? undefined,
    issued_on: extracted.issued_on ?? today,
    received_on: extracted.received_on ?? today,
    taxable_fulfillment_due: extracted.taxable_supply_date ?? extracted.issued_on ?? today,
    due_on: extracted.due_on ?? addDays(extracted.issued_on ?? today, 14),
    currency: extracted.currency ?? 'CZK',
    lines: (extracted.items ?? []).map((item: { name: string; quantity: number; unit: string | null; unit_price: number; vat_rate: number }) => ({
      name: item.name,
      quantity: item.quantity,
      unit_name: item.unit ?? 'ks',
      unit_price: item.unit_price,
      vat_rate: item.vat_rate,
    })),
    note: extracted.note ?? undefined,
  }
  if (subjectId) payload.subject_id = subjectId

  // 3. Vytvoř expense ve Fakturoidu
  const expRes = await fetch(`${FAKTUROID_BASE}/${slug}/expenses.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!expRes.ok) {
    const err = await expRes.json().catch(() => ({}))
    return NextResponse.json({ error: 'Fakturoid odmítl náklad', details: err }, { status: 422 })
  }

  const created = await expRes.json()

  // 4. Nahraj přílohu
  if (file_base64 && created.id) {
    try {
      const binary = Buffer.from(file_base64, 'base64')
      const blob = new Blob([binary], { type: file_type })
      const formData = new FormData()
      formData.append('file', blob, file_type === 'application/pdf' ? 'faktura.pdf' : 'faktura.jpg')

      await fetch(`${FAKTUROID_BASE}/${slug}/expenses/${created.id}/attachments.json`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'SportiveaFinanceDashboard/1.0' },
        body: formData,
      })
    } catch {
      // Příloha není kritická — pokračuj
    }
  }

  // 5. Ulož do Supabase expense_invoices
  const supabase = createAdminSupabaseClient()
  await supabase.from('expense_invoices').upsert({
    supplier_name: extracted.supplier_name,
    amount: extracted.total_with_vat ?? extracted.total_without_vat,
    currency: extracted.currency ?? 'CZK',
    date: extracted.issued_on,
    due_date: extracted.due_on,
    variable_symbol: extracted.variable_symbol,
    note: extracted.invoice_number,
    fakturoid_id: String(created.id),
  }, { onConflict: 'fakturoid_id' })

  return NextResponse.json({ ok: true, fakturoid_id: created.id, number: created.number })
}
