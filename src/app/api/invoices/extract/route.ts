import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
- "items": pole položek faktury

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
      "name": "",
      "quantity": 1,
      "unit": null,
      "unit_price": 0,
      "vat_rate": 21
    }
  ],
  "total_without_vat": null,
  "vat_amount": null,
  "total_with_vat": null,
  "note": null,
  "confidence": {
    "overall": 0,
    "low_confidence_fields": []
  }
}`

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Chybí soubor' }, { status: 400 })

  const MAX_MB = 10
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Soubor je příliš velký. Maximum je ${MAX_MB} MB.` }, { status: 400 })
  }

  const rawBytes = Buffer.from(await file.arrayBuffer())
  let imageBuffer: Buffer = rawBytes

  // Detekuj PDF podle MIME typu nebo přípony souboru (file.type bývá prázdný na serveru)
  const isPdf =
    file.type === 'application/pdf' ||
    file.name?.toLowerCase().endsWith('.pdf')

  // Kompresuj obrázky přes 4 MB — Claude API limit je 5 MB
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024
  if (!isPdf && imageBuffer.length > MAX_IMAGE_BYTES) {
    imageBuffer = await sharp(imageBuffer)
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
  }

  const base64 = imageBuffer.toString('base64')

  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const imageType = SUPPORTED_IMAGE_TYPES.includes(file.type) ? file.type : 'image/jpeg'

  const fileBlock = isPdf
    ? ({
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
      })
    : ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: imageType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: base64,
        },
      })

  try {
    const response = isPdf
      ? await client.beta.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          betas: ['pdfs-2024-09-25'],
          messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
        })
      : await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
        })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude nevrátil validní JSON')

    const data = JSON.parse(jsonMatch[0])

    // Nastav taxable_supply_date pokud chybí
    if (!data.taxable_supply_date && data.issued_on) {
      data.taxable_supply_date = data.issued_on
    }
    // Nastav received_on pokud chybí
    if (!data.received_on) {
      data.received_on = new Date().toISOString().slice(0, 10)
    }

    return NextResponse.json({ ...data, _file_base64: base64, _file_type: file.type })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Chyba AI extrakce' }, { status: 500 })
  }
}
