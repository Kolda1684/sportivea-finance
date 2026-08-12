import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Hromadné přiřazení vedlejších nákladů k projektu.
// Body: { ids: string[], project_id: string | null }  (null = zrušit přiřazení)
export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === 'string') : []
  const projectId: string | null = body.project_id ?? null

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Žádné náklady k přiřazení' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('extra_costs')
    .update({ project_id: projectId })
    .in('id', ids)
    .select('id')

  if (error) {
    if (error.message.includes('project_id')) {
      return NextResponse.json(
        { error: 'Chybí sloupec pro projekty — spusť SQL migraci 033 v Supabase.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: (data ?? []).length })
}
