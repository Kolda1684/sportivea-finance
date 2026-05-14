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
    .select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(id, name, email, role),
      comments:task_comments(id, content, author_name, created_at),
      attachments:task_attachments(id, file_name, file_url, file_size, created_at)
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin && data.assignee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const userIsAdmin = await isAdmin(user.id)

  // Ověř přístup k tasku
  const { data: existing } = await admin.from('tasks').select('assignee_id, variable_cost_id').eq('id', params.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!userIsAdmin && existing.assignee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Editor může měnit jen status a hodiny/minuty (ne odměnu, klienta, atd.)
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
    // Editor může jen změnit status a hodiny/minuty
    if ('status' in body) allowed['status'] = body.status
    if ('hours' in body) allowed['hours'] = body.hours
    if ('minutes' in body) allowed['minutes'] = body.minutes
    if ('description' in body) allowed['description'] = body.description
  }

  const { data, error } = await admin
    .from('tasks')
    .update(allowed)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pokud task přešel na hotovo a nemá variable_cost, vytvoř ho automaticky
  if (allowed['status'] === 'hotovo' && !(existing as { variable_cost_id: string | null }).variable_cost_id) {
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
  const { data: task } = await admin
    .from('tasks')
    .select('*, assignee:profiles!tasks_assignee_id_fkey(name)')
    .eq('id', taskId)
    .single()

  if (!task) return

  const totalHours = (task.hours ?? 0) + (task.minutes ?? 0) / 60
  const totalPrice = (task.reward ?? 0) + (task.one_time_reward ?? 0)

  const { data: vc } = await admin
    .from('variable_costs')
    .insert({
      team_member: task.assignee?.name ?? null,
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
