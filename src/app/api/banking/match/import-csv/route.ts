import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Import ručně spárovaného Excel/CSV (Finanční deník).
// CSV má 4 podtabulky vedle sebe (4 účty), sloupce per účet:
//   #, Datum, Č.dokl., (popis pro účet 1 navíc), Popis, Příjmy, Výdaje, Zůstatek
// Pro každý řádek se snažíme najít odpovídající bank_transaction v DB
// (datum + částka + typ) a podle Č.dokl. spojit s fakturou nebo označit
// jako bez faktury.

interface ParsedEntry {
  account_slot: number  // 1-4
  date: string | null   // YYYY-MM-DD
  doc: string | null
  description: string | null
  income: number | null
  expense: number | null
}

function parseCzNumber(s: string | undefined): number | null {
  if (!s) return null
  const cleaned = s.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseCzDate(s: string | undefined, year: number): string | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed) return null

  // Formát "1.1" nebo "5.1." nebo "12.05.2026"
  const m1 = trimmed.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\.?$/)
  if (m1) {
    const day = m1[1].padStart(2, '0')
    const month = m1[2].padStart(2, '0')
    const y = m1[3] ?? String(year)
    return `${y}-${month}-${day}`
  }
  // Formát "1-led", "5-led" — zde nemůžeme spolehlivě (zkrácené)
  const m2 = trimmed.match(/^(\d{1,2})-(led|úno|bře|dub|kvě|čvn|čvc|srp|zář|říj|lis|pro)/i)
  if (m2) {
    const monthMap: Record<string, string> = {
      led: '01', úno: '02', bře: '03', dub: '04', kvě: '05', čvn: '06',
      čvc: '07', srp: '08', zář: '09', říj: '10', lis: '11', pro: '12',
    }
    const month = monthMap[m2[2].toLowerCase()]
    if (!month) return null
    return `${year}-${month}-${m2[1].padStart(2, '0')}`
  }
  return null
}

function parseRow(cols: string[], year: number): ParsedEntry[] {
  const entries: ParsedEntry[] = []
  // Layout (Excel export Finančního deníku):
  // Účet 1: cols 0..7  — má extra prázdný sloupec mezi # a datem (col 1 = blank)
  //   0=#, 1=blank, 2=datum, 3=Č.dokl., 4=Popis, 5=Příjmy, 6=Výdaje, 7=Zůstatek
  // Účet 2: cols 8..14  — 0=#, 9=datum, 10=Č.dokl., 11=Popis, 12=Příjmy, 13=Výdaje, 14=Zůstatek
  // Účet 3: cols 15..21 — Pokladna, stejné jako účet 2
  // Účet 4: cols 22..28 — stejné jako účet 2
  const slots: { slot: number; date: number; doc: number; desc: number; income: number; expense: number }[] = [
    { slot: 1, date: 2,  doc: 3,  desc: 4,  income: 5,  expense: 6  },
    { slot: 2, date: 9,  doc: 10, desc: 11, income: 12, expense: 13 },
    { slot: 3, date: 16, doc: 17, desc: 18, income: 19, expense: 20 },
    { slot: 4, date: 23, doc: 24, desc: 25, income: 26, expense: 27 },
  ]

  for (const s of slots) {
    const date = parseCzDate(cols[s.date], year)
    if (!date) continue
    const desc = (cols[s.desc] ?? '').trim()
    const doc = (cols[s.doc] ?? '').trim()
    const income = parseCzNumber(cols[s.income])
    const expense = parseCzNumber(cols[s.expense])
    if (!income && !expense) continue
    entries.push({
      account_slot: s.slot,
      date,
      doc: doc || null,
      description: desc || null,
      income,
      expense,
    })
  }
  return entries
}

function classifyDoc(doc: string | null): 'income_invoice' | 'expense_invoice' | null {
  if (!doc) return null
  // Income: "Faktura číslo:2025079", "Faktura:2025080" — obsahuje "Faktura" + číslice
  if (/faktura/i.test(doc)) return 'income_invoice'
  // Expense: začíná na "N" + číslice, nebo "NákladN..."
  if (/^N[á]?kladN?\d+/i.test(doc) || /^N\d{4,}/.test(doc)) return 'expense_invoice'
  return null
}

function extractDigits(s: string): string {
  return s.replace(/\D/g, '')
}

// Naivní CSV parser — podporuje libovolný oddělovač, quoted cells, escape ""
function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === sep && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

