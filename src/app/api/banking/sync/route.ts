import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { fetchFioFull, mapFioTransactionToDb } from '@/lib/fio'

// Vrátí YYYY-MM-DD pro N dní zpět
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('from') ?? daysAgo(90)
  const dateTo   = searchParams.get('to')   ?? today()

  const tokens: { envKey: string; token: string }[] = []
  if (process.env.FIO_ucet_1) tokens.push({ envKey: 'FIO_ucet_1', token: process.env.FIO_ucet_1 })
  if (process.env.FIO_ucet_2) tokens.push({ envKey: 'FIO_ucet_2', token: process.env.FIO_ucet_2 })

  if (tokens.length === 0) {
    return NextResponse.json({ error: 'Nejsou nastaveny FIO API tokeny (FIO_ucet_1, FIO_ucet_2)' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()
  const results: { account: string; imported: number; skipped: number; errors: string[] }[] = []

  for (const { envKey, token } of tokens) {
    let statement
    try {
      statement = await fetchFioFull(token, dateFrom, dateTo)
    } catch (e: unknown) {
      return NextResponse.json(
        { error: `${envKey}: ${e instanceof Error ? e.message : 'Chyba FIO API'}` },
        { status: 502 }
      )
    }

    const { info, transactionList } = statement
    const accountNumber = `${info.accountId}/${info.bankId}`

    // Najdi nebo vytvoř bank_account
    let { data: account } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('account_number', accountNumber)
      .single()

    if (!account) {
      const { data: created, error: createErr } = await supabase
        .from('bank_accounts')
        .insert({ name: envKey, account_number: accountNumber, starting_balance: 0 })
        .select('id')
        .single()
      if (createErr || !created) {
        return NextResponse.json({ error: `Nepodařilo se vytvořit účet: ${createErr?.message}` }, { status: 500 })
      }
      account = created
    }

    const txs = transactionList.transaction ?? []
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const t of txs) {
      const row = mapFioTransactionToDb(t)
      if (!row.fio_id || !row.date) { skipped++; continue }

      const amountCzk = Math.abs(row.amount)

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { constant_symbol, specific_symbol, ...rowClean } = row

      const { error } = await supabase
        .from('bank_transactions')
        .upsert(
          {
            ...rowClean,
            account_id: account.id,
            amount_czk: amountCzk,
          },
          { onConflict: 'fio_id' }
        )

      if (error) {
        errors.push(`${row.fio_id}: ${error.message}`)
        skipped++
        continue
      }
      imported++
    }

    results.push({ account: accountNumber, imported, skipped, errors: errors.slice(0, 5) })
  }

  return NextResponse.json({ ok: true, dateFrom, dateTo, results })
}
