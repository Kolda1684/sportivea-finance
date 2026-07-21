import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Přijaté faktury po splatnosti = považujeme za zaplacené (uživatel platí
// vše nejpozději v den splatnosti). Běží denně po párování — spárování
// s transakcí má vždy přednost (doplní přesnou částku z výpisu); tohle
// jen dočistí zbytek, který se nespároval.
export async function POST() {
  const supabase = createAdminSupabaseClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: byDue, error: dueErr } = await supabase
    .from('expense_invoices')
    .update({ status: 'paid' })
    .eq('status', 'unpaid')
    .eq('review_status', 'approved')
    .not('due_date', 'is', null)
    .lte('due_date', today)
    .select('id')

  if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 })

  // Účtenky a doklady bez splatnosti: bereme datum dokladu (platí se hned)
  const { data: byDate, error: dateErr } = await supabase
    .from('expense_invoices')
    .update({ status: 'paid' })
    .eq('status', 'unpaid')
    .eq('review_status', 'approved')
    .is('due_date', null)
    .not('date', 'is', null)
    .lte('date', today)
    .select('id')

  if (dateErr) return NextResponse.json({ error: dateErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    marked_paid: (byDue ?? []).length + (byDate ?? []).length,
    by_due_date: (byDue ?? []).length,
    by_invoice_date: (byDate ?? []).length,
  })
}
