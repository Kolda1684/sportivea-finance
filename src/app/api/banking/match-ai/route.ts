import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST() {
  const supabase = createAdminSupabaseClient()

  const { data: txs, error: txErr } = await supabase
    .from('bank_transactions')
    .select('id, date, amount_czk, currency, variable_symbol, message, counterparty_name, status, match_zone')
    .eq('type', 'income')
    .in('status', ['unmatched', 'pending_review'])
    .order('date', { ascending: false })
    .limit(50)

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })
  if (!txs || txs.length === 0) return NextResponse.json({ suggestions: [], total: 0 })

  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, number, subject_name, issued_on, due_on, total, currency, variable_symbol, status')
    .not('status', 'eq', 'cancelled')

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
  if (!invoices || invoices.length === 0) return NextResponse.json({ suggestions: [], total: 0 })

  const client = new Anthropic()

  const prompt = `Jsi český účetní asistent. Přiřaď každou bankovní transakci k nejlepší nezaplacené faktuře.

Pravidla párování (sestupně dle priority):
1. Shodný variable_symbol
2. Číslo faktury v poli message
3. Podobnost counterparty_name a subject_name
4. Částka do 5 % shody
5. Blízkost data k due_on

TRANSAKCE:
${JSON.stringify(txs, null, 2)}

FAKTURY:
${JSON.stringify(invoices, null, 2)}

Odpověz POUZE validním JSON polem bez jakýchkoli komentářů, markdown nebo vysvětlení. Příklad formátu:
[{"transaction_id":"abc","invoice_id":"xyz","confidence":85,"reason":"Shodný variabilní symbol"},{"transaction_id":"def","invoice_id":null,"confidence":0,"reason":"Žádná shoda"}]

Pravidla pro confidence: 90-100 = jistá shoda (VS nebo číslo faktury), 60-89 = pravděpodobná (jméno + částka), 30-59 = ke kontrole (jen částka nebo jméno), 0-29 = žádná shoda (invoice_id musí být null).`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    // Extract first JSON array
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
    if (!arrayMatch) {
      console.error('AI raw response:', raw)
      throw new Error(`Claude nevrátil JSON pole. Odpověď: ${raw.slice(0, 200)}`)
    }

    let suggestions: { transaction_id: string; invoice_id: string | null; confidence: number; reason: string }[]
    try {
      suggestions = JSON.parse(arrayMatch[0])
    } catch {
      console.error('JSON parse error, raw:', arrayMatch[0].slice(0, 500))
      throw new Error('Nepodařilo se parsovat JSON z AI odpovědi')
    }

    for (const s of suggestions) {
      if (!s.transaction_id) continue
      const hasMatch = s.invoice_id && s.confidence >= 30
      await supabase
        .from('bank_transactions')
        .update({
          status: 'pending_review',
          matched_invoice_id: hasMatch ? s.invoice_id : null,
          match_confidence: s.confidence,
          match_method: `AI: ${s.reason}`,
          match_zone: hasMatch ? 'suggest' : 'manual',
        })
        .eq('id', s.transaction_id)
    }

    return NextResponse.json({
      suggestions,
      total: txs.length,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'AI chyba' },
      { status: 500 }
    )
  }
}
