import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const { name, account_number, starting_balance } = await req.json()
  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({ name, account_number: account_number ?? null, starting_balance: starting_balance ?? 0 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const { id, starting_balance, name, account_number } = await req.json()
  const { error } = await supabase
    .from('bank_accounts')
    .update({ starting_balance, name, account_number })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const { id } = await req.json()
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
