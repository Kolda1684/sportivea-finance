import { NextRequest, NextResponse } from 'next/server'

// Delší limit — sync řetězí 4 kroky (Fakturoid ×2, FIO, matching), dohromady i desítky sekund
export const maxDuration = 300

// Vercel Cron Job — spouštěno každý den v 6:00
// Zabezpečeno CRON_SECRET env proměnnou
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = new URL(req.url).origin
  const results: Record<string, unknown> = {}
  const internalHeaders = process.env.CRON_SECRET
    ? { 'x-internal-secret': process.env.CRON_SECRET }
    : undefined

  // Per-step timeout, aby jeden zaseknutý krok neshodil celý cron
  async function step(name: string, path: string) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: internalHeaders,
        signal: AbortSignal.timeout(120_000),
      })
      results[name] = await res.json()
    } catch (e) {
      results[name] = { error: String(e) }
      console.error(`[cron/sync] krok ${name} selhal:`, e)
    }
  }

  await step('fakturoid', '/api/invoices/sync')                 // 1. vydané faktury
  await step('expense_fakturoid', '/api/expense-invoices/sync') // 2. přijaté faktury
  await step('fio', '/api/banking/sync')                        // 3. bankovní pohyby
  await step('matching', '/api/banking/match')                  // 4. párování

  console.log('[cron/sync] hotovo:', JSON.stringify(results))
  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results })
}
