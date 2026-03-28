import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, monthBounds } from '@/lib/utils'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getFinancialContext(month: string) {
  const supabase = createAdminSupabaseClient()
  const { from, to } = monthBounds(month)

  const [incomeRes, varRes, fixedRes, extraRes] = await Promise.all([
    supabase.from('income').select('client, project_name, amount, status').eq('month', month),
    supabase.from('variable_costs').select('team_member, client, price, hours').eq('month', month),
    supabase.from('fixed_costs').select('name, amount').eq('active', true),
    supabase.from('extra_costs').select('description, amount').eq('month', month),
  ])

  const income = incomeRes.data ?? []
  const varCosts = varRes.data ?? []
  const fixedCosts = fixedRes.data ?? []
  const extraCosts = extraRes.data ?? []

  const totalIncome = income.reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalVar = varCosts.reduce((s, r) => s + (r.price ?? 0), 0)
  const totalFixed = fixedCosts.reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalExtra = extraCosts.reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalCosts = totalVar + totalFixed + totalExtra
  const profit = totalIncome - totalCosts
  const margin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0

  // Top klienti
  const clientMap: Record<string, number> = {}
  for (const r of income) {
    if (r.client) clientMap[r.client] = (clientMap[r.client] ?? 0) + (r.amount ?? 0)
  }
  const topClients = Object.entries(clientMap).sort(([, a], [, b]) => b - a).slice(0, 5)

  // Tým
  const memberMap: Record<string, { price: number; hours: number }> = {}
  for (const r of varCosts) {
    const n = r.team_member ?? 'Neznámý'
    if (!memberMap[n]) memberMap[n] = { price: 0, hours: 0 }
    memberMap[n].price += r.price ?? 0
    memberMap[n].hours += r.hours ?? 0
  }

  return `
Aktuální měsíc: ${month}
Datum sestavení: ${new Date().toLocaleDateString('cs-CZ')}

FINANČNÍ PŘEHLED:
- Příjmy celkem: ${totalIncome.toLocaleString('cs-CZ')} Kč
- Variabilní náklady: ${totalVar.toLocaleString('cs-CZ')} Kč
- Fixní náklady: ${totalFixed.toLocaleString('cs-CZ')} Kč
- Extra náklady: ${totalExtra.toLocaleString('cs-CZ')} Kč
- Celkové náklady: ${totalCosts.toLocaleString('cs-CZ')} Kč
- Zisk: ${profit.toLocaleString('cs-CZ')} Kč
- Marže: ${margin} %

TOP KLIENTI (příjmy):
${topClients.map(([c, v]) => `- ${c}: ${v.toLocaleString('cs-CZ')} Kč`).join('\n') || '- žádná data'}

NÁKLADY NA TÝM:
${Object.entries(memberMap).map(([n, d]) => `- ${n}: ${d.price.toLocaleString('cs-CZ')} Kč / ${d.hours} h`).join('\n') || '- žádná data'}

FIXNÍ NÁKLADY:
${fixedCosts.map(f => `- ${f.name}: ${f.amount?.toLocaleString('cs-CZ')} Kč`).join('\n') || '- žádná data'}

PŘÍJMY dle statusu:
- Čekáme: ${income.filter(i => i.status === 'cekame').length} položek
- Potvrzeno: ${income.filter(i => i.status === 'potvrzeno').length} položek
- Vystaveno: ${income.filter(i => i.status === 'vystaveno').length} položek
- Zaplaceno: ${income.filter(i => i.status === 'zaplaceno').length} položek
`.trim()
}

export async function POST(req: NextRequest) {
  try {
    const { messages, month } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }

    const currentMonth = month ?? getCurrentMonth()
    const financialContext = await getFinancialContext(currentMonth)

    const systemPrompt = `Jsi finančního asistent pro marketingovou agenturu Sportivea/Kolda. Pomáháš majiteli agentury (Janovi) sledovat finance, analyzovat data a přijímat rozhodnutí.

Kontext o firmě:
- Česká marketingová/video produkční agentura
- Tým: Daniel Richtr, Filip Telenský, Jan Pachota, Michal Komárek, Ondřej Cetkovský, Ondřej Kolář, Vojtěch Kepka, Anna Švaralová, Adam Onderka
- Klienti: Flashscore, Slavia, Fortuna liga žen, Ironman, J&T, PBH, More Buckets, drinkr, a další

Aktuální finanční data:
${financialContext}

Pravidla:
- Odpovídej vždy česky
- Buď konkrétní a stručný
- Pokud je otázka o číslech, cituj přesná data z kontextu výše
- Pokud data chybí (žádná data pro měsíc), řekni to otevřeně
- Dávej praktická doporučení pro malou agenturu
- Nepoužívej žargon, mluv přirozeně`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ message: text })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json({ error: 'Chyba při komunikaci s AI' }, { status: 500 })
  }
}
