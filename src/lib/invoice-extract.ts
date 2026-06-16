import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface InvoiceItem {
  name: string
  quantity: number
  unit: string | null
  unit_price: number
  vat_rate: number
}

export interface ExtractedInvoice {
  document_type: 'invoice' | 'receipt' | 'other'
  supplier_name: string | null
  supplier_ico: string | null
  supplier_dic: string | null
  supplier_address: string | null
  invoice_number: string | null
  variable_symbol: string | null
  issued_on: string | null
  received_on: string | null
  taxable_supply_date: string | null
  due_on: string | null
  currency: string
  vat_mode: 'standard' | 'none'
  items: InvoiceItem[]
  total_without_vat: number | null
  vat_amount: number | null
  total_with_vat: number | null
  note: string | null
}

export interface OcrWarning {
  field: string
  message: string
}

const PROMPT = `Přečti tuto fakturu/účtenku a extrahuj všechna data.
Vrať POUZE validní JSON bez jakéhokoliv dalšího textu, bez markdown bloků.

Pravidla:
- "taxable_supply_date": pokud není explicitně uvedeno DUZP, použij hodnotu "issued_on"
- "document_type": "invoice" pro fakturu, "receipt" pro účtenku/paragon, "other" pro ostatní
- "currency": třípísmenný kód (CZK, EUR, USD atd.)
- Pokud pole nelze přečíst, použij null – NIKDY neinventuj hodnoty
- Částky vždy jako číslo bez mezer a bez symbolu měny (např. 1500.00)
- Data vždy ve formátu YYYY-MM-DD
- "variable_symbol": variabilní symbol nebo číslo faktury
- "supplier_name": název firmy dodavatele přesně jak je na faktuře
- "supplier_ico": IČO dodavatele (8 číslic, bez mezer)
- "supplier_dic": DIČ dodavatele (s prefixem CZ/SK atd.)
- "items": pole položek faktury — každá položka MUSÍ mít name (nikdy prázdný string ani null)

{
  "document_type": "invoice",
  "supplier_name": null,
  "supplier_ico": null,
  "supplier_dic": null,
  "supplier_address": null,
  "invoice_number": null,
  "variable_symbol": null,
  "issued_on": null,
  "received_on": null,
  "taxable_supply_date": null,
  "due_on": null,
  "currency": "CZK",
  "vat_mode": "standard",
  "items": [
    {
      "name": "Položka",
      "quantity": 1,
      "unit": null,
      "unit_price": 0,
      "vat_rate": 21
    }
  ],
  "total_without_vat": null,
  "vat_amount": null,
  "total_with_vat": null,
  "note": null
}`

export async function processFileBuffer(file: { bytes: Buffer; name: string; type: string }): Promise<{
  buffer: Buffer
  mediaType: 'application/pdf' | 'image/jpeg'
  isPdf: boolean
}> {
  const lowerName = file.name?.toLowerCase() ?? ''
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || lowerName.endsWith('.heic') || lowerName.endsWith('.heif')

  if (isPdf) {
    return { buffer: file.bytes, mediaType: 'application/pdf', isPdf: true }
  }

  // HEIC i obyčejné obrázky → JPEG, normalizovaná velikost (Claude limit base64 ~5 MB)
  // Sharp s libheif podporuje HEIC dekódování (pokud je v build prostředí)
  let pipeline = sharp(file.bytes, { failOn: 'none' })
  if (isHeic) {
    try {
      pipeline = pipeline.toFormat('jpeg')
    } catch (e) {
      throw new Error('HEIC formát nelze přečíst (chybí libheif). Převeď fakturu na JPG nebo PDF.')
    }
  }
  const buffer = await pipeline
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()

  return { buffer, mediaType: 'image/jpeg', isPdf: false }
}

async function callClaude(buffer: Buffer, mediaType: 'application/pdf' | 'image/jpeg'): Promise<string> {
  const base64 = buffer.toString('base64')
  const fileBlock = mediaType === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: base64 } }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
  })

  return response.content[0]?.type === 'text' ? response.content[0].text : ''
}

export async function extractInvoiceData(buffer: Buffer, mediaType: 'application/pdf' | 'image/jpeg'): Promise<{
  data: ExtractedInvoice
  warnings: OcrWarning[]
}> {
  // Retry 1× na 5xx / timeout / parse fail
  let lastErr: Error | null = null
  let text = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      text = await callClaude(buffer, mediaType)
      break
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      const isRetryable = lastErr.message.includes('overloaded') ||
        lastErr.message.includes('timeout') ||
        lastErr.message.includes('5')  // 5xx
      if (attempt === 2 || !isRetryable) throw lastErr
      await new Promise(r => setTimeout(r, 800))
    }
  }

  const cleaned = text.replace(/```json|```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI nevrátila čitelný JSON. Zkus to znovu nebo nahraj jiný formát.')

  let parsed: unknown
  try {
    parsed = JSON.parse(match[0])
  } catch {
    throw new Error('AI vrátila nevalidní JSON.')
  }

  return validateExtracted(parsed)
}

