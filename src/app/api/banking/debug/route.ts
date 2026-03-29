import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// GET /api/banking/debug — ukáže nespárované výdaje + dostupné expense faktury pro ladění
export async function GET() {
  const supabase = createAdminSupabaseClient()

  const { data: txs } = await supabase
    .from('bank_transactions')
    .select('id, date, amount, amount_czk, currency, counterparty_name, counterparty_account, variable_symbol, message, type, status')
    .eq('type', 'expense')
    .eq('status', 'unmatched')
    .order('date', { ascending: false })
    .limit(20)

  const { data: invoices } = await supabase
    .from('expense_invoices')
    .select('id, supplier_name, amount, amount_czk, currency, variable_symbol, due_date, status, note')
    .limit(50)

  return NextResponse.json({ unmatched_expenses: txs ?? [], expense_invoices: invoices ?? [] })
}
