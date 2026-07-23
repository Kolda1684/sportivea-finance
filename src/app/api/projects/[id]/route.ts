import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabaseClient()
  const body = await req.json()

  const update: Record<string, unknown> = {}
  if ('name' in body) update.name = String(body.name).trim()
  if ('client' in body) update.client = body.client ? String(body.client).trim() : null
  if ('keywords' in body) update.keywords = String(body.keywords).trim()
  if ('date_from' in body) update.date_from = body.date_from || null
  if ('date_to' in body) update.date_to = body.date_to || null
  if ('active' in body) update.active = Boolean(body.active)

  const { data, error } = await supabase
    .from('projects')
    .update(update)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.from('projects').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
