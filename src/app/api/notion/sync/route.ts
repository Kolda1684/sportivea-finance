import { NextRequest, NextResponse } from 'next/server'
import { bulkSyncCompanies, bulkSyncTasks } from '@/lib/notion-mapping'

// Manuální/initial bulk sync. Volá UI tlačítko nebo cron.
// Body: { source?: 'all' | 'companies' | 'tasks', since?: ISO string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { source?: string; since?: string }
  const source = body.source ?? 'all'
  const since = body.since ? new Date(body.since) : undefined

  const result: { companies?: { created: number; updated: number; total: number }; tasks?: { created: number; updated: number; total: number }; error?: string } = {}

  try {
    if (source === 'all' || source === 'companies') {
      result.companies = await bulkSyncCompanies(since)
    }
    if (source === 'all' || source === 'tasks') {
      // Tasky závisí na Companies — nejdřív musí být firmy synchronizované
      result.tasks = await bulkSyncTasks(since)
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync selhal', partial: result }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...result })
}