function validateExtracted(raw: unknown): { data: ExtractedInvoice; warnings: OcrWarning[] } {
  const warnings: OcrWarning[] = []
  const r = (raw ?? {}) as Record<string, unknown>

  const asString = (v: unknown): string | null => {
    if (typeof v === 'string') return v.trim() || null
    if (typeof v === 'number') return String(v)
    return null
  }
  const asNumber = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const cleaned = v.replace(/\s/g, '').replace(',', '.')
      const n = parseFloat(cleaned)
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  const asDate = (v: unknown, field: string): string | null => {
    const s = asString(v)
    if (!s) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // Pokus o český formát "12.5.2026" nebo "12. 5. 2026"
    const m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    warnings.push({ field, message: `Datum "${s}" není v rozpoznatelném formátu` })
    return null
  }

  const document_type = (() => {
    const v = asString(r.document_type)
    if (v === 'invoice' || v === 'receipt' || v === 'other') return v
    return 'invoice' as const
  })()

  const items = (() => {
    const arr = Array.isArray(r.items) ? r.items : []
    return arr.map((it, i) => {
      const item = (it ?? {}) as Record<string, unknown>
      const name = asString(item.name) ?? `Položka ${i + 1}`
      if (!asString(item.name)) warnings.push({ field: `items[${i}].name`, message: 'Položka bez názvu, doplněno automaticky' })
      return {
        name,
        quantity: asNumber(item.quantity) ?? 1,
        unit: asString(item.unit),
        unit_price: asNumber(item.unit_price) ?? 0,
        vat_rate: asNumber(item.vat_rate) ?? 21,
      }
    })
  })()

  const issued_on = asDate(r.issued_on, 'issued_on')
  const taxable_supply_date = asDate(r.taxable_supply_date, 'taxable_supply_date') ?? issued_on
  const received_on = asDate(r.received_on, 'received_on') ?? new Date().toISOString().slice(0, 10)
  const due_on = asDate(r.due_on, 'due_on')

  const currency = (() => {
    const v = asString(r.currency)
    if (!v) return 'CZK'
    const up = v.toUpperCase()
    if (!/^[A-Z]{3}$/.test(up)) {
      warnings.push({ field: 'currency', message: `Neplatný kód měny "${v}", použito CZK` })
      return 'CZK'
    }
    return up
  })()

  const total_with_vat = asNumber(r.total_with_vat)
  const total_without_vat = asNumber(r.total_without_vat)
  const vat_amount = asNumber(r.vat_amount)

  // Sanity check: pokud total_with_vat existuje a items mají součet, zkontroluj že to sedí
  if (total_with_vat !== null && items.length > 0) {
    const computed = items.reduce((s, it) => s + it.quantity * it.unit_price * (1 + it.vat_rate / 100), 0)
    if (Math.abs(computed - total_with_vat) > Math.max(1, total_with_vat * 0.02)) {
      warnings.push({ field: 'total_with_vat', message: `Celková částka nesouhlasí se součtem položek (rozdíl ${Math.abs(computed - total_with_vat).toFixed(2)})` })
    }
  }

  if (!asString(r.supplier_name)) warnings.push({ field: 'supplier_name', message: 'Chybí název dodavatele' })
  if (!total_with_vat && !total_without_vat) warnings.push({ field: 'total_with_vat', message: 'Chybí celková částka' })
  if (!issued_on) warnings.push({ field: 'issued_on', message: 'Chybí datum vystavení' })

  const data: ExtractedInvoice = {
    document_type,
    supplier_name: asString(r.supplier_name),
    supplier_ico: asString(r.supplier_ico)?.replace(/\s/g, '') ?? null,
    supplier_dic: asString(r.supplier_dic)?.replace(/\s/g, '').toUpperCase() ?? null,
    supplier_address: asString(r.supplier_address),
    invoice_number: asString(r.invoice_number),
    variable_symbol: asString(r.variable_symbol) ?? asString(r.invoice_number),
    issued_on,
    received_on,
    taxable_supply_date,
    due_on,
    currency,
    vat_mode: r.vat_mode === 'none' ? 'none' : 'standard',
    items,
    total_without_vat,
    vat_amount,
    total_with_vat,
    note: asString(r.note),
  }

  return { data, warnings }
}
