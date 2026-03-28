import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, dateToMonth } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const client = searchParams.get('client')
  const status = searchParams.get('status')
  const supabase = createAdminSupabaseClient()

  let query = supabase.from('income').select('*').order('created_at', { ascending: false })
  if (month) query = query.eq('month', month)
  if (client) query = query.eq('client', client)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from('income')
    .insert({
      client: body.client,
      project_name: body.project_name,
      amount: body.amount ?? null,
      currency: body.currency ?? 'CZK',
      date: body.date ?? null,
      status: body.status ?? 'cekame',
      note: body.note ?? null,
      month: body.month ?? (body.date ? dateToMonth(new Date(body.date)) : getCurrentMonth()),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
