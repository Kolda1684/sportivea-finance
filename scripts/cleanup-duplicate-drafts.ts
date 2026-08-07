/**
 * Smaže duplicitní rozpracované faktury.
 *
 *   npx tsx scripts/cleanup-duplicate-drafts.ts          # jen ukáže
 *   npx tsx scripts/cleanup-duplicate-drafts.ts --write
 *
 * Vzniklo tím, že extrakce zakládala draft i u faktury, kterou už systém znal.
 * Příčina je opravená; tohle uklidí, co se mezitím nasbíralo.
 *
 * Maže se jen tehdy, když ve skupině zůstane jiný záznam téže faktury, a nikdy
 * se nemaže něco, co je zapsané ve Fakturoidu — účetnictví se odsud nesahá.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizeSupplier, normalizeDocNumber } from '../src/lib/invoice-review'

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url))
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)

const write = process.argv.includes('--write')

async function main() {
  const db = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data } = await db
    .from('expense_invoices')
    .select('id, supplier_name, note, amount, date, review_status, fakturoid_id, created_at')
    .limit(1000)

  const groups = new Map<string, typeof rows>()
  const rows = (data ?? []) as {
    id: string
    supplier_name: string | null
    note: string | null
    amount: number | null
    date: string | null
    review_status: string
    fakturoid_id: string | number | null
    created_at: string
  }[]

  for (const r of rows) {
    const doc = normalizeDocNumber(r.note)
    if (!doc) continue
    const key = `${normalizeSupplier(r.supplier_name)}|${doc}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }

  const toDelete: typeof rows = []
  for (const [key, group] of groups) {
    if (group.length < 2) continue

    // Necháváme to, co je ve Fakturoidu; jinak nejstarší záznam.
    const keep =
      group.find(r => r.fakturoid_id) ??
      [...group].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!

    for (const r of group) {
      if (r.id === keep.id) continue
      if (r.fakturoid_id) {
        console.log(`  ! ${key}: ${r.id} je ve Fakturoidu (${r.fakturoid_id}) — nechávám, vyřeš ručně`)
        continue
      }
      if (r.review_status === 'approved') {
        console.log(`  ! ${key}: ${r.id} je schválený bez fakturoid_id — nechávám`)
        continue
      }
      toDelete.push(r)
    }
    console.log(
      `  ${key}: ponechán ${keep.id} (${keep.review_status}${keep.fakturoid_id ? '/Fakturoid' : ''})`
    )
  }

  console.log(`\nke smazání: ${toDelete.length} rozpracovaných duplicit`)
  for (const r of toDelete) {
    console.log(`  ${r.date} ${String(r.amount).padStart(9)} ${r.supplier_name} — doklad ${r.note}`)
  }

  if (!write) {
    console.log('\n(nic nesmazáno — spusť s --write)')
    return
  }
  if (!toDelete.length) return

  const { error } = await db.from('expense_invoices').delete().in('id', toDelete.map(r => r.id))
  if (error) throw new Error(error.message)
  console.log(`\nsmazáno: ${toDelete.length}`)
}

main()
