import { NextRequest, NextResponse } from 'next/server'
import { bulkSyncCompanies, bulkSyncTasks, bulkSyncTravel } from '@/lib/notion-mapping'

// 12 zaměstnaneckých databází + klienti + cesťáky — může trvat déle než default
export const maxDuration = 300

// Denní catchup cron — pojistka pro webhook eventy, které se ztratily.
// Synchronizuje vše změněné za posledních 36 hodin (overlap pro jistotu).
// Volá Vercel cron — autorizace přes CRON_SECRET v Authorization hlavičce.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000)
  try {
    const companies = await bulkSyncCompanies(since)
    const tasks = await bulkSyncTasks(since)
    const travel = await bulkSyncTravel(since)
    return NextResponse.json({ ok: true, since: since.toISOString(), companies, tasks, travel })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Cron sync selhal' }, { status: 500 })
  }
}
