import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { dateToMonth } from '@/lib/utils'

// Parsuje datum z různých formátů: DD.MM.YYYY, YYYY-MM-DD, D.M.YYYY
function parseDate(raw: string): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD.MM.YYYY nebo D.M.YYYY
  const czMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (czMatch) {
    const [, d, m, y] = czMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}

function parseNum(raw: string): number | null {
  if (!raw?.trim()) return null
  const n = parseFloat(raw.trim().replace(',', '.'))
  return isNaN(n) ? null : n
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      row.push(current.trim())
      current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(current.trim())
      rows.push(row)
      row = []
      current = ''
    } else {
      current += ch
    }
  }
  if (current || row.length) {
    row.push(current.trim())
    rows.push(row)
  }
  return rows
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Žádný soubor' }, { status: 400 })

  const text = await file.text()
  const rows = parseCSV(text)
  if (rows.length < 2) return NextResponse.json({ error: 'Prázdný soubor' }, { status: 400 })

  // Detekuj hlavičky (první řádek)
  const headers = rows[0].map(h => h.toLowerCase().trim())

  // Mapování sloupců podle názvu (flexibilní, funguje s CZ i EN názvy)
  const idx = {
    name:    headers.findIndex(h => h.includes('jméno') || h.includes('jmeno') || h === 'name'),
    client:  headers.findIndex(h => h.includes('klient') || h === 'client'),
    hours:   headers.findIndex(h => h.includes('hodin') || h === 'hours'),
    price:   headers.findIndex(h => h.includes('cena') || h === 'price'),
    task_type: headers.findIndex(h => h.includes('úkon') || h.includes('ukon') || h.includes('typ')),
    date:    headers.findIndex(h => h.includes('datum') || h === 'date'),
    task_name: headers.findIndex(h => h.includes('task') || h.includes('název')),
    month:   headers.findIndex(h => h.includes('měsíc') || h.includes('mesic') || h === 'month'),
    ext_id:  headers.findIndex(h => h === 'id' || h.includes('external')),
  }

  const records = []
  const skipped = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(c => !c)) continue // prázdný řádek

    const dateStr = idx.date >= 0 ? parseDate(row[idx.date] ?? '') : null
    const month = idx.month >= 0 && row[idx.month]?.trim()
      ? row[idx.month].trim()
      : dateStr
        ? dateToMonth(new Date(dateStr))
        : null

    const record = {
      team_member: idx.name >= 0 ? (row[idx.name] || null) : null,
      client:      idx.client >= 0 ? (row[idx.client] || null) : null,
      hours:       idx.hours >= 0 ? parseNum(row[idx.hours] ?? '') : null,
      price:       idx.price >= 0 ? parseNum(row[idx.price] ?? '') : null,
      task_type:   idx.task_type >= 0 ? (row[idx.task_type] || null) : null,
      date:        dateStr,
      task_name:   idx.task_name >= 0 ? (row[idx.task_name] || null) : null,
      month,
      external_id: idx.ext_id >= 0 ? (row[idx.ext_id] || null) : null,
    }

    records.push(record)
  }

  if (records.length === 0) {
    return NextResponse.json({ error: 'Žádné záznamy k importu' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Upsert — pokud external_id existuje, přeskočí duplikáty
  const { data, error } = await supabase
    .from('variable_costs')
    .upsert(records, {
      onConflict: 'external_id',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    imported: data?.length ?? records.length,
    total: records.length,
  })
}
