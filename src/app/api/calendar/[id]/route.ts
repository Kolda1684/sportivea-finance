import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/auth-helpers'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const admin = createAdminSupabaseClient()

  const { data, error } = await admin
    .from('calendar_events')
    .update({
      title: body.title,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      client: body.client ?? null,
      status: body.status ?? 'planovano',
      event_type: body.event_type ?? 'jine',
      location: body.location ?? null,
      description: body.description ?? null,
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aktualizuj assignees
  if (body.assignee_ids !== undefined) {
    await admin.from('calendar_event_assignees').delete().eq('event_id', params.id)
    if (body.assignee_ids.length > 0) {
      await admin.from('calendar_event_assignees').insert(
        body.assignee_ids.map((uid: string) => ({ event_id: params.id, user_id: uid }))
      )
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminSupabaseClient()
  const { error } = await admin.from('calendar_events').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
