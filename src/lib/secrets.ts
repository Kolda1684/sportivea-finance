// POUZE pro server components a API routes – nikdy nevolat z klientských komponent
import { createAdminSupabaseClient } from './supabase-server'

export async function getSecret(key: string): Promise<string | null> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('get_decrypted_setting', {
    setting_key: key,
  })
  if (error || !data) return null
  return data as string
}

export async function setSecret(key: string, value: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient()
  const { error } = await supabase.rpc('set_encrypted_setting', {
    setting_key: key,
    setting_value: value,
  })
  return !error
}
