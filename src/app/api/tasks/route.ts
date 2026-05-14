import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/auth-helpers'
import { dateToMonth } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const assigneeId = searchParams.get('assignee_id')
  const status = searchParams.get('status')

  const userIsAdmin = await isAdmin(user.id)

  let query = admin
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id, name, email, role)')
    .order('deadline', { ascending: true, nullsFirst: false })

  // Editor vidí jen své tasky
  if (!userIsAdmin) {
    query = query.eq('assignee_id', user.id)
  } else if (assigneeId) {
    query = query.eq('assignee_id', assigneeId)
  }

  if (month) query = query.eq('month', month)
  if (status) query = query.eq('status', status)

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

  const deadline = body.deadline ?? null
  const month = body.month ?? (deadline ? dateToMonth(new Date(deadline)) : null)

  const { data, error } = await admin
    .from('tasks')
    .insert({
      title: body.title,
      description: body.description ?? null,
      deadline,
      status: body.status ?? 'zadano',
      client: body.client ?? null,
      company_id: body.company_id ?? null,
      hours: body.hours ?? 0,
      minutes: body.minutes ?? 0,
      reward: body.reward ?? null,
      one_time_reward: body.one_time_reward ?? null,
      task_type: body.task_type ?? null,
      month,
      assignee_id: body.assignee_id ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
