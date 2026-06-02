import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth } from '@/lib/utils'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getFinancialContext(month: string) {
  const supabase = createAdminSupabaseClient()

  const [incomeRes, varRes, fixedRes, extraRes] = await Promise.all([
    supabase.from('income').select('client, project_name, amount, status').eq('month', month),
    supabase.from('variable_costs').select('team_member, client, price, hours').eq('month', month),
    supabase.from('fixed_costs').select('name, amount').eq('active', true),
    supabase.from('extra_costs').select('name, amount').eq('month', month),
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

async function getContextDocuments() {
  const supabase = createAdminSupabaseClient()
  const { data } = await supabase
    .from('context_documents')
    .select('name, content')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function POST(req: NextRequest) {
  try {
    const { messages, month, currentPage } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }

    const currentMonth = month ?? getCurrentMonth()
    const [financialContext, contextDocs] = await Promise.all([
      getFinancialContext(currentMonth),
      getContextDocuments(),
    ])

    const docsBlock = contextDocs.length > 0
      ? `\n\n## Znalostní báze (dokumenty, ceníky, historické kalkulace)\n\n${contextDocs.map(d => `### ${d.name}\n${d.content}`).join('\n\n---\n\n')}`
      : ''

    const pageContext = currentPage ? `\nUživatel se aktuálně nachází na stránce: ${currentPage}` : ''

    const systemPrompt = `Jsi AI asistent pro marketingovou agenturu Sportivea. Pomáháš majiteli (Janovi) se vším — financemi, cenotvorbou, rozhodováním, analýzou dat.${pageContext}

## Aktuální finanční data (${currentMonth})
${financialContext}${docsBlock}

## Pravidla
- Odpovídej vždy česky
- Buď konkrétní a stručný, používej čísla z dat výše
- Pokud data chybí, řekni to otevřeně
- Formátuj odpovědi přehledně — používej seznamy, tučné písmo, oddíly
- Dávej praktická doporučení pro malou agenturu`

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
  } catch {
    return NextResponse.json({ error: 'Chyba při komunikaci s AI' }, { status: 500 })
  }
}
