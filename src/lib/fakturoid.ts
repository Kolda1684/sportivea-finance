// Fakturoid API v3 wrapper
// Credentials se načítají ze Supabase DB šifrovaně

const FAKTUROID_BASE = 'https://app.fakturoid.cz/api/v2/accounts'

function authHeader(email: string, token: string) {
  const encoded = Buffer.from(`${email}:${token}`).toString('base64')
  return { Authorization: `Basic ${encoded}`, 'Content-Type': 'application/json' }
}

export interface FakturoidInvoice {
  id: number
  number: string
  subject_name: string
  issued_on: string
  due_on: string
  total: string
  currency: string
  status: string
  variable_symbol: string
  note: string | null
  pdf_url: string | null
}

export async function fetchInvoices(
  slug: string,
  email: string,
  token: string,
  page = 1
): Promise<FakturoidInvoice[]> {
  const url = `${FAKTUROID_BASE}/${slug}/invoices.json?page=${page}`
  const res = await fetch(url, {
    headers: authHeader(email, token),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Fakturoid API chyba: ${res.status}`)
  return res.json()
}

export async function createInvoice(
  slug: string,
  email: string,
  token: string,
  payload: Record<string, unknown>
): Promise<FakturoidInvoice> {
  const url = `${FAKTUROID_BASE}/${slug}/invoices.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeader(email, token),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Fakturoid vytvoření faktury selhalo: ${res.status}`)
  return res.json()
}

export async function markInvoicePaid(
  slug: string,
  email: string,
  token: string,
  invoiceId: number
): Promise<void> {
  const url = `${FAKTUROID_BASE}/${slug}/invoices/${invoiceId}/fire.json?event=pay`
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeader(email, token),
  })
  if (!res.ok) throw new Error(`Fakturoid označení zaplaceno selhalo: ${res.status}`)
}

export function mapFakturoidInvoiceToDb(inv: FakturoidInvoice) {
  return {
    fakturoid_id: inv.id.toString(),
    number: inv.number,
    subject_name: inv.subject_name,
    issued_on: inv.issued_on,
    due_on: inv.due_on,
    total: parseFloat(inv.total),
    currency: inv.currency,
    status: inv.status,
    variable_symbol: inv.variable_symbol,
    note: inv.note,
    pdf_url: inv.pdf_url,
  }
}
