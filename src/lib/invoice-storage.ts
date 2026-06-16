import { createAdminSupabaseClient } from './supabase-server'

const BUCKET = 'invoice-files'

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

export async function uploadInvoiceFile(draftId: string, originalName: string, buffer: Buffer, contentType: string): Promise<string> {
  const supabase = createAdminSupabaseClient()
  const path = `${draftId}/${Date.now()}_${sanitize(originalName)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false })
  if (error) throw new Error(`Storage upload selhal: ${error.message}`)
  return path
}

export async function downloadInvoiceFile(path: string): Promise<{ buffer: Buffer; contentType: string }> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`Storage download selhal: ${error?.message ?? 'no data'}`)
  const arrayBuffer = await data.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), contentType: data.type || 'application/octet-stream' }
}

export async function deleteInvoiceFile(path: string): Promise<void> {
  const supabase = createAdminSupabaseClient()
  await supabase.storage.from(BUCKET).remove([path])
}

export async function signInvoiceUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
