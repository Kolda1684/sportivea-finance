import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const VALID_CURRENCIES = ['CZK', 'EUR', 'USD', 'GBP', 'PLN', 'CHF']

function normalizeCurrency(input: unknown): string {
  const v = String(input ?? '').trim().toUpperCase()
  return VALID_CURRENCIES.includes(v) ? v : 'CZK'
}

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Název účtu je povinný' }, { status: 400 })

  // Najdi nejvyšší sort_order, ať nový účet skončí na konci
  const { data: maxRow } = await supabase
    .from('bank_accounts')
    .select('sort_order')
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (maxRow?.sort_order ?? 0) + 1

  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      name,
      account_number: body.account_number?.trim() || null,
      starting_balance: Number(body.starting_balance ?? 0),
      currency: normalizeCurrency(body.currency),
      sort_order: nextOrder,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'Chybí ID účtu' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if ('starting_balance' in body) updates.starting_balance = Number(body.starting_balance ?? 0)
  if ('name' in body) {
    const n = String(body.name ?? '').trim()
    if (!n) return NextResponse.json({ error: 'Název nemůže být prázdný' }, { status: 400 })
    updates.name = n
  }
  if ('account_number' in body) updates.account_number = body.account_number?.trim() || null
  if ('currency' in body) updates.currency = normalizeCurrency(body.currency)
  if ('sort_order' in body) updates.sort_order = Number(body.sort_order)

  const { error } = await supabase.from('bank_accounts').update(updates).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Chybí ID účtu' }, { status: 400 })

  // Bezpečnost: pokud má účet transakce, neutíkat tiše
  const { count } = await supabase
    .from('bank_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Účet má ${count} transakcí. Před smazáním je nejprve přesuň nebo smaž.`,
    }, { status: 409 })
  }

  const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
