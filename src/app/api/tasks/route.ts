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
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })

  if (!userIsAdmin) {
    // Editor vidí jen své tasky
    query = query.eq('assignee_id', user.id)
  } else if (assigneeId) {
    query = query.eq('assignee_id', assigneeId)
  }

  if (month) query = query.eq('month', month)
  if (status) query = query.eq('status', status)

  const { data: tasks, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ručně připojit profily (Supabase FK join přes auth.users nefunguje přímo)
  const assigneeIds = Array.from(new Set((tasks ?? []).map((t: { assignee_id: string | null }) => t.assignee_id).filter(Boolean)))
  let profileMap: Record<string, { id: string; name: string }> = {}
  if (assigneeIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name')
      .in('id', assigneeIds as string[])
    profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  }

  const result = (tasks ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    assignee: t.assignee_id ? (profileMap[t.assignee_id as string] ?? null) : null,
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const admin = createAdminSupabaseClient()
  const userIsAdmin = await isAdmin(user.id)

  const deadline = body.deadline ?? null
  const month = body.month ?? (deadline ? dateToMonth(new Date(deadline)) : null)

  // Editor může vytvořit task jen sobě, admin komukoliv
  const assigneeId = userIsAdmin
    ? (body.assignee_id ?? user.id)
    : user.id

  const insertData: Record<string, unknown> = {
    title: body.title,
    description: body.description ?? null,
    deadline,
    status: body.status ?? 'zadano',
    client: body.client ?? null,
    company_id: body.company_id ?? null,
    hours: body.hours ?? 0,
    minutes: body.minutes ?? 0,
    task_type: body.task_type ?? null,
    month,
    assignee_id: assigneeId,
    created_by: user.id,
  }

  // Odměnu může nastavit jen admin
  if (userIsAdmin) {
    insertData.reward = body.reward ?? null
    insertData.one_time_reward = body.one_time_reward ?? null
  }

  const { data, error } = await admin
    .from('tasks')
    .insert(insertData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
