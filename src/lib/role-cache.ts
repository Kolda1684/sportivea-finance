// HMAC-signed role cookie — short-TTL middleware cache.
// Removes per-request profiles.role lookup. Edge-runtime safe (Web Crypto + atob/btoa).

const COOKIE_NAME = 'sportivea_role_cache'
const TTL_MS = 60_000

function getSecret(): string {
  const secret = process.env.ROLE_CACHE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('ROLE_CACHE_SECRET or SUPABASE_SERVICE_ROLE_KEY required')
  return secret
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToString(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  return atob(padded)
}

function stringToBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return bytesToBase64Url(new Uint8Array(sig))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface RoleCachePayload {
  userId: string
  role: string
  exp: number
}

export async function signRoleCookie(userId: string, role: string): Promise<string> {
  const payload: RoleCachePayload = { userId, role, exp: Date.now() + TTL_MS }
  const body = stringToBase64Url(JSON.stringify(payload))
  const sig = await hmacSha256(body, getSecret())
  return `${body}.${sig}`
}

export async function verifyRoleCookie(value: string | undefined, userId: string): Promise<string | null> {
  if (!value) return null
  const [body, sig] = value.split('.')
  if (!body || !sig) return null

  let expected: string
  try {
    expected = await hmacSha256(body, getSecret())
  } catch {
    return null
  }
  if (!timingSafeEqual(sig, expected)) return null

  try {
    const payload = JSON.parse(base64UrlToString(body)) as RoleCachePayload
    if (payload.userId !== userId) return null
    if (payload.exp < Date.now()) return null
    return payload.role
  } catch {
    return null
  }
}

export const ROLE_COOKIE_NAME = COOKIE_NAME
export const ROLE_COOKIE_TTL_SECONDS = Math.floor(TTL_MS / 1000)
