/**
 * Doplní popisek do deníku ke všem transakcím, které ho ještě nemají.
 *
 *   npx tsx scripts/apply-diary-labels.ts          # jen ukáže, co by udělal
 *   npx tsx scripts/apply-diary-labels.ts --write
 *
 * Ruční popisky (diary_label_source = 'manual') se nikdy nepřepisují — slovník
 * se od nich naopak učí.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { resolveCounterparty, toAliasMap, type CounterpartyAlias } from '../src/lib/counterparty'

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url))
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)

const shouldWrite = process.argv.includes('--write')

async function main() {
  const db = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: aliasRows, error: aliasErr } = await db
    .from('counterparty_aliases')
    .select('kind,pattern,label,supplier_name')
  if (aliasErr) throw new Error(aliasErr.message)
  const aliases = toAliasMap((aliasRows ?? []) as CounterpartyAlias[])
  console.log(`slovník: ${aliases.size} položek`)

  const { data: tx, error: txErr } = await db
    .from('bank_transactions')
    .select('id,date,amount,message,counterparty_name,counterparty_account,diary_label,diary_label_source')
    .limit(1000)
  if (txErr) throw new Error(txErr.message)

  const updates: { id: string; diary_label: string; diary_label_source: string }[] = []
  let skippedManual = 0
  let unresolved = 0
  const preview: string[] = []

  for (const t of tx ?? []) {
    if (t.diary_label_source === 'manual') {
      skippedManual++
      continue
    }
    const r = resolveCounterparty(t, aliases)
    if (!r.label) {
      unresolved++
      continue
    }
    if (t.diary_label === r.label) continue
    updates.push({ id: t.id, diary_label: r.label, diary_label_source: 'alias' })
    if (preview.length < 10) {
      preview.push(`  ${t.date} ${Math.abs(Number(t.amount)).toFixed(0).padStart(8)} Kč  →  ${r.label}   [${r.via}]`)
    }
  }

  console.log(`transakcí: ${(tx ?? []).length}`)
  console.log(`  doplní se popisek:      ${updates.length}`)
  console.log(`  slovník zatím nepozná:  ${unresolved}`)
  console.log(`  ruční popisek, nesahám: ${skippedManual}`)
  console.log(`\nukázka:`)
  preview.forEach(p => console.log(p))

  if (!shouldWrite) {
    console.log(`\n(zápis přeskočen — spusť s --write)`)
    return
  }

  // Po dávkách: jeden upsert s tisícem řádků Supabase odmítne.
  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100)
    const { error } = await db.from('bank_transactions').upsert(batch, { onConflict: 'id' })
    if (error) throw new Error(error.message)
  }
  console.log(`\nzapsáno: ${updates.length} popisků`)
}

main()
