/**
 * Naplní slovník protistran z finančního deníku a změří, co by to přineslo.
 *
 *   npx tsx scripts/seed-aliases.ts /tmp/pairs.json          # jen změří
 *   npx tsx scripts/seed-aliases.ts /tmp/pairs.json --write  # zapíše do DB
 *
 * Měření je dělené v čase: slovník se učí ze starších měsíců a zkouší se na
 * novějších. Kdyby se měřilo na stejných datech, ze kterých se učil, vyšlo by
 * skoro sto procent a neřeklo by to nic o tom, jak si poradí s příštím měsícem.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { aliasKey, aliasMapKey, normalizeText, type AliasKind, type CounterpartyAlias, type TransactionLike } from '../src/lib/counterparty'

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url))
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)

interface Pair {
  date: string
  doc: string
  desc: string
  amount: number
  txId: string
  account: string | null
  vs: string | null
  message: string | null
}

/**
 * Deník má sloupec "account", rozpoznávání čte "counterparty_account".
 * Bez tohohle převodu by se slovník naučil jen platby kartou a všechny převody
 * by tiše propadly.
 */
const asTransaction = (p: Pair): TransactionLike => ({
  message: p.message,
  counterparty_name: null,
  counterparty_account: p.account,
})

const pairs: Pair[] = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/pairs.json', 'utf8'))
const shouldWrite = process.argv.includes('--write')

/** Z řádků deníku udělá slovník: klíč → nejčastější popisek. */
function learn(rows: Pair[]) {
  const votes = new Map<string, { kind: AliasKind; pattern: string; labels: Map<string, number> }>()
  for (const p of rows) {
    if (!p.desc?.trim()) continue
    const key = aliasKey(asTransaction(p))
    if (!key) continue
    const id = aliasMapKey(key.kind, key.pattern)
    const entry = votes.get(id) ?? { kind: key.kind, pattern: key.pattern, labels: new Map() }
    entry.labels.set(p.desc.trim(), (entry.labels.get(p.desc.trim()) ?? 0) + 1)
    votes.set(id, entry)
  }

  const dict = new Map<string, { kind: AliasKind; pattern: string; label: string; hits: number; rivals: number }>()
  for (const [id, e] of votes) {
    const sorted = [...e.labels.entries()].sort((a, b) => b[1] - a[1])
    const [label, hits] = sorted[0]
    dict.set(id, { kind: e.kind, pattern: e.pattern, label, hits, rivals: sorted.length - 1 })
  }
  return dict
}

/** Volná shoda popisků — "Sk slavia" a "SK Slavia Praha - fotbal a.s." je totéž. */
function sameLabel(a: string, b: string): boolean {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na || !nb) return false
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  const wa = new Set(na.split(' ').filter(w => w.length >= 4))
  const wb = na === nb ? wa : new Set(nb.split(' ').filter(w => w.length >= 4))
  for (const w of wa) if (wb.has(w)) return true
  return false
}

async function main() {
  const expenses = pairs.filter(p => p.amount < 0 && p.desc?.trim()).sort((a, b) => a.date.localeCompare(b.date))
  const cut = Math.floor(expenses.length * 0.7)
  const train = expenses.slice(0, cut)
  const test = expenses.slice(cut)
  console.log(`výdajů s popiskem: ${expenses.length}`)
  console.log(`  učeno z:  ${train.length} (${train[0]?.date} – ${train.at(-1)?.date})`)
  console.log(`  měřeno na: ${test.length} (${test[0]?.date} – ${test.at(-1)?.date})`)

  const dict = learn(train)
  console.log(`\nslovník z trénovací části: ${dict.size} položek`)

  let known = 0
  let hit = 0
  let miss = 0
  let unknown = 0
  let unlabelled = 0
  let rescued = 0
  const wrong: string[] = []
  for (const p of test) {
    // Od června Jan přestal popisky psát a vlepoval do deníku surový text z
    // banky. Takové řádky nejsou lidský popisek, takže se proti nim nedá měřit —
    // a jsou samy o sobě dokladem, že tuhle práci nikdo dělat nechce.
    if (/^\s*n[aá]kup:/i.test(p.desc)) {
      unlabelled++
      const k = aliasKey(asTransaction(p))
      if (k && dict.get(aliasMapKey(k.kind, k.pattern))) rescued++
      continue
    }
    const key = aliasKey(asTransaction(p))
    const found = key ? dict.get(aliasMapKey(key.kind, key.pattern)) : undefined
    if (!found) {
      unknown++
      continue
    }
    known++
    if (sameLabel(found.label, p.desc)) hit++
    else {
      miss++
      if (wrong.length < 8) wrong.push(`  ${p.date} ${Math.abs(p.amount).toFixed(0).padStart(7)} Kč  slovník: "${found.label}"  deník: "${p.desc}"`)
    }
  }

  const scored = known + unknown
  console.log(`\n--- na neviděných platbách:`)
  console.log(`  vzdané řádky (vlepený text z banky): ${unlabelled}`)
  console.log(`    → z nich slovník pojmenuje: ${rescued}  (${unlabelled ? ((rescued/unlabelled)*100).toFixed(0) : 0} %)`)
  console.log(`  hodnoceno: ${scored}`)
  console.log(`    slovník protistranu poznal: ${known}  (${scored ? ((known / scored) * 100).toFixed(0) : 0} %)`)
  console.log(`      z toho popisek souhlasí:  ${hit}  (${known ? ((hit / known) * 100).toFixed(0) : 0} %)`)
  console.log(`      z toho jiný popisek:      ${miss}`)
  console.log(`    protistranu ještě nezná:    ${unknown}`)

  if (wrong.length) {
    console.log(`\n--- kde se popisek liší:`)
    wrong.forEach(w => console.log(w))
  }

  if (!shouldWrite) {
    console.log(`\n(zápis do DB přeskočen — spusť s --write)`)
    return
  }

  // Do DB jde slovník naučený ze VŠECH řádků, ne jen z trénovací části.
  const full = learn(expenses)
  const rows: (CounterpartyAlias & { hits: number; source: string })[] = [...full.values()].map(e => ({
    kind: e.kind,
    pattern: e.pattern,
    label: e.label,
    supplier_name: null,
    hits: e.hits,
    source: 'diary',
  }))

  const db = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // ignoreDuplicates: ruční opravy mají přednost, import je nesmí přebít.
  const { error } = await db
    .from('counterparty_aliases')
    .upsert(rows, { onConflict: 'kind,pattern', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  console.log(`\nzapsáno do counterparty_aliases: ${rows.length} položek`)
}

main()
