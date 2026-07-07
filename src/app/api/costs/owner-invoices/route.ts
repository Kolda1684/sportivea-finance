import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth } from '@/lib/utils'

// Ruční faktury majitelů — kdo / za co / klient / kolik. Přičítají se do platů.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const supabase = createAdminSupabaseClient()

  let query = supabase.from('owner_invoices').select('*').order('created_at', { ascending: false })
  if (month) query = query.eq('month', month)
  else if (year) query = query.like('month', `%,${year}`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  if (!body.owner_name) {
    return NextResponse.json({ error: 'owner_name je povinné' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('owner_invoices')
    .insert({
      owner_name: body.owner_name,
      description: body.description ?? null,
      client: body.client ?? null,
      amount: body.amount ?? 0,
      month: body.month ?? getCurrentMonth(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from('owner_invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
