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
  const internalHeaders = process.env.CRON_SECRET
    ? { 'x-internal-secret': process.env.CRON_SECRET }
    : undefined

  // 1. Fakturoid sync
  try {
    const res = await fetch(`${base}/api/invoices/sync`, { method: 'POST', headers: internalHeaders })
    results.fakturoid = await res.json()
  } catch (e) {
    results.fakturoid = { error: String(e) }
  }

  // 2. Fakturoid přijaté faktury
  try {
    const res = await fetch(`${base}/api/expense-invoices/sync`, { method: 'POST', headers: internalHeaders })
    results.expense_fakturoid = await res.json()
  } catch (e) {
    results.expense_fakturoid = { error: String(e) }
  }

  // 3. FIO sync
  try {
    const res = await fetch(`${base}/api/banking/sync`, { method: 'POST', headers: internalHeaders })
    results.fio = await res.json()
  } catch (e) {
    results.fio = { error: String(e) }
  }

  // 4. Párování bankovních pohybů s vydanými i přijatými fakturami
  try {
    const res = await fetch(`${base}/api/banking/match`, { method: 'POST', headers: internalHeaders })
    results.matching = await res.json()
  } catch (e) {
    results.matching = { error: String(e) }
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results })
}
