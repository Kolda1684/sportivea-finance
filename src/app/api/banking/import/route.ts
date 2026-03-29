import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Kurzy: EUR/USD → CZK přes Frankfurter API (ECB)
async function getExchangeRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=CZK&to=EUR,USD,GBP', {
      cache: 'no-store',
    })
    if (!res.ok) return { EUR: 25, USD: 23, GBP: 29 }
    const data = await res.json()
    // data.rates = { EUR: 0.04, USD: 0.043 } (CZK → foreign)
    // Potřebujeme foreign → CZK, tedy převrátit
    const rates: Record<string, number> = { CZK: 1 }
    for (const [currency, rate] of Object.entries(data.rates as Record<string, number>)) {
      rates[currency] = 1 / rate
    }
    return rates
  } catch {
    return { CZK: 1, EUR: 25, USD: 23, GBP: 29 }
  }
}

function parseFioCsv(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Najdi řádek s hlavičkou (obsahuje "Datum" nebo "Objem")
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase()
    if (lower.includes('datum') && lower.includes('objem')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return []

  const separator = lines[headerIdx].includes(';') ? ';' : ','

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === separator && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[headerIdx]).map(h => h.toLowerCase().replace(/"/g, ''))

  // Mapování sloupců (FIO používá různé názvy)
  const col = {
    date: headers.findIndex(h => h.includes('datum')),
    amount: headers.findIndex(h => h.includes('objem') || h === 'částka'),
    currency: headers.findIndex(h => h.includes('měna')),
    counterparty: headers.findIndex(h => h.includes('název protiúčtu') || h.includes('protiúčet název')),
    counterpartyAccount: headers.findIndex(h => h.includes('protiúčet') && !h.includes('název') && !h.includes('kód')),
    vs: headers.findIndex(h => h.includes('variabilní') || h === 'vs'),
    message: headers.findIndex(h => h.includes('zpráva') || h.includes('poznámka') || h.includes('komentář')),
    id: headers.findIndex(h => h.includes('id pohybu') || h.includes('id pokynu') || h.includes('číslo šarže')),
  }

  const transactions = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || line.startsWith('"ID účtu"') || line.startsWith('ID účtu')) continue
    const cells = parseLine(line)
    if (cells.length < 3) continue

    const rawDate = col.date >= 0 ? cells[col.date]?.replace(/"/g, '') : ''
    const rawAmount = col.amount >= 0 ? cells[col.amount]?.replace(/"/g, '').replace(/\s/g, '').replace(',', '.') : '0'
    const currency = col.currency >= 0 ? cells[col.currency]?.replace(/"/g, '').trim() : 'CZK'

    // Datum: DD.MM.YYYY nebo YYYY-MM-DD
    let date = rawDate
    const dmyMatch = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (dmyMatch) date = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`

    const amount = parseFloat(rawAmount) || 0
    if (date === '' || isNaN(amount)) continue

    const fioId = col.id >= 0 ? cells[col.id]?.replace(/"/g, '') : null
    const vs = col.vs >= 0 ? cells[col.vs]?.replace(/"/g, '').trim() : null
    const counterpartyName = col.counterparty >= 0 ? cells[col.counterparty]?.replace(/"/g, '').trim() : null
    const counterpartyAccount = col.counterpartyAccount >= 0 ? cells[col.counterpartyAccount]?.replace(/"/g, '').trim() : null
    const message = col.message >= 0 ? cells[col.message]?.replace(/"/g, '').trim() : null

    transactions.push({
      fio_id: fioId || `${date}_${amount}_${Math.random().toString(36).slice(2, 8)}`,
      date,
      amount,
      currency: currency || 'CZK',
      counterparty_name: counterpartyName || null,
      counterparty_account: counterpartyAccount || null,
      variable_symbol: vs || null,
      message: message || null,
      type: amount > 0 ? 'income' : 'expense',
      status: 'unmatched',
    })
  }

  return transactions
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const accountId = formData.get('account_id') as string | null
  if (!file) return NextResponse.json({ error: 'Chybí soubor' }, { status: 400 })

  const text = await file.text()
  const parsed = parseFioCsv(text)

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'Nepodařilo se načíst žádné transakce. Zkontroluj formát CSV.' }, { status: 400 })
  }

  const rates = await getExchangeRates()

  const rows = parsed.map(t => ({
    ...t,
    exchange_rate: rates[t.currency] ?? 1,
    amount_czk: t.amount * (rates[t.currency] ?? 1),
    ...(accountId ? { account_id: accountId } : {}),
  }))

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('bank_transactions')
    .upsert(rows, { onConflict: 'fio_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aktualizuj account_id pro již existující transakce (pokud ignoreDuplicates přeskočil)
  if (accountId) {
    const fioIds = rows.map(r => r.fio_id).filter(Boolean)
    await supabase
      .from('bank_transactions')
      .update({ account_id: accountId })
      .in('fio_id', fioIds)
      .is('account_id', null)
  }

  return NextResponse.json({ imported: rows.length, total: parsed.length })
}
