import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/auth-helpers'

// Kombinovaný init endpoint — vrátí me + isAdmin + profiles + companies v jednom requestu
// Snižuje 3 round-tripy na 1, interně 3 paralelní Supabase dotazy
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  const [profileResult, profilesResult, companiesResult] = await Promise.all([
    admin.from('profiles').select('id, name, email, role, hourly_rate').eq('id', user.id).single(),
    admin.from('profiles').select('id, name, email, role, hourly_rate').order('name'),
    admin.from('companies').select('id, name').order('name'),
  ])

  const profile = profileResult.data
  const isAdmin = profile?.role === 'admin'

  const me = profile
    ? { ...profile, email: profile.email ?? user.email }
    : { id: user.id, email: user.email ?? '', name: '', role: 'editor', hourly_rate: null }

  return NextResponse.json({
    me,
    isAdmin,
    profiles: isAdmin ? (profilesResult.data ?? []) : [],
    companies: companiesResult.data ?? [],
  })
}
