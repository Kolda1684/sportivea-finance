import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const type = searchParams.get('type')

  const limit = parseInt(searchParams.get('limit') ?? '200')
  let query = supabase
    .from('bank_transactions')
    .select('*, invoices(number, subject_name), expense_invoices(supplier_name, variable_symbol, note)')
    .order('date', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') query = query.eq('status', status)
  if (type && type !== 'all') query = query.eq('type', type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  const accountId = String(body.account_id ?? '').trim()
  const date = String(body.date ?? '').trim()
  const amount = Number(body.amount)
  const type = body.type === 'income' ? 'income' : 'expense'

  if (!accountId) return NextResponse.json({ error: 'Chybí account_id' }, { status: 400 })
  if (!date) return NextResponse.json({ error: 'Chybí datum' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Částka musí být kladné číslo' }, { status: 400 })
  }

  const { data: acc } = await supabase
    .from('bank_accounts')
    .select('currency')
    .eq('id', accountId)
    .single()
  if (!acc) return NextResponse.json({ error: 'Účet nenalezen' }, { status: 404 })
  const currency = acc.currency || 'CZK'

  const { data, error } = await supabase
    .from('bank_transactions')
    .insert({
      account_id: accountId,
      date,
      amount,
      amount_czk: currency === 'CZK' ? amount : null,
      currency,
      type,
      status: 'unmatched',
      note: body.note?.trim() || null,
      counterparty_name: body.counterparty_name?.trim() || null,
      message: body.message?.trim() || null,
      variable_symbol: body.variable_symbol?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
