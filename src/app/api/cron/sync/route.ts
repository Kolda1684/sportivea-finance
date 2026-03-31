import { NextRequest, NextResponse } from 'next/server'

// Vercel Cron Job — spouštěno každý den v 6:00
// Zabezpečeno CRON_SECRET env proměnnou (Vercel ji nastavuje automaticky)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = new URL(req.url).origin
  const results: Record<string, unknown> = {}

  // 1. Fakturoid sync
  try {
    const res = await fetch(`${base}/api/invoices/sync`, { method: 'POST' })
    results.fakturoid = await res.json()
  } catch (e) {
    results.fakturoid = { error: String(e) }
  }

  // 2. FIO sync
  try {
    const res = await fetch(`${base}/api/banking/sync`, { method: 'POST' })
    results.fio = await res.json()
  } catch (e) {
    results.fio = { error: String(e) }
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results })
}
