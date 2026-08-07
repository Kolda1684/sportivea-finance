/** Kolik výdajů nemá navázanou fakturu a co to je za platby. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url))
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
)

async function main() {
  const db = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: tx } = await db
    .from('bank_transactions')
    .select('id,amount,date,status,diary_label,matched_invoice_id,matched_expense_invoice_id,is_internal_transfer,is_no_invoice,message')
    .limit(1000)

  const out = (tx ?? []).filter(t => Number(t.amount) < 0)
  const noInvoice = out.filter(t => !t.matched_invoice_id && !t.matched_expense_invoice_id && !t.is_internal_transfer)
  const cards = noInvoice.filter(t => /^\s*n[aá]kup:/i.test(t.message ?? ''))

  console.log(`výdajů celkem: ${out.length}`)
  console.log(`  bez navázané faktury:            ${noInvoice.length}`)
  console.log(`    z toho popisek od slovníku:    ${noInvoice.filter(t => t.diary_label).length}`)
  console.log(`    z toho platby kartou:          ${cards.length}`)
  console.log(`    z toho ručně označené bez f.:  ${noInvoice.filter(t => t.is_no_invoice).length}`)

  const counts: Record<string, number> = {}
  for (const t of noInvoice) if (t.diary_label) counts[t.diary_label] = (counts[t.diary_label] ?? 0) + 1
  console.log(`\nnejčastější mezi nimi:`)
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([k, v]) => console.log(`  ${String(v).padStart(3)}×  ${k}`))
}

main()
