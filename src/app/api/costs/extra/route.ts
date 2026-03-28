import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, dateToMonth } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const supabase = createAdminSupabaseClient()

  let query = supabase.from('extra_costs').select('*').order('date', { ascending: false })
  if (month) query = query.eq('month', month)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('extra_costs')
    .insert({
      name: body.name,
      amount: body.amount,
      date: body.date ?? null,
      category: body.category ?? null,
      note: body.note ?? null,
      month: body.month ?? (body.date ? dateToMonth(new Date(body.date)) : getCurrentMonth()),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
