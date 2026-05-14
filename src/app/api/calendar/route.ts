import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = admin
    .from('calendar_events')
    .select(`
      *,
      assignees:calendar_event_assignees(user_id, profile:profiles!calendar_event_assignees_user_id_fkey(id, name, email))
    `)
    .order('start_date', { ascending: true })

  if (from) query = query.gte('start_date', from)
  if (to) query = query.lte('start_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const admin = createAdminSupabaseClient()

  const { data: event, error } = await admin
    .from('calendar_events')
    .insert({
      title: body.title,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      client: body.client ?? null,
      company_id: body.company_id ?? null,
      status: body.status ?? 'planovano',
      location: body.location ?? null,
      description: body.description ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Přidej assignees
  if (body.assignee_ids?.length > 0) {
    await admin.from('calendar_event_assignees').insert(
      body.assignee_ids.map((uid: string) => ({ event_id: event.id, user_id: uid }))
    )
  }

  return NextResponse.json(event, { status: 201 })
}
