// Fio Banka API wrapper
// Token se načítá ze Supabase DB šifrovaně přes getSecret('fio_token')

const FIO_BASE = 'https://fioapi.fio.cz/v1/rest'

export interface FioTransaction {
  column22: { value: number; name: string } | null  // ID pohybu
  column0:  { value: string; name: string } | null  // Datum
  column1:  { value: number; name: string } | null  // Objem
  column14: { value: string; name: string } | null  // Měna
  column10: { value: string; name: string } | null  // Název protiúčtu
  column2:  { value: string; name: string } | null  // Protiúčet
  column5:  { value: string; name: string } | null  // VS
  column6:  { value: string; name: string } | null  // KS
  column7:  { value: string; name: string } | null  // SS
  column25: { value: string; name: string } | null  // Komentář
  column16: { value: string; name: string } | null  // Zpráva
  column8:  { value: string; name: string } | null  // Typ pohybu
}

export interface FioResponse {
  accountStatement: {
    info: {
      accountId: string
      bankId: string
      currency: string
      iban: string
      bic: string
      openingBalance: number
      closingBalance: number
      dateStart: string
      dateEnd: string
    }
    transactionList: {
      transaction: FioTransaction[]
    }
  }
}

export async function fetchFioTransactions(
  token: string,
  dateFrom: string,
  dateTo: string
): Promise<FioTransaction[]> {
  const url = `${FIO_BASE}/periods/${token}/${dateFrom}/${dateTo}/transactions.json`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Fio API chyba: ${res.status}`)
  const data: FioResponse = await res.json()
  return data.accountStatement.transactionList.transaction ?? []
}

export async function fetchFioFull(
  token: string,
  dateFrom: string,
  dateTo: string
): Promise<FioResponse['accountStatement']> {
  const url = `${FIO_BASE}/periods/${token}/${dateFrom}/${dateTo}/transactions.json`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Fio API chyba: ${res.status}`)
  const data: FioResponse = await res.json()
  return data.accountStatement
}

export function mapFioTransactionToDb(t: FioTransaction) {
  return {
    fio_id: t.column22?.value?.toString() ?? null,
    date: t.column0?.value?.slice(0, 10) ?? null,
    amount: t.column1?.value ?? 0,
    currency: t.column14?.value ?? 'CZK',
    counterparty_name: t.column10?.value ?? null,
    counterparty_account: t.column2?.value ?? null,
    variable_symbol: t.column5?.value ?? null,
    constant_symbol: t.column6?.value ?? null,
    specific_symbol: t.column7?.value ?? null,
    message: t.column16?.value ?? t.column25?.value ?? null,
    type: (t.column1?.value ?? 0) > 0 ? 'income' : 'expense',
    status: 'unmatched',
  }
}
