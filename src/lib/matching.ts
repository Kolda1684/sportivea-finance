import { getExchangeRate, getRateSync } from './exchange-rates'

export type MatchZone = 'auto' | 'suggest' | 'manual'

export interface MatchResult {
  invoiceId: string | null
  confidence: number
  zone: MatchZone
  method: string
  suggestions: DbInvoice[]
}

// Typy z Supabase
export interface DbTransaction {
  id: string
  date: string
  amount: number
  amount_czk: number
  currency: string
  variable_symbol: string | null
  message: string | null
  counterparty_name: string | null
  type: string
  status: string
}

export interface DbInvoice {
  id: string
  number: string | null
  subject_name: string | null
  issued_on: string | null
  due_on: string | null
  total: number
  currency: string
  status: string | null
  variable_symbol: string | null
}

function differenceInDays(dateA: string | Date, dateB: string | Date): number {
  const a = new Date(dateA).getTime()
  const b = new Date(dateB).getTime()
  return Math.round((a - b) / 86400000)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
}

function toAmountCzkSync(amount: number, currency: string): number {
  if (currency === 'CZK') return amount
  return amount * getRateSync(currency)
}

function computeSimilarityScore(tx: DbTransaction, inv: DbInvoice): number {
  let score = 0

  const invCzk = toAmountCzkSync(inv.total, inv.currency)
  const txAmount = tx.amount_czk ?? Math.abs(tx.amount)
  const amountRatio = invCzk > 0 ? Math.abs(txAmount - invCzk) / invCzk : 1
  score += Math.max(0, 40 - amountRatio * 400)

  const txText = normalize(`${tx.counterparty_name ?? ''} ${tx.message ?? ''}`)
  const words = normalize(inv.subject_name ?? '').split(/\s+/).filter(w => w.length >= 3)
  const matches = words.filter(w => txText.includes(w)).length
  score += Math.min(35, matches * 12)

  if (inv.due_on) {
    const daysDiff = Math.abs(differenceInDays(tx.date, inv.due_on))
    score += Math.max(0, 25 - daysDiff * 0.5)
  }

  return score
}

function makeResult(
  invoiceId: string | null,
  confidence: number,
  zone: MatchZone,
  method: string,
  candidates: DbInvoice[]
): MatchResult {
  return { invoiceId, confidence, zone, method, suggestions: candidates.slice(0, 5) }
}

export async function matchTransaction(
  tx: DbTransaction,
  invoices: DbInvoice[]
): Promise<MatchResult> {
  const txAmount = tx.amount_czk ?? Math.abs(tx.amount)
  const txDate = new Date(tx.date)

  // Pouze nezaplacené faktury vydané max 6 měsíců zpět
  const candidates = invoices.filter(inv => {
    if (inv.status === 'paid' || inv.status === 'cancelled') return false
    if (!inv.issued_on) return false
    return differenceInDays(tx.date, inv.issued_on) <= 180
  })

  const scored = [...candidates]
    .map(inv => ({ inv, score: computeSimilarityScore(tx, inv) }))
    .sort((a, b) => b.score - a.score)
  const top5 = scored.slice(0, 5).map(s => s.inv)

  // KROK 1: VS + částka ±3 %
  if (tx.variable_symbol && tx.variable_symbol.length > 0) {
    const vsMatches = candidates.filter(inv => inv.variable_symbol === tx.variable_symbol)
    if (vsMatches.length === 1) {
      const inv = vsMatches[0]
      const invCzk = await getExchangeRate(inv.currency, txDate).then(r => inv.total * r)
      const diff = invCzk > 0 ? Math.abs(txAmount - invCzk) / invCzk : 1
      if (diff <= 0.03) {
        return makeResult(inv.id, 90, 'auto', 'VS + částka ±3 %', top5)
      }
    }
  }

  // KROK 2: Číslo faktury ve zprávě nebo VS
  const searchIn = normalize(`${tx.message ?? ''} ${tx.variable_symbol ?? ''} ${tx.counterparty_name ?? ''}`)
  const numMatch = candidates.find(inv => {
    if (!inv.number) return false
    const numClean = inv.number.replace(/\D/g, '')
    return searchIn.includes(normalize(inv.number)) ||
           (numClean.length >= 5 && searchIn.includes(numClean))
  })
  if (numMatch) {
    return makeResult(numMatch.id, 88, 'auto', 'Číslo faktury ve zprávě', top5)
  }

  // KROK 3: Název klienta + částka ±5 %
  const txText = normalize(`${tx.counterparty_name ?? ''} ${tx.message ?? ''}`)
  const nameAndAmount = candidates.find(inv => {
    const words = normalize(inv.subject_name ?? '').split(/\s+/).filter(w => w.length >= 4)
    const nameHit = words.some(w => txText.includes(w))
    if (!nameHit) return false
    const invCzk = toAmountCzkSync(inv.total, inv.currency)
    const diff = invCzk > 0 ? Math.abs(txAmount - invCzk) / invCzk : 1
    return diff <= 0.05
  })
  if (nameAndAmount) {
    return makeResult(nameAndAmount.id, 70, 'suggest', 'Název klienta + částka ±5 %', top5)
  }

  // KROK 4: Částka ±1 Kč + datum splatnosti ±14 dní
  const amountAndDate = candidates.find(inv => {
    if (!inv.due_on) return false
    const invCzk = toAmountCzkSync(inv.total, inv.currency)
    const amountDiff = Math.abs(txAmount - invCzk)
    const daysDiff = Math.abs(differenceInDays(tx.date, inv.due_on))
    return amountDiff <= 1 && daysDiff <= 14
  })
  if (amountAndDate) {
    return makeResult(amountAndDate.id, 45, 'suggest', 'Částka ±1 Kč + datum splatnosti ±14 dní', top5)
  }

  // KROK 5: Manuální
  return {
    invoiceId: null,
    confidence: 0,
    zone: 'manual',
    method: 'Manuální – nenalezena automatická shoda',
    suggestions: top5,
  }
}
