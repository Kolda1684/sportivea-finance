import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { mapFakturoidInvoiceToDb, FakturoidInvoice } from '@/lib/fakturoid'

const FAKTUROID_BASE = 'https://app.fakturoid.cz/api/v3/accounts'
const TOKEN_URL = 'https://app.fakturoid.cz/api/v3/oauth/token'
const SYNC_KEY = 'fakturoid_invoices'

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

  const supabase = createAdminSupabaseClient()

  // Zjisti čas posledního syncu pro inkrementální stahování
  const { data: syncState } = await supabase
    .from('sync_state')
    .select('synced_at')
    .eq('key', SYNC_KEY)
    .maybeSingle()

  const lastSyncedAt = syncState?.synced_at as string | null
  const isIncremental = !!lastSyncedAt
  const syncStartedAt = new Date().toISOString()

  // Stáhni faktury — inkrementálně (updated_since) nebo celé (max 5 stránek)
  const allInvoices: FakturoidInvoice[] = []
  const maxPages = isIncremental ? 10 : 5
  const updatedSinceParam = isIncremental
    ? `&updated_since=${encodeURIComponent(lastSyncedAt!)}`
    : ''

  for (let page = 1; page <= maxPages; page++) {
    const url = `${FAKTUROID_BASE}/${slug}/invoices.json?page=${page}${updatedSinceParam}`
    try {
      const res = await fetch(url, { headers, cache: 'no-store' })
      if (!res.ok) {
        if (page === 1) {
          const body = await res.text()
          return NextResponse.json(
            { error: `Fakturoid vrátil chybu ${res.status}: ${body}` },
            { status: 500 }
          )
        }
        break
      }
      const batch = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break
      allInvoices.push(...batch)
      if (batch.length < 20) break
    } catch (e) {
      if (page === 1) return NextResponse.json({ error: `Připojení k Fakturoid selhalo: ${e}` }, { status: 500 })
      break
    }
  }

  if (allInvoices.length === 0) {
    // Nic nového — přesto aktualizuj čas syncu
    await supabase
      .from('sync_state')
      .upsert({ key: SYNC_KEY, synced_at: syncStartedAt, updated_at: syncStartedAt }, { onConflict: 'key' })
    return NextResponse.json({
      imported: 0,
      total: 0,
      incremental: isIncremental,
      message: 'Žádné nové ani změněné faktury od posledního syncu',
    })
  }

  const rows = allInvoices.map((inv) => mapFakturoidInvoiceToDb(inv))

  const { error: dbError } = await supabase
    .from('invoices')
    .upsert(rows, { onConflict: 'fakturoid_id' })

  if (dbError) {
    return NextResponse.json({ error: `Chyba uložení do DB: ${dbError.message}` }, { status: 500 })
  }

  // Ulož čas tohoto syncu
  await supabase
    .from('sync_state')
    .upsert({ key: SYNC_KEY, synced_at: syncStartedAt, updated_at: syncStartedAt }, { onConflict: 'key' })

  return NextResponse.json({
    imported: rows.length,
    total: allInvoices.length,
    incremental: isIncremental,
    updated_since: lastSyncedAt ?? null,
  })
}
