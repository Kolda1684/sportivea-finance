import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import {
  ROLE_COOKIE_NAME,
  ROLE_COOKIE_TTL_SECONDS,
  signRoleCookie,
  verifyRoleCookie,
} from '@/lib/role-cache'
import { verifySupabaseToken } from '@/lib/jwt-verify'

const PUBLIC_ROUTES = ['/login']
const PUBLIC_API_ROUTES = ['/api/auth/login', '/api/auth/logout', '/api/notion/webhook']
const INTERNAL_CRON_API_ROUTES = [
  '/api/invoices/sync',
  '/api/expense-invoices/sync',
  '/api/expense-invoices/mark-overdue-paid',
  '/api/banking/sync',
  '/api/banking/match',
]

// Co smí volat CFO agent (Telegram bot) pod hlavičkou x-agent-secret.
// Záměrně užší než admin session a vázané na metodu — samotný prefix
// '/api/invoices' by jinak pustil i cron sync. Vlastní tajemství, ne
// CRON_SECRET: jiný rozsah práv, jiná rotace.
const AGENT_API_RULES: { prefix: string; methods: string[] }[] = [
  { prefix: '/api/invoices/extract', methods: ['POST'] },
  { prefix: '/api/invoices/drafts', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  { prefix: '/api/chat', methods: ['POST'] },
  { prefix: '/api/income', methods: ['GET'] },
  { prefix: '/api/costs', methods: ['GET'] },
  { prefix: '/api/banking/transactions', methods: ['GET'] },
  { prefix: '/api/invoices', methods: ['GET'] },
  { prefix: '/api/expense-invoices', methods: ['GET'] },
]

// Tyto routes jsou pouze pro adminy
const ADMIN_ONLY_ROUTES = [
  '/dashboard',
  '/ziskovost',
  '/income',
  '/costs',
  '/invoices',
  '/cashflow',
  '/prehled',
  '/crm',
  '/nastaveni',
  '/projekty',
]

// Tyto API routes jsou pouze pro adminy
const ADMIN_ONLY_API_PREFIXES = [
  '/api/dashboard',
  '/api/income',
  '/api/costs',
  '/api/invoices',
  '/api/banking',
  '/api/prehled',
  '/api/cashflow',
  '/api/crm',
  '/api/admin',
  '/api/sheets',
  '/api/cron',
  '/api/expense-invoices',
  '/api/settings',
  '/api/notion',
  '/api/projects',
]

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

function isPublicApiRoute(pathname: string) {
  return PUBLIC_API_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
}

function isAdminOnlyRoute(pathname: string) {
  return ADMIN_ONLY_ROUTES.some(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  )
}

function isAdminOnlyApiRoute(pathname: string) {
  return ADMIN_ONLY_API_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

function isAuthorizedSheetsWebhookRequest(request: NextRequest) {
  const secret = process.env.SHEETS_WEBHOOK_SECRET
  return Boolean(secret && request.headers.get('x-webhook-secret') === secret)
}

function isAuthorizedInternalCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('x-internal-secret') === secret)
}

function isAuthorizedAgentRequest(request: NextRequest, pathname: string) {
  const secret = process.env.AGENT_API_SECRET
  if (!secret || request.headers.get('x-agent-secret') !== secret) return false
  return AGENT_API_RULES.some(rule =>
    (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) &&
    rule.methods.includes(request.method)
  )
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname === '/api/cron/sync' || pathname === '/api/cron/notion') {
    if (isAuthorizedCronRequest(request)) return NextResponse.next()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (pathname === '/api/sheets/webhook') {
    if (request.method === 'GET' || isAuthorizedSheetsWebhookRequest(request)) return NextResponse.next()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (INTERNAL_CRON_API_ROUTES.includes(pathname) && isAuthorizedInternalCronRequest(request)) {
    return NextResponse.next()
  }

  if (isAuthorizedAgentRequest(request, pathname)) {
    return NextResponse.next()
  }

  if (isPublicRoute(pathname) || isPublicApiRoute(pathname)) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // 1) Rychlá cesta: lokální ověření access tokenu (podpis + expirace přes JWKS,
  //    žádný network call). getSession() jen parsuje cookie.
  const { data: { session } } = await supabase.auth.getSession()
  let userId: string | null = null
  if (session?.access_token) {
    const verified = await verifySupabaseToken(session.access_token)
    if (verified) userId = verified.userId
  }

  // 2) Fallback: expirovaný/neplatný token → getUser() (síťové ověření + refresh
  //    tokenů; nové cookies se zapíšou přes setAll výše).
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  }

  if (!userId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role + jméno: nejprve podepsaná cache cookie (HMAC, TTL 60 s) — ušetří DB query.
  // Při miss/expire dotaz a refresh cookie.
  const cached = await verifyRoleCookie(request.cookies.get(ROLE_COOKIE_NAME)?.value, userId)
  let role: string
  let userName: string
  if (cached) {
    role = cached.role
    userName = cached.name
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', userId)
      .single()
    role = profile?.role ?? 'editor'
    userName = profile?.name ?? ''
    response.cookies.set(ROLE_COOKIE_NAME, await signRoleCookie(userId, role, userName), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ROLE_COOKIE_TTL_SECONDS,
      path: '/',
    })
  }

  // Identita pro server komponenty (layout) — ušetří getUser + profiles query per render.
  // Hodnoty URI-encoded (hlavičky musí být ASCII).
  request.headers.set('x-user-id', userId)
  request.headers.set('x-user-role', role)
  request.headers.set('x-user-name', encodeURIComponent(userName))
  const withHeaders = NextResponse.next({ request })
  // Přenes cookies nastavené dříve (role cache / token refresh) na novou response
  for (const c of response.cookies.getAll()) withHeaders.cookies.set(c)

  // Root přesměrování — admin jde na dashboard, editor na tasky
  if (pathname === '/') {
    return NextResponse.redirect(new URL(role === 'admin' ? '/dashboard' : '/no-access', request.url))
  }

  // Zkontroluj roli pro admin-only routes
  if (isAdminOnlyRoute(pathname) || isAdminOnlyApiRoute(pathname)) {

    if (role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/no-access', request.url))
    }
  }

  return withHeaders
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
