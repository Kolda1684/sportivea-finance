import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import {
  ROLE_COOKIE_NAME,
  ROLE_COOKIE_TTL_SECONDS,
  signRoleCookie,
  verifyRoleCookie,
} from '@/lib/role-cache'

const PUBLIC_ROUTES = ['/login']
const PUBLIC_API_ROUTES = ['/api/auth/login', '/api/auth/logout', '/api/notion/webhook']
const INTERNAL_CRON_API_ROUTES = [
  '/api/invoices/sync',
  '/api/expense-invoices/sync',
  '/api/banking/sync',
  '/api/banking/match',
]

// Tyto routes jsou pouze pro adminy
const ADMIN_ONLY_ROUTES = [
  '/dashboard',
  '/income',
  '/costs',
  '/invoices',
  '/cashflow',
  '/prehled',
  '/crm',
  '/nastaveni',
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
  '/api/notion/sync',
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

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectedFrom', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role: nejprve zkus podepsanou cache cookie (HMAC, TTL 60 s) — ušetří DB query.
  // Při miss/expire dotaz a refresh cookie.
  const cachedRole = await verifyRoleCookie(request.cookies.get(ROLE_COOKIE_NAME)?.value, user.id)
  let role: string
  if (cachedRole) {
    role = cachedRole
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? 'editor'
    response.cookies.set(ROLE_COOKIE_NAME, await signRoleCookie(user.id, role), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ROLE_COOKIE_TTL_SECONDS,
      path: '/',
    })
  }

  // Root přesměrování — admin jde na dashboard, editor na tasky
  if (pathname === '/') {
    return NextResponse.redirect(new URL(role === 'admin' ? '/dashboard' : '/tasks', request.url))
  }

  // Zkontroluj roli pro admin-only routes
  if (isAdminOnlyRoute(pathname) || isAdminOnlyApiRoute(pathname)) {

    if (role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/tasks', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
