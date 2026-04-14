import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Claude AI matching for low-confidence / unmatched transactions.
// Called after the rule-based matching pass — only for manual-zone transactions.

export async function POST() {
  const supabase = createAdminSupabaseClient()

  // Load manual/pending_review transactions (not already auto-matched)
  const { data: txs, error: txErr } = await supabase
    .from('bank_transactions')
    .select('id, date, amount_czk, currency, variable_symbol, message, counterparty_name, status, match_zone')
    .eq('type', 'income')
    .in('status', ['unmatched', 'pending_review'])
    .eq('match_zone', 'manual')
    .order('date', { ascending: false })
    .limit(30)

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })
  if (!txs || txs.length === 0) return NextResponse.json({ suggestions: [], total: 0 })

  // Load open invoices
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, number, subject_name, issued_on, due_on, total, currency, variable_symbol')
    .not('status', 'eq', 'paid')
    .not('status', 'eq', 'cancelled')

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
  if (!invoices || invoices.length === 0) return NextResponse.json({ suggestions: [], total: 0 })

  const client = new Anthropic()

  const prompt = `You are a Czech accounting assistant matching bank transactions to unpaid invoices.

BANK TRANSACTIONS (unmatched):
${JSON.stringify(txs, null, 2)}

OPEN INVOICES:
${JSON.stringify(invoices, null, 2)}

For each transaction, suggest the most likely matching invoice. Rules:
- Match by variable_symbol if present
- Match by invoice number in message
- Match by counterparty name similarity to subject_name
- Match by amount proximity (within 5%)
- Consider date proximity to due_on

Respond ONLY with a JSON array (no markdown, no explanation):
[
  {
    "transaction_id": "...",
    "invoice_id": "...",       // null if no good match
    "confidence": 0-100,       // 0=no match, 100=certain
    "reason": "1-sentence explanation in Czech"
  }
]`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const suggestions = JSON.parse(text)

    // Persist Claude suggestions back to DB
    for (const s of suggestions) {
      if (!s.transaction_id || s.confidence < 30) continue
      await supabase
        .from('bank_transactions')
        .update({
          status: 'pending_review',
          matched_invoice_id: s.invoice_id ?? null,
          match_confidence: s.confidence,
          match_method: `AI: ${s.reason}`,
          match_zone: 'suggest',
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
