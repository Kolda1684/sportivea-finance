import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic()

const BASE_SYSTEM = `Jsi asistent pro tvorbu cenových kalkulací firmy Sportivea, s.r.o. – česká marketingová a video produkční agentura.

Standardní sazby Sportivea:
- Standartní hodinová sazba (kreativa, strategie, projekt management): 1 750 Kč/h
- Natáčení (kameraman, produkce): 1 000 Kč/h
- Reels / krátký formát (9:16): 3 500 Kč za video
- Dlouhý formát (16:9, YouTube apod.): 8 000 Kč za video

Když dostaneš brief nebo popis projektu:
1. Krátce shrň co jsi pochopil (2-3 věty)
2. Navrhni kalkulaci rozdělenou do logických sekcí (např. "Kreativa & strategie", "Natáčení", "Post-produkce")
3. Ke každé položce odhadni hodiny a cenu dle výše uvedených sazeb — pokud máš v kontextu relevantnější historická data, použij je přednostně
4. Na konci zprávy přilož strukturovaný návrh v tagu <QUOTE>

Formát tagu <QUOTE> (VŽDY validní JSON, čísla bez mezer):
<QUOTE>
{
  "sections": [
    {
      "title": "Název sekce",
      "items": [
        { "description": "Popis položky", "hours": "8", "price": 14000 }
      ]
    }
  ]
}
</QUOTE>

Pokud se jedná jen o dotaz nebo konzultaci bez briefu, odpověz normálně bez tagu <QUOTE>.
Vždy odpovídej v češtině. Buď konkrétní a praktický.`

type FilePayload = { dataUrl: string; name: string; fileType?: 'image' | 'pdf' }

function dataUrlToBlock(file: FilePayload): Anthropic.ContentBlockParam {
  const [header, data] = file.dataUrl.split(',')
  if (file.fileType === 'pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data },
    } as unknown as Anthropic.ContentBlockParam
  }
  const mediaType = header.match(/data:(image\/[a-zA-Z+]+);/)?.[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | undefined
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType ?? 'image/jpeg', data },
  }
}

export async function POST(request: NextRequest) {
  const { messages, contextDocs, images } = await request.json() as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    contextDocs?: { name: string; content: string }[]
    images?: FilePayload[]
  }

  let system = BASE_SYSTEM

  if (contextDocs && contextDocs.length > 0) {
    const contextBlock = contextDocs
      .map(d => `### ${d.name}\n${d.content}`)
      .join('\n\n')
    system += `\n\n---\n## Tvoje znalostní báze (historické kalkulace, vlastní sazby, poznámky)\n\nPři tvorbě kalkulací vycházej primárně z těchto dat:\n\n${contextBlock}`
  }

  // Convert messages — attach images to the last user message if provided
  const claudeMessages: Anthropic.MessageParam[] = messages.map((m, idx) => {
    const isLast = idx === messages.length - 1
    if (isLast && m.role === 'user' && images && images.length > 0) {
      const hasPdf = images.some(f => f.fileType === 'pdf')
      const fallback = hasPdf ? 'Co je v přiloženém PDF? Pomůže ti to sestavit kalkulaci?' : 'Co vidíš na obrázku? Pomůže ti to sestavit kalkulaci?'
      const content: Anthropic.ContentBlockParam[] = [
        ...images.map(file => dataUrlToBlock(file)),
        { type: 'text', text: m.content || fallback },
      ]
      return { role: 'user', content }
    }
    return { role: m.role, content: m.content }
  })

  const hasPdf = (images ?? []).some(f => f.fileType === 'pdf')
  const response = await (hasPdf
    ? anthropic.beta.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system,
        messages: claudeMessages,
        betas: ['pdfs-2024-09-25'],
      })
    : anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system,
        messages: claudeMessages,
      })
  )

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''

  const quoteMatch = raw.match(/<QUOTE>([\s\S]*?)<\/QUOTE>/)
  let sections = null
  const message = raw.replace(/<QUOTE>[\s\S]*?<\/QUOTE>/, '').trim()

  if (quoteMatch) {
    try {
      sections = JSON.parse(quoteMatch[1].trim()).sections
    } catch {
      // invalid JSON – skip
    }
  }

  return NextResponse.json({ message, sections })
}
