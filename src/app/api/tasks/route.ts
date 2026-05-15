import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/auth-helpers'
import { dateToMonth } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const assigneeId = searchParams.get('assignee_id')
  const status = searchParams.get('status')

  // Paralelně: role check + všechny profily (malá tabulka)
  const [{ data: roleData }, { data: profilesData }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).single(),
    admin.from('profiles').select('id, name'),
  ])
  const userIsAdmin = roleData?.role === 'admin'

  let query = admin
    .from('tasks')
    .select('*')
    .order('deadline', { ascending: true, nullsFirst: false })

  if (!userIsAdmin) {
    query = query.eq('assignee_id', user.id)
  } else if (assigneeId) {
    query = query.eq('assignee_id', assigneeId)
  }

  if (month) query = query.eq('month', month)
  if (status) query = query.eq('status', status)

  const { data: tasks, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const profileMap: Record<string, { id: string; name: string }> = Object.fromEntries(
    (profilesData ?? []).map(p => [p.id, p])
  )

  const result = (tasks ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    assignee: t.assignee_id ? (profileMap[t.assignee_id as string] ?? null) : null,
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [body, { data: roleData }] = await Promise.all([
    req.json(),
    createAdminSupabaseClient().from('profiles').select('role').eq('id', user.id).single(),
  ])

  const admin = createAdminSupabaseClient()
  const userIsAdmin = roleData?.role === 'admin'
  const deadline = body.deadline ?? null
  const month = body.month ?? (deadline ? dateToMonth(new Date(deadline)) : null)
  const assigneeId = userIsAdmin ? (body.assignee_id ?? user.id) : user.id

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
