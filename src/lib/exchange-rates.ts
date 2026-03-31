import { createAdminSupabaseClient } from './supabase-server'

// Fallback kurzy pro případ výpadku ČNB API
const FALLBACK_RATES: Record<string, number> = {
  EUR: 25.0,
  USD: 22.5,
  GBP: 29.0,
}

function formatCnbDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}.${m}.${y}`
}

// Vrátí předchozí pracovní den (ČNB nevydává kurzy o víkendech)
function prevBusinessDay(date: Date): Date {
  const d = new Date(date)
  do { d.setDate(d.getDate() - 1) } while (d.getDay() === 0 || d.getDay() === 6)
  return d
}

async function fetchCnbRate(currency: string, date: Date): Promise<number | null> {
  // ČNB nevydává kurzy pro víkendy — použij předchozí pracovní den
  const queryDate = (date.getDay() === 0 || date.getDay() === 6)
    ? prevBusinessDay(date)
    : date

  const url = `https://www.cnb.cz/cs/financni_trhy/devizovy_trh/kurzy_devizoveho_trhu/denni_kurz.txt?date=${formatCnbDate(queryDate)}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const text = await res.text()

    for (const line of text.split('\n')) {
      const parts = line.split('|')
      if (parts.length < 5) continue
      const code = parts[3]?.trim()
      if (code !== currency) continue
      const amount = parseFloat(parts[2]?.replace(',', '.') ?? '1')
      const rate = parseFloat(parts[4]?.replace(',', '.') ?? '0')
      if (!amount || !rate) continue
      return rate / amount  // kurz za 1 jednotku měny
    }
    return null
  } catch {
    return null
  }
}

export async function getExchangeRate(currency: string, date: Date): Promise<number> {
  if (currency === 'CZK') return 1

  const supabase = createAdminSupabaseClient()
  const dateStr = date.toISOString().slice(0, 10)

  // Zkus cache
  const { data: cached } = await supabase
    .from('exchange_rate_cache')
    .select('rate')
    .eq('currency', currency)
    .eq('date', dateStr)
    .single()

  if (cached) return Number(cached.rate)

  // Stáhni z ČNB
  const rate = await fetchCnbRate(currency, date)

  if (rate) {
    await supabase.from('exchange_rate_cache').upsert(
      { currency, date: dateStr, rate },
      { onConflict: 'currency,date' }
    )
    return rate
  }

  return FALLBACK_RATES[currency] ?? 25.0
}

// Synchronní verze — čte z in-memory cache (naplněné při předchozích volání)
const memCache: Record<string, number> = { ...FALLBACK_RATES }

export function setRateCache(currency: string, rate: number) {
  memCache[currency] = rate
}

export function getRateSync(currency: string): number {
  return memCache[currency] ?? FALLBACK_RATES[currency] ?? 25.0
}
