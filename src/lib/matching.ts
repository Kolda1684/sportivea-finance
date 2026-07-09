import { getRateSync } from './exchange-rates'

export type MatchZone = 'auto' | 'suggest' | 'manual'

export interface MatchResult {
  invoiceId: string | null
  confidence: number
  zone: MatchZone
  method: string
  suggestions: { id: string; score: number }[]
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

export interface DbExpenseInvoice {
  id: string
  supplier_name: string | null
  amount: number | null
  amount_czk: number | null
  currency: string
  date: string | null
  due_date: string | null
  variable_symbol: string | null
  status: string | null
  note: string | null
}

// Okno, ve kterém může platba k faktuře dorazit
const DAYS_BEFORE_ISSUE = 10 // karta se strhne i pár dní před vystavením faktury (předplatná)
const DAYS_AFTER_DUE = 45 // pozdě platící klienti — skóre lateness penalizuje

// Prahy rozhodování
const AUTO_AMOUNT_TOLERANCE = 0.03 // auto-match vyžaduje částku ±3 %
const SUGGEST_MIN_SCORE = 42
const SUGGEST_MIN_MARGIN = 8 // nejlepší kandidát musí mít náskok, jinak ruční výběr

// Volby matchování — u karetních plateb je VS fragment čísla karty (šum)
export interface MatchOptions {
  ignoreVs?: boolean
}

// Generický kandidát — společný pro vydané i přijaté faktury
interface Candidate {
  id: string
  numberDigits: string | null
  numberNormalized: string | null
  partyName: string | null
  issuedOn: string | null
  dueOn: string | null
  amountCzk: number
  variableSymbol: string | null
}

interface ScoredCandidate {
  id: string
  score: number
  vsMatch: boolean
  numberMatch: boolean
  amountDiffRatio: number
  amountDiffAbs: number
  nameHits: number
  dateDiffDays: number
  vatVariant: 'as_is' | 'plus_vat' | 'minus_vat'  // jaká varianta DPH dala nejlepší shodu
}

// DPH pojistka: vyzkouší 3 varianty (kandidátní částka, ×1.21, ÷1.21) a vrátí nejlepší
function amountDiff(txCzk: number, candAmount: number): { diffAbs: number; diffRatio: number; variant: 'as_is' | 'plus_vat' | 'minus_vat' } {
  const variants: { value: number; variant: 'as_is' | 'plus_vat' | 'minus_vat' }[] = [
    { value: candAmount, variant: 'as_is' },
    { value: candAmount * 1.21, variant: 'plus_vat' },
    { value: candAmount / 1.21, variant: 'minus_vat' },
  ]
  let best: { diffAbs: number; diffRatio: number; variant: 'as_is' | 'plus_vat' | 'minus_vat' } = {
    diffAbs: Infinity, diffRatio: 1, variant: 'as_is',
  }
  for (const v of variants) {
    if (v.value <= 0) continue
    const diffAbs = Math.abs(txCzk - v.value)
    const diffRatio = diffAbs / v.value
    if (diffRatio < best.diffRatio) {
      best = { diffAbs, diffRatio, variant: v.variant }
    }
  }
  return best
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

// VS se porovnává bez vodicích nul ("0012345" == "12345")
function normalizeVs(s: string | null): string | null {
  if (!s) return null
  const digits = s.replace(/\D/g, '').replace(/^0+/, '')
  return digits.length > 0 ? digits : null
}

function toCzkSync(amount: number, currency: string): number {
  if (!currency || currency === 'CZK') return amount
  return amount * getRateSync(currency)
}

// amount_czk ze syncu nemusí být přepočtené (ukládá se abs(amount) bez kurzu),
// proto cizí měny přepočítáváme vždy z původní částky
function txAmountCzk(tx: DbTransaction): number {
  if (tx.currency && tx.currency !== 'CZK') {
    return Math.abs(tx.amount) * getRateSync(tx.currency)
  }
  return Math.abs(tx.amount_czk ?? tx.amount)
}

function isWithinPaymentWindow(txDate: string, issuedOn: string | null, dueOn: string | null): boolean {
  const reference = dueOn ?? issuedOn
  if (!reference) return false
  if (issuedOn && differenceInDays(txDate, issuedOn) < -DAYS_BEFORE_ISSUE) return false
  return differenceInDays(txDate, reference) <= DAYS_AFTER_DUE
}

// Číslo dokladu musí být v textu jako samostatné číslo, ne substring delšího
// čísla (číslo účtu, telefon, jiný VS)
function containsStandaloneDigits(text: string, digits: string): boolean {
  const re = new RegExp(`(^|\\D)${digits}(\\D|$)`)
  return re.test(text)
}

const NAME_STOPWORDS = new Set(['sro', 'spol', 'akciova', 'spolecnost'])

// Priorita signálů dle reálného použití: 1) částka, 2) jméno, 3) datum, 4) VS.
// VS je záměrně jen slabý bonus — dodavatelé (kluci) používají stejná čísla
// faktur (20260014…), takže VS kolidují napříč lidmi.
function scoreCandidate(tx: DbTransaction, txCzk: number, cand: Candidate, opts: MatchOptions): ScoredCandidate {
  let score = 0

  // 1) ČÁSTKA — hlavní signál (včetně DPH variant)
  const { diffAbs: amountDiffAbs, diffRatio: amountDiffRatio, variant: vatVariant } = amountDiff(txCzk, cand.amountCzk)
  if (amountDiffAbs <= 1 || amountDiffRatio <= 0.005) score += 45
  else if (amountDiffRatio <= 0.03) score += 32
  else if (amountDiffRatio <= 0.05) score += 18
  else if (amountDiffRatio <= 0.1) score += 8
  if (vatVariant !== 'as_is') score -= 4

  // 2) JMÉNO — dodavatel/klient v názvu protistrany nebo textu platby
  const txText = normalize(`${tx.counterparty_name ?? ''} ${tx.message ?? ''}`)
  const words = normalize(cand.partyName ?? '')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !NAME_STOPWORDS.has(w))
  const nameHits = words.filter(w => txText.includes(w)).length
  score += Math.min(30, nameHits * 12)

  // 3) DATUM — blízkost splatnosti/vystavení
  const reference = cand.dueOn ?? cand.issuedOn
  let dateDiffDays = 999
  if (reference) {
    dateDiffDays = Math.abs(differenceInDays(tx.date, reference))
    if (dateDiffDays <= 3) score += 15
    else if (dateDiffDays <= 7) score += 11
    else if (dateDiffDays <= 14) score += 7
    else score += 3
  }

  // 4) VS / číslo dokladu — jen bonus (u karet úplně vynecháno)
  let vsMatch = false
  let numberMatch = false
  if (!opts.ignoreVs) {
    const txVs = normalizeVs(tx.variable_symbol)
    const candVs = normalizeVs(cand.variableSymbol)
    vsMatch = !!txVs && !!candVs && txVs === candVs
    if (vsMatch) score += 8

    const rawText = `${tx.message ?? ''} ${tx.variable_symbol ?? ''} ${tx.counterparty_name ?? ''}`
    if (cand.numberDigits && cand.numberDigits.length >= 5) {
      numberMatch = containsStandaloneDigits(rawText, cand.numberDigits)
    }
    if (!numberMatch && cand.numberNormalized && cand.numberNormalized.length >= 5) {
      numberMatch = normalize(rawText).includes(cand.numberNormalized)
    }
    if (numberMatch) score += 12
  }

  return { id: cand.id, score, vsMatch, numberMatch, amountDiffRatio, amountDiffAbs, nameHits, dateDiffDays, vatVariant }
}

function decide(scored: ScoredCandidate[]): MatchResult {
  const suggestions = scored.slice(0, 5).map(s => ({ id: s.id, score: Math.round(s.score) }))

  if (scored.length === 0) {
    return { invoiceId: null, confidence: 0, zone: 'manual', method: 'Žádný kandidát v platebním okně', suggestions }
  }

  const best = scored[0]
  const second = scored[1]
  const margin = best.score - (second?.score ?? 0)

  const vatNote = (v: ScoredCandidate) =>
    v.vatVariant === 'plus_vat' ? ' (faktura uložená bez DPH)' :
    v.vatVariant === 'minus_vat' ? ' (zaplacen jen základ)' : ''

  // AUTO — částka je vždy podmínkou; nikdy jen podle VS
  const amountExact = best.amountDiffAbs <= 1 || best.amountDiffRatio <= 0.005
  const amountClose = best.amountDiffRatio <= AUTO_AMOUNT_TOLERANCE

  // 1) Přesná částka + jméno dodavatele + jednoznačný náskok
  if (amountExact && best.nameHits >= 1 && margin >= 12) {
    return { invoiceId: best.id, confidence: 93, zone: 'auto', method: `Částka přesně + jméno${vatNote(best)}`, suggestions }
  }
  // 2) Částka ±3 % + silné jméno + blízké datum
  if (amountClose && best.nameHits >= 2 && best.dateDiffDays <= 7 && margin >= 12) {
    return { invoiceId: best.id, confidence: 87, zone: 'auto', method: `Částka ±3 % + jméno + datum${vatNote(best)}`, suggestions }
  }
  // 3) Částka + jednoznačný tvrdý identifikátor (VS / číslo dokladu v textu)
  if (amountClose && (best.vsMatch || best.numberMatch)) {
    const otherHardMatch = scored.slice(1).some(s => (s.vsMatch || s.numberMatch) && s.amountDiffRatio <= AUTO_AMOUNT_TOLERANCE)
    if (!otherHardMatch) {
      return { invoiceId: best.id, confidence: 88, zone: 'auto', method: `Částka ±3 % + ${best.vsMatch ? 'VS' : 'číslo dokladu'}${vatNote(best)}`, suggestions }
    }
  }

  // SUGGEST — dost signálu, ale ne jistota. Pozn.: samotné VS už návrh nedělá
  // (dodavatelé používají kolidující čísla faktur).
  if (best.score >= SUGGEST_MIN_SCORE && best.amountDiffRatio <= 0.1) {
    if (margin < SUGGEST_MIN_MARGIN) {
      return {
        invoiceId: null,
        confidence: 0,
        zone: 'manual',
        method: 'Více podobných faktur — vyber ručně',
        suggestions,
      }
    }
    const confidence = Math.min(80, Math.round(best.score))
    return { invoiceId: best.id, confidence, zone: 'suggest', method: 'Kombinace částky, jména a data', suggestions }
  }

  return { invoiceId: null, confidence: 0, zone: 'manual', method: 'Manuální – nenalezena automatická shoda', suggestions }
}

function runMatch(tx: DbTransaction, candidates: Candidate[], opts: MatchOptions = {}): MatchResult {
  const txCzk = txAmountCzk(tx)
  const inWindow = candidates.filter(c => isWithinPaymentWindow(tx.date, c.issuedOn, c.dueOn))
  const scored = inWindow
    .map(c => scoreCandidate(tx, txCzk, c, opts))
    .sort((a, b) => b.score - a.score)
  return decide(scored)
}

// Příjmy — vydané faktury (Fakturoid)
export async function matchTransaction(tx: DbTransaction, invoices: DbInvoice[], opts: MatchOptions = {}): Promise<MatchResult> {
  const candidates: Candidate[] = invoices
    .filter(inv => inv.status !== 'cancelled' && inv.issued_on)
    .map(inv => ({
      id: inv.id,
      numberDigits: inv.number ? inv.number.replace(/\D/g, '') : null,
      numberNormalized: inv.number ? normalize(inv.number).replace(/\s/g, '') : null,
      partyName: inv.subject_name,
      issuedOn: inv.issued_on,
      dueOn: inv.due_on,
      amountCzk: toCzkSync(inv.total, inv.currency),
      variableSymbol: inv.variable_symbol,
    }))
  return runMatch(tx, candidates, opts)
}

// Výdaje — přijaté faktury
export function matchExpenseTransaction(tx: DbTransaction, invoices: DbExpenseInvoice[], opts: MatchOptions = {}): MatchResult {
  const candidates: Candidate[] = invoices
    .filter(inv => inv.status !== 'cancelled')
    .map(inv => {
      const noteDigits = inv.note ? inv.note.replace(/\D/g, '') : ''
      const amountCzk = inv.amount_czk != null
        ? Math.abs(inv.amount_czk)
        : toCzkSync(Math.abs(inv.amount ?? 0), inv.currency)
      return {
        id: inv.id,
        numberDigits: noteDigits.length >= 5 ? noteDigits : null,
        numberNormalized: null,
        partyName: inv.supplier_name,
        issuedOn: inv.date,
        dueOn: inv.due_date,
        amountCzk,
        variableSymbol: inv.variable_symbol,
      }
    })
  const result = runMatch(tx, candidates, opts)
  return { ...result, method: `Přijatá faktura: ${result.method}` }
}
