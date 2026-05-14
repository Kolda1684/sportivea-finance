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
  paid_on: string | null
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
  billed_to: string | null
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

// ============================================================
// Sportivea OS – nové typy
// ============================================================

export type UserRole = 'admin' | 'editor'

export interface Profile {
  id: string
  name: string
  email: string | null
  role: UserRole
  created_at: string
}

export type TaskStatus = 'zadano' | 'v_procesu' | 'na_checku' | 'hotovo'
export type TaskType = 'Reels' | 'Daily' | 'Long-form' | 'Natáčení' | 'Grafika' | 'Captions' | 'Stories' | 'YouTube' | 'Jiné'

export interface Task {
  id: string
  title: string
  description: string | null
  deadline: string | null
  status: TaskStatus
  client: string | null
  company_id: string | null
  hours: number
  minutes: number
  reward: number | null
  one_time_reward: number | null
  task_type: string | null
  month: string | null
  assignee_id: string | null
  created_by: string | null
  variable_cost_id: string | null
  created_at: string
  updated_at: string
  // Joined
  assignee?: Profile
  comments?: TaskComment[]
  attachments?: TaskAttachment[]
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string | null
  author_name: string | null
  content: string
  created_at: string
}

export interface TaskAttachment {
  id: string
  task_id: string
  file_name: string
  file_url: string
  file_size: number | null
  uploaded_by: string | null
  created_at: string
}

export type CalendarEventStatus = 'planovano' | 'potvrzeno' | 'zruseno'

export interface CalendarEvent {
  id: string
  title: string
  start_date: string
  end_date: string | null
  client: string | null
  company_id: string | null
  status: CalendarEventStatus
  location: string | null
  description: string | null
  created_by: string | null
  created_at: string
  // Joined
  assignees?: Profile[]
}

export interface Company {
  id: string
  name: string
  ico: string | null
  website: string | null
  note: string | null
  created_at: string
}

export interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  company_id: string | null
  note: string | null
  created_at: string
  // Joined
  company?: Company
}
