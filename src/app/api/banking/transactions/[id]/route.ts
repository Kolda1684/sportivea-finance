import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  const allowed = ['counterparty_name', 'message', 'note']
  const update: Record<string, string | null> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key] ?? null
  }

  const { error } = await supabase
    .from('bank_transactions')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