// Auto-detect oddělovač podle počtu výskytů v prvních řádcích (CSV vs European CSV)
function detectSeparator(lines: string[]): string {
  const sample = lines.slice(0, 10).join('\n')
  const commas = (sample.match(/,/g) ?? []).length
  const semis = (sample.match(/;/g) ?? []).length
  return semis > commas ? ';' : ','
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Chybí soubor' }, { status: 400 })

  const text = await file.text()
  const lines = text.split(/\r?\n/)
  const sep = detectSeparator(lines)

  // Rok z názvu souboru (Excel header bývá zastaralý — "Rok: 2024" zatímco data jsou 2026).
  // Fallback: aktuální rok.
  let year = new Date().getFullYear()
  const filenameYear = file.name.match(/(20\d{2})/)
  if (filenameYear) year = parseInt(filenameYear[1])

  const allEntries: ParsedEntry[] = []
  for (let i = 3; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep)
    if (cols.length < 10) continue
    allEntries.push(...parseRow(cols, year))
  }

  const supabase = createAdminSupabaseClient()

  // Načti vše co budeme spojovat
  const [{ data: dbTxs }, { data: invoices }, { data: expenseInvoices }] = await Promise.all([
    supabase.from('bank_transactions').select('id, date, amount, amount_czk, type, message, counterparty_name, variable_symbol, is_no_invoice, is_internal_transfer, matched_invoice_id, matched_expense_invoice_id'),
    supabase.from('invoices').select('id, number, variable_symbol, total'),
    supabase.from('expense_invoices').select('id, note, variable_symbol, amount, amount_czk').eq('review_status', 'approved'),
  ])

  if (!dbTxs) return NextResponse.json({ error: 'Načtení bank_transactions selhalo' }, { status: 500 })

  // Indexy pro rychlé hledání
  const invByDigits = new Map<string, { id: string; number: string | null }>()
  for (const inv of (invoices ?? [])) {
    if (inv.number) invByDigits.set(extractDigits(inv.number), { id: inv.id, number: inv.number })
    if (inv.variable_symbol) invByDigits.set(extractDigits(inv.variable_symbol), { id: inv.id, number: inv.number })
  }

  const expByDigits = new Map<string, { id: string; note: string | null }>()
  for (const exp of (expenseInvoices ?? [])) {
    const digits = extractDigits(exp.note ?? '') || extractDigits(exp.variable_symbol ?? '')
    if (digits) expByDigits.set(digits, { id: exp.id, note: exp.note })
  }

  let matched = 0
  let markedNoInvoice = 0
  let notFoundTx = 0
  let notFoundInvoice = 0

  // Pro každý CSV řádek najdi tx v DB a propoj
  for (const entry of allEntries) {
    if (!entry.date) continue
    const targetAmount = entry.income ?? entry.expense ?? 0
    if (targetAmount <= 0) continue
    const targetType = entry.income ? 'income' : 'expense'

    // Match tx by date + type + amount (tolerance 1 CZK)
    const candidates = dbTxs.filter(t =>
      t.date === entry.date
      && t.type === targetType
      && Math.abs(Math.abs(t.amount_czk ?? t.amount) - targetAmount) < 1
    )
    if (candidates.length === 0) {
      notFoundTx++
      continue
    }
    const tx = candidates[0]  // první match (mohou být duplicity)

    const klass = classifyDoc(entry.doc)
    if (!klass) {
      // Bez čísla dokladu (nebo neznámý formát) → označit jako bez faktury (modře)
      const update: Record<string, unknown> = {
        is_no_invoice: true,
        status: 'ignored',
        match_method: 'Import: bez faktury (CSV)',
      }
      // Pokud byl matched, odpáruj
      if (tx.matched_invoice_id || tx.matched_expense_invoice_id) {
        if (tx.matched_invoice_id) {
          await supabase.from('invoices').update({ status: 'open', paid_on: null }).eq('id', tx.matched_invoice_id)
        }
        if (tx.matched_expense_invoice_id) {
          await supabase.from('expense_invoices').update({ status: 'unpaid' }).eq('id', tx.matched_expense_invoice_id)
        }
        update.matched_invoice_id = null
        update.matched_expense_invoice_id = null
      }
      await supabase.from('bank_transactions').update(update).eq('id', tx.id)
      markedNoInvoice++
      continue
    }

    // Najdi fakturu podle čísel v doc poli
    const digits = extractDigits(entry.doc ?? '')
    if (!digits) {
      notFoundInvoice++
      continue
    }

    if (klass === 'income_invoice') {
      const inv = invByDigits.get(digits)
      if (!inv) { notFoundInvoice++; continue }
      await supabase.from('bank_transactions').update({
        matched_invoice_id: inv.id,
        matched_expense_invoice_id: null,
        status: 'matched',
        match_zone: 'manual',
        match_method: 'Import z CSV (ruční mapování)',
        match_confidence: 100,
        match_confirmed_at: new Date().toISOString(),
        match_confirmed_by: 'csv_import',
        is_no_invoice: false,
        is_internal_transfer: false,
      }).eq('id', tx.id)
      await supabase.from('invoices').update({ status: 'paid', paid_on: tx.date }).eq('id', inv.id)
      matched++
    } else if (klass === 'expense_invoice') {
      const exp = expByDigits.get(digits)
      if (!exp) { notFoundInvoice++; continue }
      await supabase.from('bank_transactions').update({
        matched_expense_invoice_id: exp.id,
        matched_invoice_id: null,
        status: 'matched',
        match_zone: 'manual',
        match_method: 'Import z CSV (ruční mapování)',
        match_confidence: 100,
        match_confirmed_at: new Date().toISOString(),
        match_confirmed_by: 'csv_import',
        is_no_invoice: false,
        is_internal_transfer: false,
      }).eq('id', tx.id)
      await supabase.from('expense_invoices').update({ status: 'paid' }).eq('id', exp.id)
      matched++
    }
  }

  return NextResponse.json({
    ok: true,
    total_csv_entries: allEntries.length,
    matched_invoices: matched,
    marked_no_invoice: markedNoInvoice,
    bank_tx_not_found: notFoundTx,
    invoice_not_found: notFoundInvoice,
    year,
  })
}
