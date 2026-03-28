import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { mapFakturoidInvoiceToDb } from '@/lib/fakturoid'

const FAKTUROID_BASE = 'https://app.fakturoid.cz/api/v3/accounts'
const TOKEN_URL = 'https://app.fakturoid.cz/api/v3/oauth/token'

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OAuth token chyba ${res.status}: ${body}`)
  }
  const data = await res.json()
  return data.access_token
}

export async function POST() {
  const clientId = process.env.FAKTUROID_CLIENT_ID
  const clientSecret = process.env.FAKTUROID_CLIENT_SECRET
  const slug = process.env.FAKTUROID_SLUG

  if (!clientId || !clientSecret || !slug) {
    return NextResponse.json(
      { error: `Chybí env proměnné: ${!clientId ? 'FAKTUROID_CLIENT_ID ' : ''}${!clientSecret ? 'FAKTUROID_CLIENT_SECRET ' : ''}${!slug ? 'FAKTUROID_SLUG' : ''}` },
      { status: 500 }
    )
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken(clientId, clientSecret)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'SportiveaFinanceDashboard/1.0',
  }

  // Test připojení — stáhni první stránku
  const url = `${FAKTUROID_BASE}/${slug}/invoices.json?page=1`
  let fakturoidRes: Response
  try {
    fakturoidRes = await fetch(url, { headers, cache: 'no-store' })
  } catch (e) {
    return NextResponse.json({ error: `Nepodařilo se připojit k Fakturoid: ${e}` }, { status: 500 })
  }

  if (!fakturoidRes.ok) {
    const body = await fakturoidRes.text()
    return NextResponse.json(
      { error: `Fakturoid vrátil chybu ${fakturoidRes.status}: ${body}` },
      { status: 500 }
    )
  }

  const firstPage = await fakturoidRes.json()
  if (!Array.isArray(firstPage)) {
    return NextResponse.json(
      { error: `Fakturoid vrátil neočekávaný formát: ${JSON.stringify(firstPage).slice(0, 200)}` },
      { status: 500 }
    )
  }

  const allInvoices = [...firstPage]

  // Stáhni další stránky
  for (let page = 2; page <= 5; page++) {
    try {
      const res = await fetch(`${FAKTUROID_BASE}/${slug}/invoices.json?page=${page}`, { headers, cache: 'no-store' })
      if (!res.ok) break
      const batch = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break
      allInvoices.push(...batch)
      if (batch.length < 20) break
    } catch {
      break
    }
  }

  if (allInvoices.length === 0) {
    return NextResponse.json({ imported: 0, total: 0, message: 'Žádné faktury nenalezeny ve Fakturoid' })
  }

  const rows = allInvoices.map(mapFakturoidInvoiceToDb)
  const supabase = createAdminSupabaseClient()

  const { error: dbError } = await supabase
    .from('invoices')
    .upsert(rows, { onConflict: 'fakturoid_id' })

  if (dbError) {
    return NextResponse.json(
      { error: `Chyba uložení do DB: ${dbError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ imported: rows.length, total: allInvoices.length })
}
