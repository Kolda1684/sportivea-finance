import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const month = req.nextUrl.searchParams.get('month')
  const year = req.nextUrl.searchParams.get('year')

  let query = supabase
    .from('owner_salaries')
    .select('*')
    .order('month', { ascending: false })
    .order('owner_name', { ascending: true })

  if (month) {
    query = query.eq('month', month)
  } else if (year) {
    query = query.like('month', `%,${year}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  if (!body.owner_name || !body.month) {
    return NextResponse.json({ error: 'owner_name and month are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('owner_salaries')
    .upsert({
      owner_name: body.owner_name,
      amount: body.amount ?? 0,
      month: body.month,
      paid_on: body.paid_on ?? null,
      bank_transaction_id: body.bank_transaction_id ?? null,
      note: body.note ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_name,month' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
