import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { key, value } = body as { key: string; value: string }

  if (!key || !value) return NextResponse.json({ error: 'Chybí key nebo value' }, { status: 400 })

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.rpc('set_encrypted_setting', {
    setting_key: key,
    setting_value: value,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
