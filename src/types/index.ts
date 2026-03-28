// ============================================================
// Typy pro všechny entity aplikace
// ============================================================

export type TransactionStatus = 'unmatched' | 'matched' | 'ignored'
export type TransactionType = 'income' | 'expense'
export type IncomeStatus = 'cekame' | 'potvrzeno' | 'vystaveno' | 'zaplaceno'
export type MatchedBy = 'manual' | 'auto' | 'ai'

export interface Transaction {
  id: string
  fio_id: string | null
  date: string
  amount: number
  currency: string
  counterparty_name: string | null
  counterparty_account: string | null
  variable_symbol: string | null
  specific_symbol: string | null
  constant_symbol: string | null
  message: string | null
  type: TransactionType | null
  status: TransactionStatus
  matched_invoice_id: string | null
  created_at: string
}

export interface Invoice {
  id: string
  fakturoid_id: string | null
  number: string | null
  subject_name: string | null
  issued_on: string | null
  due_on: string | null
  total: number | null
  currency: string
  status: string | null
  variable_symbol: string | null
  note: string | null
  pdf_url: string | null
  synced_at: string
}

export interface InvoicePayment {
  id: string
  transaction_id: string | null
  invoice_id: string | null
  matched_at: string
  matched_by: MatchedBy
}

export interface Income {
  id: string
  client: string
  project_name: string
  amount: number | null
  currency: string
  date: string | null
  status: IncomeStatus
  invoice_id: string | null
  note: string | null
  month: string | null
  created_at: string
}

export interface VariableCost {
  id: string
  team_member: string | null
  client: string | null
  hours: number | null
  price: number | null
  task_type: string | null
  date: string | null
  task_name: string | null
  month: string | null
  external_id: string | null
  created_at: string
}

export interface FixedCost {
  id: string
  name: string
  amount: number
  currency: string
  active: boolean
  note: string | null
}

export interface ExtraCost {
  id: string
  name: string
  amount: number
  date: string | null
  category: string | null
  note: string | null
  month: string | null
  fio_transaction_id: string | null
  created_at: string
}

export interface TeamMember {
  id: string
  name: string
  hourly_rate: number
  active: boolean
}

// Dashboard typy
export interface DashboardStats {
  totalIncome: number
  totalCosts: number
  profit: number
  invoicedAmount: number
  unpaidInvoicesCount: number
  unpaidInvoicesSum: number
  unmatchedTransactionsCount: number
}

export interface MonthlyData {
  month: string
  label: string
  income: number
  costs: number
}

export interface ClientSummary {
  client: string
  total: number
  count: number
}

export interface TeamMemberCostSummary {
  team_member: string
  total: number
  hours: number
}
