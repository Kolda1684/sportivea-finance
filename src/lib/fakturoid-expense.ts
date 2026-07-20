import type { ExtractedInvoice } from './invoice-extract'

const FAKTUROID_BASE = 'https://app.fakturoid.cz/api/v3/accounts'
const TOKEN_URL = 'https://app.fakturoid.cz/api/v3/oauth/token'

interface CachedToken {
  token: string
  expiresAt: number
}

let cached: CachedToken | null = null

async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

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
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Fakturoid OAuth ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  if (!data.access_token) throw new Error('Fakturoid OAuth nevrátil access_token')

  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in ?? 3600) * 1000),
  }
  return cached.token
}

function fakturoidHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'SportiveaFinanceDashboard/1.0',
  }
}

// Porovnání názvů firem: bez diakritiky, interpunkce a právních přípon
// (OpenAI, LLC == OpenAI LLC == openai llc)
function normalizeSubjectName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(s r o|a s|spol s r o|inc|llc|ltd|gmbh|pbc|corp|co)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function searchSubjects(query: string, token: string, slug: string): Promise<Record<string, unknown>[]> {
  const url = `${FAKTUROID_BASE}/${slug}/subjects/search.json?query=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: fakturoidHeaders(token) })
  if (!res.ok) return []
  const list = await res.json()
  return Array.isArray(list) ? list : []
}

// Dohledání dodavatele: IČO → DIČ → jméno; nový kontakt se zakládá až když
// nic nesedí (zahraniční dodavatelé IČO nemají — bez fallbacku se duplikovali)
async function findOrCreateSubject(extracted: ExtractedInvoice, token: string, slug: string): Promise<number | null> {
  const headers = fakturoidHeaders(token)

  if (extracted.supplier_ico) {
    const list = await searchSubjects(extracted.supplier_ico, token, slug)
    const found = list.find(s => (s as { registration_no?: string }).registration_no === extracted.supplier_ico)
    if (found) return found.id as number
  }

  if (extracted.supplier_dic) {
    const dic = extracted.supplier_dic.replace(/\s/g, '').toUpperCase()
    const list = await searchSubjects(dic, token, slug)
    const found = list.find(s => ((s as { vat_no?: string }).vat_no ?? '').replace(/\s/g, '').toUpperCase() === dic)
    if (found) return found.id as number
  }

  if (extracted.supplier_name) {
    const wanted = normalizeSubjectName(extracted.supplier_name)
    if (wanted) {
      const list = await searchSubjects(extracted.supplier_name, token, slug)
      const found = list.find(s => normalizeSubjectName(String((s as { name?: string }).name ?? '')) === wanted)
      if (found) return found.id as number
    }
  }

  if (!extracted.supplier_name) return null

  const createRes = await fetch(`${FAKTUROID_BASE}/${slug}/subjects.json`, {
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
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '')
    throw new Error(`Vytvoření dodavatele selhalo: ${createRes.status} ${body.slice(0, 200)}`)
  }
  const sub = await createRes.json()
  return sub.id as number
}

function addDays(d: string, n: number): string {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().slice(0, 10)
}

function attachmentFromBuffer(buffer: Buffer, contentType: string, originalName: string): { filename: string; data_url: string } {
  const filename = (() => {
    if (contentType === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf')) return 'faktura.pdf'
    if (contentType.startsWith('image/')) return `faktura.${contentType.split('/')[1] || 'jpg'}`
    return originalName || 'faktura.bin'
  })()
  return { filename, data_url: `data:${contentType};base64,${buffer.toString('base64')}` }
}

export interface FakturoidPushResult {
  fakturoid_id: number
  number: string
}

export async function pushExpenseToFakturoid(
  extracted: ExtractedInvoice,
  attachment?: { buffer: Buffer; contentType: string; originalName: string }
): Promise<FakturoidPushResult> {
  const slug = process.env.FAKTUROID_SLUG
  if (!slug) throw new Error('Chybí FAKTUROID_SLUG')

  const token = await getAccessToken()
  const subjectId = await findOrCreateSubject(extracted, token, slug)

  const today = new Date().toISOString().slice(0, 10)
  const payload: Record<string, unknown> = {
    document_type: extracted.document_type === 'receipt' ? 'receipt' : 'invoice',
    variable_symbol: extracted.variable_symbol ?? extracted.invoice_number ?? undefined,
    issued_on: extracted.issued_on ?? today,
    received_on: extracted.received_on ?? extracted.issued_on ?? today,
    taxable_fulfillment_due: extracted.taxable_supply_date ?? extracted.issued_on ?? today,
    due_on: extracted.due_on ?? addDays(extracted.issued_on ?? today, 14),
    currency: extracted.currency ?? 'CZK',
    lines: extracted.items.map(item => ({
      name: item.name || 'Položka',
      quantity: item.quantity || 1,
      unit_name: item.unit ?? 'ks',
      unit_price: item.unit_price,
      vat_rate: item.vat_rate,
    })),
    note: extracted.note ?? undefined,
  }
  if (subjectId) payload.subject_id = subjectId
  if (attachment) {
    payload.attachments = [attachmentFromBuffer(attachment.buffer, attachment.contentType, attachment.originalName)]
  }

  const res = await fetch(`${FAKTUROID_BASE}/${slug}/expenses.json`, {
    method: 'POST',
    headers: fakturoidHeaders(token),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => null) ?? await res.text().catch(() => '')
    const details = typeof errBody === 'string' ? errBody : JSON.stringify(errBody)
    throw new Error(`Fakturoid odmítl náklad (${res.status}): ${details.slice(0, 500)}`)
  }

  const created = await res.json()
  return { fakturoid_id: created.id, number: created.number }
}
