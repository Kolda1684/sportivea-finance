import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/auth-helpers'
import { dateToMonth } from '@/lib/utils'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('tasks')
    .select(`*, comments:task_comments(id, content, author_name, created_at), attachments:task_attachments(id, file_name, file_url, file_size, created_at)`)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin && data.assignee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Připoj profil assignee
  let assignee = null
  if (data.assignee_id) {
    const { data: profile } = await admin.from('profiles').select('id, name').eq('id', data.assignee_id).single()
    assignee = profile
  }

  return NextResponse.json({ ...data, assignee })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const userIsAdmin = await isAdmin(user.id)

  const { data: existing } = await admin
    .from('tasks')
    .select('assignee_id, variable_cost_id, hours, minutes')
    .eq('id', params.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!userIsAdmin && existing.assignee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (userIsAdmin) {
    const fields = ['title', 'description', 'deadline', 'status', 'client', 'company_id',
      'hours', 'minutes', 'reward', 'one_time_reward', 'task_type', 'month', 'assignee_id']
    for (const f of fields) {
      if (f in body) allowed[f] = body[f]
    }
    if ('deadline' in body && body.deadline && !body.month) {
      allowed['month'] = dateToMonth(new Date(body.deadline))
    }
  } else {
    // Editor může editovat vlastní task — vše kromě odměny a assignee
    const editorFields = ['title', 'description', 'deadline', 'status', 'client', 'company_id', 'hours', 'minutes', 'task_type']
    for (const f of editorFields) {
      if (f in body) allowed[f] = body[f]
    }
    if ('deadline' in body && body.deadline) {
      allowed['month'] = dateToMonth(new Date(body.deadline))
    }
  }

  // Auto-výpočet odměny z hodinové sazby (pokud admin reward explicitně nenastavil)
  const touchesTime = 'hours' in allowed || 'minutes' in allowed || 'assignee_id' in allowed
  const rewardExplicit = 'reward' in body
  if (touchesTime && !rewardExplicit) {
    const effectiveAssignee = ('assignee_id' in allowed ? allowed['assignee_id'] : existing.assignee_id) as string | null
    if (effectiveAssignee) {
      const newHours = ('hours' in allowed ? Number(allowed['hours']) : (existing.hours ?? 0))
      const newMinutes = ('minutes' in allowed ? Number(allowed['minutes']) : (existing.minutes ?? 0))
      const { data: p } = await admin.from('profiles').select('hourly_rate').eq('id', effectiveAssignee).single()
      if (p?.hourly_rate) {
        allowed['reward'] = Math.round(p.hourly_rate * (newHours + newMinutes / 60))
      }
    }
  }

  const { data, error } = await admin
    .from('tasks')
    .update(allowed)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-sync do variable_costs při dokončení
  if (allowed['status'] === 'hotovo' && !existing.variable_cost_id) {
    await syncTaskToVariableCost(params.id, admin)
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
  const { error } = await admin.from('tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

async function syncTaskToVariableCost(taskId: string, admin: ReturnType<typeof createAdminSupabaseClient>) {
  const { data: task } = await admin.from('tasks').select('*').eq('id', taskId).single()
  if (!task) return

  let memberName: string | null = null
  if (task.assignee_id) {
    const { data: profile } = await admin.from('profiles').select('name').eq('id', task.assignee_id).single()
    memberName = profile?.name ?? null
  }

  const totalHours = (task.hours ?? 0) + (task.minutes ?? 0) / 60
  const totalPrice = (task.reward ?? 0) + (task.one_time_reward ?? 0)

  const { data: vc } = await admin
    .from('variable_costs')
    .insert({
      team_member: memberName,
      client: task.client ?? null,
      hours: totalHours,
      price: totalPrice,
      task_type: task.task_type ?? null,
      date: task.deadline ?? new Date().toISOString().split('T')[0],
      task_name: task.title,
      month: task.month,
      task_id: task.id,
    })
    .select()
    .single()

  if (vc) {
    await admin.from('tasks').update({ variable_cost_id: vc.id }).eq('id', taskId)
  }
}
