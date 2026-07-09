import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/auth-helpers'

// GET bez dynamických parametrů by Next cachoval (i Supabase fetch) → vždy čerstvá data
export const dynamic = 'force-dynamic'

export async function GET() {
  // Session z cookie — token uz overil middleware, zadny network call na auth
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', user.id)
    .single()

  return NextResponse.json(profile ?? { id: user.id, name: '', email: user.email, role: 'editor' })
}
