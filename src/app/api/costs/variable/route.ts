import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, dateToMonth } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const member = searchParams.get('member')
  const client = searchParams.get('client')
  const supabase = createAdminSupabaseClient()

  let query = supabase.from('variable_costs').select('*').order('date', { ascending: false })
  if (month) query = query.eq('month', month)
  if (member) query = query.eq('team_member', member)
  if (client) query = query.eq('client', client)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from('variable_costs')
    .insert({
      team_member: body.team_member ?? null,
      client: body.client ?? null,
      hours: body.hours ?? null,
      price: body.price ?? null,
      task_type: body.task_type ?? null,
      date: body.date ?? null,
      task_name: body.task_name ?? null,
      month: body.month ?? (body.date ? dateToMonth(new Date(body.date)) : getCurrentMonth()),
      external_id: body.external_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
