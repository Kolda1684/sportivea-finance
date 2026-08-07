/** Ověří, že migrace 032 v databázi opravdu je. */
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

  const aliases = await db.from('counterparty_aliases').select('*', { count: 'exact', head: true })
  console.log(aliases.error ? `counterparty_aliases: CHYBÍ (${aliases.error.message})` : `counterparty_aliases: OK, ${aliases.count} řádků`)

  const cols = await db.from('bank_transactions').select('diary_label,diary_label_source').limit(1)
  console.log(cols.error ? `diary_label na bank_transactions: CHYBÍ (${cols.error.message})` : 'diary_label na bank_transactions: OK')
}

main()
