/**
 * Změří úspěšnost párování výdajů proti finančnímu deníku.
 *
 *   npx tsx scripts/eval-matching.ts /tmp/pairs.json
 *
 * Deník (Google Sheet, ručně vedený pro účetní) je jediný zdroj, kde je u každé
 * platby ověřeně napsáno, čeho se týká. Vstupem je jeho napojení na
 * bank_transactions; skript pak nechá algoritmus vybrat fakturu a porovná
 * dodavatele s popisem z deníku.
 *
 * Shoda se posuzuje volně (normalizace + společná slova), protože tentýž
 * dodavatel je v deníku pokaždé napsaný jinak: "Sk slavia" i
 * "SK Slavia Praha - fotbal a.s.".
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { matchExpenseTransaction, type DbExpenseInvoice, type DbTransaction } from '../src/lib/matching'

// fileURLToPath, ne .pathname: cesta k projektu obsahuje diakritiku a mezeru,
// které by v URL zůstaly procentuálně zakódované.
const envPath = fileURLToPath(new URL('../.env.local', import.meta.url))
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)

const db = createClient(
  env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

interface Pair {
  date: string
  doc: string
  desc: string
  amount: number
  txId: string
}

const pairs: Pair[] = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/pairs.json', 'utf8'))

async function main() {
const { data: txAll } = await db
    .from('bank_transactions')
    .select('id,date,amount,amount_czk,currency,variable_symbol,message,counterparty_name,counterparty_account,type,status')
    .limit(1000)
  const { data: invAll } = await db
    .from('expense_invoices')
    .select('id,supplier_name,amount,amount_czk,currency,date,due_date,variable_symbol,status,note')
    .limit(1000)
  
  const byId = new Map((txAll ?? []).map(t => [t.id, t]))
  
  const STOP = new Set(['sro', 's', 'r', 'o', 'spol', 'as', 'a', 'praha', 'ceska', 'republika', 'faktura', 'platba'])
  const normalize = (s: string) =>
    (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const tokens = (s: string) => new Set(normalize(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)))
  
  /** Volná shoda: stačí jedno společné slovo delší než tři znaky. */
  function sameParty(a: string, b: string): boolean {
    const ta = tokens(a)
    const tb = tokens(b)
    if (!ta.size || !tb.size) return false
    for (const w of ta) if (tb.has(w)) return true
    return false
  }
  
  let evaluated = 0
  let correct = 0
  let wrong = 0
  let noPick = 0
  const zones: Record<string, number> = {}
  const wrongExamples: string[] = []
  const missExamples: string[] = []
  
  for (const p of pairs) {
    if (p.amount >= 0) continue // jen výdaje → přijaté faktury
    const tx = byId.get(p.txId)
    if (!tx || !p.desc) continue
    evaluated++
  
    const result = matchExpenseTransaction(tx as DbTransaction, (invAll ?? []) as DbExpenseInvoice[])
    zones[result.zone] = (zones[result.zone] ?? 0) + 1
  
    if (!result.invoiceId) {
      noPick++
      if (missExamples.length < 6) {
        missExamples.push(`${p.date} ${Math.abs(p.amount).toFixed(0).padStart(7)} Kč  deník: ${p.desc}`)
      }
      continue
    }
    const picked = (invAll ?? []).find(i => i.id === result.invoiceId)
    if (picked && sameParty(picked.supplier_name ?? '', p.desc)) {
      correct++
    } else {
      wrong++
      if (wrongExamples.length < 8) {
        wrongExamples.push(
          `${p.date} ${Math.abs(p.amount).toFixed(0).padStart(7)} Kč  deník: ${p.desc}  →  vybráno: ${picked?.supplier_name ?? '?'} [${result.zone}]`
        )
      }
    }
  }
  
  console.log(`\nvyhodnoceno výdajů: ${evaluated}`)
  console.log(`  správně:        ${correct}  (${((correct / evaluated) * 100).toFixed(1)} %)`)
  console.log(`  špatně:         ${wrong}  (${((wrong / evaluated) * 100).toFixed(1)} %)`)
  console.log(`  nic nevybráno:  ${noPick}  (${((noPick / evaluated) * 100).toFixed(1)} %)`)
  console.log(`\nrozdělení podle zóny:`, zones)
  
  console.log(`\n--- ukázky ŠPATNĚ vybraných:`)
  wrongExamples.forEach(e => console.log('  ' + e))
  console.log(`\n--- ukázky, kde nevybral nic:`)
  missExamples.forEach(e => console.log('  ' + e))
  
}

main()
