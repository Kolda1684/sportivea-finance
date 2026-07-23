import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { computeProjectStats, type ProjectRow } from '@/lib/project-stats'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    // Tabulka ještě neexistuje — uživatel nespustil migraci 029
    // (42P01 = přímý Postgres kód, PGRST205 = PostgREST schema cache)
    if (error.code === '42P01' || error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
      return NextResponse.json({ needsMigration: true, projects: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const withStats = await Promise.all(
    ((projects ?? []) as ProjectRow[]).map(async p => ({
      ...p,
      ...(await computeProjectStats(supabase, p)),
    }))
  )

  return NextResponse.json({ projects: withStats })
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  if (!body.name || !body.keywords) {
    return NextResponse.json({ error: 'Chybí název nebo klíčová slova' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: String(body.name).trim(),
      client: body.client ? String(body.client).trim() : null,
      keywords: String(body.keywords).trim(),
      date_from: body.date_from || null,
      date_to: body.date_to || null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
