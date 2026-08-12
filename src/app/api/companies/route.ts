import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/auth-helpers'

// GET bez dynamických parametrů by Next cachoval (i Supabase fetch) → vždy čerstvá data
export const dynamic = 'force-dynamic'

// Přístupné všem přihlášeným uživatelům — pro dropdown v taskách
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('companies')
    .select('id, name, status')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stav chodí z Notionu. Bez řazení se mezi aktivní klienty míchají ukončení
  // i nikdy nezačatí — nabídka pak vypadá neaktuálně.
  const rank = (s: string | null) => (s === 'active' ? 0 : s === 'on-hold' ? 1 : s === 'not started' ? 2 : 3)
  const sorted = (data ?? []).sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, 'cs'))

  return NextResponse.json(sorted)
}
