import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

function fmtDate(d: string) {
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`
}

function fmtNum(n: number) {
  return n.toFixed(2).replace('.', ',')
}

function slugify(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function entryLabel(tx: {
  counterparty_name: string | null
  message: string | null
  variable_symbol: string | null
  invoices?: { number: string | null; subject_name: string | null } | null
  expense_invoices?: { supplier_name: string | null } | null
}): string {
  if (tx.invoices?.number) return `${tx.invoices.number}${tx.invoices.subject_name ? ' · ' + tx.invoices.subject_name : ''}`
  if (tx.expense_invoices?.supplier_name) return tx.expense_invoices.supplier_name
  if (tx.counterparty_name) return tx.counterparty_name
  if (tx.message) return tx.message.replace(/^n[aá]kup:\s*/i, '').split(',')[0].trim()
  return tx.variable_symbol ?? '—'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null
  const accountId = searchParams.get('account_id') ?? null

  const supabase = createAdminSupabaseClient()

  // Načti účty
  const { data: accounts } = await supabase.from('bank_accounts').select('id, name, starting_balance')
  const accountMap = new Map((accounts ?? []).map(a => [a.id, a]))

  // Načti transakce s joined fakturami
  let query = supabase
    .from('bank_transactions')
    .select(`
      id, date, amount, amount_czk, currency, exchange_rate,
      counterparty_name, variable_symbol, message, type, account_id,
      invoices:matched_invoice_id ( number, subject_name ),
      expense_invoices:matched_expense_invoice_id ( supplier_name )
    `)
    .order('date', { ascending: true })

  if (accountId) query = query.eq('account_id', accountId)

  const { data: txs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filtruj rok a měsíc
  const filtered = (txs ?? []).filter(tx => {
    const d = new Date(tx.date)
    if (d.getFullYear() !== year) return false
    if (month !== null && d.getMonth() + 1 !== month) return false
    return true
  })

  // Průběžný zůstatek per účet (od starting_balance)
  const balances = new Map<string, number>()
  for (const [id, acc] of Array.from(accountMap)) balances.set(id, acc.starting_balance ?? 0)

  // Hlavička CSV (UTF-8 BOM)
  const BOM = '\uFEFF'
  const header = 'Řádek;Datum;Číslo dokladu;Popis;Příjmy;Výdaje;Zůstatek;Měna;Původní částka;Kurz;Účet'
  const rows: string[] = []
  let idx = 1

  for (const tx of filtered) {
    const czk = Math.abs(tx.amount_czk ?? tx.amount)
    const isIncome = tx.type === 'income'
    const balance = (balances.get(tx.account_id ?? '') ?? 0) + (isIncome ? czk : -czk)
    balances.set(tx.account_id ?? '', balance)

    const income = isIncome ? fmtNum(czk) : ''
    const expense = isIncome ? '' : fmtNum(czk)
    const isForeign = tx.currency && tx.currency !== 'CZK'
    const origAmount = isForeign ? fmtNum(Math.abs(tx.amount)) : ''
    const rate = isForeign && tx.exchange_rate ? fmtNum(tx.exchange_rate) : ''
    const accountName = accountMap.get(tx.account_id ?? '')?.name ?? ''
    const inv = Array.isArray(tx.invoices) ? tx.invoices[0] ?? null : tx.invoices ?? null
    const expInv = Array.isArray(tx.expense_invoices) ? tx.expense_invoices[0] ?? null : tx.expense_invoices ?? null
    const label = entryLabel({ ...tx, invoices: inv, expense_invoices: expInv })
    const docNumber = inv?.number ?? ''

    rows.push([
      idx++,
      fmtDate(tx.date),
      docNumber,
      label,
      income,
      expense,
      fmtNum(balance),
      tx.currency ?? 'CZK',
      origAmount,
      rate,
      accountName,
    ].join(';'))
  }

  const csv = BOM + header + '\n' + rows.join('\n')

  // Název souboru
  const monthStr = month !== null ? String(month).padStart(2, '0') : 'celý-rok'
  const accName = accountId ? slugify(accountMap.get(accountId)?.name ?? 'ucet') : 'vsechny-ucty'
  const filename = `financni-denik_${year}-${monthStr}_${accName}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
