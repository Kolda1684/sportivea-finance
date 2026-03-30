import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Chybí soubor' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const isPdf = file.type === 'application/pdf'

  const fileBlock = isPdf
    ? ({
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
      })
    : ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data: base64,
        },
      })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            {
              type: 'text',
              text: `Z tohoto dokumentu (faktura / účtenka) vyextrahuj následující údaje a vrať POUZE JSON bez jakéhokoliv dalšího textu:

{
  "supplier_name": "název dodavatele / obchodníka",
  "amount": číslo (celková částka bez DPH pokud je k dispozici, jinak celková),
  "currency": "CZK" nebo jiná měna,
  "date": "YYYY-MM-DD" datum vystavení nebo datum transakce,
  "due_date": "YYYY-MM-DD" datum splatnosti nebo null,
  "variable_symbol": "variabilní symbol nebo číslo faktury" nebo null,
  "note": "číslo faktury nebo stručný popis" nebo null
}

Pokud údaj nelze najít, použij null. Částku vrať jako číslo (ne string).`,
            },
          ],
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude nevrátil validní JSON')

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Chyba AI extrakce' }, { status: 500 })
  }
}
