import { createRemoteJWKSet, jwtVerify } from 'jose'

// Lokální ověření Supabase access tokenu (ES256) proti JWKS.
// JWKS klíče se cachují na úrovni modulu — žádný network call per request
// (jen první request po cold startu stáhne klíče).
const jwks = createRemoteJWKSet(
  new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  { cacheMaxAge: 10 * 60 * 1000 }
)

export async function verifySupabaseToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
    })
    // jwtVerify kontroluje podpis i exp
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    return { userId: payload.sub }
  } catch {
    return null
  }
}
