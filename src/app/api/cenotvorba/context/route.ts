import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('context_documents')
    .select('id, name, content, file_type, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const { name, content, file_type } = await request.json() as {
    name: string
    content: string
    file_type?: string
  }

  if (!name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'Chybí název nebo obsah' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('context_documents')
    .insert({ name: name.trim(), content: content.trim(), file_type: file_type ?? 'text' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json() as { id: string }

  const supabase = createAdminSupabaseClient()
  const { error } = await supabase
    .from('context_documents')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
