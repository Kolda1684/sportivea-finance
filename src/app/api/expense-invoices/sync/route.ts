import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const FAKTUROID_BASE = 'https://app.fakturoid.cz/api/v3/accounts'
const TOKEN_URL = 'https://app.fakturoid.cz/api/v3/oauth/token'
const SYNC_KEY = 'fakturoid_expenses'

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
  if (!res.ok) throw new Error(`OAuth chyba ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

export async function POST() {
  const clientId = process.env.FAKTUROID_CLIENT_ID
  const clientSecret = process.env.FAKTUROID_CLIENT_SECRET
  const slug = process.env.FAKTUROID_SLUG

  if (!clientId || !clientSecret || !slug) {
    return NextResponse.json({ error: 'Chybí Fakturoid přihlašovací údaje' }, { status: 500 })
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
    'Accept': 'application/json',
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

  // Stáhni přijaté faktury — inkrementálně nebo celé (max 3 stránky)
  const allInvoices: Record<string, unknown>[] = []
  const maxPages = isIncremental ? 10 : 3
  const updatedSinceParam = isIncremental
    ? `&updated_since=${encodeURIComponent(lastSyncedAt!)}`
    : ''

  for (let page = 1; page <= maxPages; page++) {
    const url = `${FAKTUROID_BASE}/${slug}/expenses.json?page=${page}${updatedSinceParam}`
    try {
      const res = await fetch(url, { headers, cache: 'no-store' })
      if (!res.ok) {
        if (page === 1) {
          const body = await res.text()
          return NextResponse.json({ error: `Fakturoid chyba ${res.status}: ${body}` }, { status: 500 })
        }
        break
      }
      const batch = await res.json()
      if (!Array.isArray(batch) || batch.length === 0) break
      allInvoices.push(...batch)
      if (batch.length < 20) break
    } catch {
      break
    }
  }

  if (allInvoices.length === 0) {
    await supabase
      .from('sync_state')
      .upsert({ key: SYNC_KEY, synced_at: syncStartedAt, updated_at: syncStartedAt }, { onConflict: 'key' })
    return NextResponse.json({
      imported: 0,
      total: 0,
      incremental: isIncremental,
      message: 'Žádné nové ani změněné přijaté faktury od posledního syncu',
    })
  }

  const rows = allInvoices
    .filter((inv: Record<string, unknown>) => inv.id)
    .map((inv: Record<string, unknown>) => ({
      fakturoid_id: String(inv.id),
      supplier_name: (inv.supplier_name as string) || (inv.subject_name as string) || (inv.description as string) || null,
      amount: inv.price ? parseFloat(inv.price as string) : (inv.total ? parseFloat(inv.total as string) : null),
      amount_czk: inv.native_price ? parseFloat(inv.native_price as string) : (inv.price ? parseFloat(inv.price as string) : (inv.total ? parseFloat(inv.total as string) : null)),
      currency: (inv.currency as string) || 'CZK',
      date: (inv.taxable_fulfillment_due as string) || (inv.issued_on as string) || null,
      due_date: (inv.due_on as string) || null,
      variable_symbol: (inv.variable_symbol as string) || null,
      status: (inv.status as string) === 'paid' ? 'paid' : 'unpaid',
      review_status: 'approved',
      note: (inv.number as string) ? `Fakturoid #${inv.number}` : null,
    }))

  const { error } = await supabase
    .from('expense_invoices')
    .upsert(rows, { onConflict: 'fakturoid_id', ignoreDuplicates: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
