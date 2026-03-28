import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { dateToMonth } from '@/lib/utils'

// Webhook secret – nastav SHEETS_WEBHOOK_SECRET v .env.local
const WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET

function parseDate(raw: string | null): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function parseNum(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = parseFloat(String(raw).replace(',', '.'))
  return isNaN(n) ? null : n
}

export async function POST(req: NextRequest) {
  // Ověř secret (pokud je nastaven)
  if (WEBHOOK_SECRET) {
    const auth = req.headers.get('x-webhook-secret')
    if (auth !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await req.json()

  // Make může poslat buď pole objektů nebo jeden objekt
  const rows: Record<string, unknown>[] = Array.isArray(body) ? body : [body]

  if (rows.length === 0) {
    return NextResponse.json({ imported: 0 })
  }

  const records = rows.map(row => {
    const dateStr = parseDate(
      (row['Datum'] ?? row['date'] ?? row['Date'] ?? null) as string | null
    )
    const month =
      (row['Měsíc'] ?? row['Mesic'] ?? row['month'] ?? null) as string | null ||
      (dateStr ? dateToMonth(new Date(dateStr)) : null)

    return {
      team_member: (row['Jméno'] ?? row['Jmeno'] ?? row['name'] ?? null) as string | null,
      client:      (row['Klient'] ?? row['client'] ?? null) as string | null,
      hours:       parseNum(row['Počet hodin'] ?? row['Hodiny'] ?? row['hours']),
      price:       parseNum(row['Cena'] ?? row['price']),
      task_type:   (row['Úkon'] ?? row['Ukon'] ?? row['task_type'] ?? null) as string | null,
      date:        dateStr,
      task_name:   (row['Task'] ?? row['task_name'] ?? null) as string | null,
      month,
      external_id: (row['ID'] ?? row['id'] ?? row['external_id'] ?? null) as string | null,
    }
  })

  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('variable_costs')
    .upsert(records, { onConflict: 'external_id', ignoreDuplicates: true })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    imported: data?.length ?? records.length,
    total: rows.length,
  })
}

// GET pro ověření webhookové URL z Make
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'sheets-webhook' })
}
