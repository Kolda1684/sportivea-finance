import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdmin } from '@/lib/auth-helpers'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const userIsAdmin = await isAdmin(user.id)

  // Ověř přístup k tasku
  const { data: task } = await admin.from('tasks').select('assignee_id').eq('id', params.id).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!userIsAdmin && task.assignee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: profile } = await admin.from('profiles').select('name').eq('id', user.id).single()

  const body = await req.json()
  const { data, error } = await admin
    .from('task_comments')
    .insert({
      task_id: params.id,
      author_id: user.id,
      author_name: profile?.name ?? 'Neznámý',
      content: body.content,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
