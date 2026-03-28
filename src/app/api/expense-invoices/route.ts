import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('expense_invoices')
    .select('*')
    .order('date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('expense_invoices')
    .insert({
      supplier_name: body.supplier_name || null,
      amount: body.amount ? parseFloat(body.amount) : null,
      amount_czk: body.amount_czk ? parseFloat(body.amount_czk) : body.amount ? parseFloat(body.amount) : null,
      currency: body.currency || 'CZK',
      date: body.date || null,
      due_date: body.due_date || null,
      variable_symbol: body.variable_symbol || null,
      status: body.status || 'unpaid',
      note: body.note || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
