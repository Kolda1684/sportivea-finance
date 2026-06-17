import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('notion_employee_databases')
    .select('*')
    .order('team_member')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const team_member = String(body.team_member ?? '').trim()
  const notion_database_id = String(body.notion_database_id ?? '').trim().replace(/-/g, '')
  if (!team_member) return NextResponse.json({ error: 'Jméno zaměstnance je povinné' }, { status: 400 })
  if (!notion_database_id) return NextResponse.json({ error: 'Notion DB ID je povinné' }, { status: 400 })
  if (notion_database_id.length !== 32) {
    return NextResponse.json({ error: 'DB ID musí být 32 znaků (z URL Notion stránky)' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('notion_employee_databases')
    .insert({
      team_member,
      notion_database_id,
      notes: body.notes?.trim() || null,
      active: body.active ?? true,
    })
    .select()
    .single()
  if (error) {
    const msg = error.message.includes('unique')
      ? 'Tento zaměstnanec nebo DB ID už je v seznamu'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'Chybí ID' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('team_member' in body) updates.team_member = String(body.team_member ?? '').trim()
  if ('notion_database_id' in body) {
    const id = String(body.notion_database_id ?? '').trim().replace(/-/g, '')
    if (id.length !== 32) return NextResponse.json({ error: 'DB ID musí být 32 znaků' }, { status: 400 })
    updates.notion_database_id = id
  }
  if ('notes' in body) updates.notes = body.notes?.trim() || null
  if ('active' in body) updates.active = Boolean(body.active)

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from('notion_employee_databases').update(updates).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Chybí ID' }, { status: 400 })
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from('notion_employee_databases').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
