import { createAdminSupabaseClient, createServerSupabaseClient } from './supabase-server'

export type UserRole = 'admin' | 'editor'

export interface UserProfile {
  id: string
  name: string
  email: string | null
  role: UserRole
}

// Rychlejší alternativa k getUser() — čte session z cookie bez network callu.
// Bezpečné použití v route handlerech: middleware už session ověřil přes getUser().
export async function getSessionUser() {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export async function getCurrentUser() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminSupabaseClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  return profile as UserProfile
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('profiles')
    .select('id, name, email, role')
    .eq('id', userId)
    .single()
  return data as UserProfile | null
}

export async function getAllProfiles(): Promise<UserProfile[]> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('profiles')
    .select('id, name, email, role')
    .order('name')
  return (data ?? []) as UserProfile[]
}

export async function isAdmin(userId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return data?.role === 'admin'
}

export async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) return null
  const admin = await isAdmin(user.id)
  if (!admin) return null
  return user
}
