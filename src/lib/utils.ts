import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formátování české koruny
export function formatCZK(amount: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Formátování měsíce z "2,2026" na "únor 2026"
export function formatMonth(month: string): string {
  const [m, y] = month.split(',')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('cs-CZ', {
    month: 'long',
    year: 'numeric',
  })
}

// Aktuální měsíc ve formátu "M,YYYY"
export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getMonth() + 1},${now.getFullYear()}`
}

// Předchozí N měsíců (včetně aktuálního) ve formátu "M,YYYY"
export function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getMonth() + 1},${d.getFullYear()}`)
  }
  return months
}

// Formátování data z ISO na DD.MM.YYYY
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Převod data DD.MM.YYYY na YYYY-MM-DD
export function parseCzDate(dateStr: string): string {
  const [d, m, y] = dateStr.split('.')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Začátek a konec měsíce z formátu "M,YYYY"
export function monthBounds(month: string): { from: string; to: string } {
  const [m, y] = month.split(',').map(Number)
  const from = new Date(y, m - 1, 1)
  const to = new Date(y, m, 0)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

// Převod měsíce z Date na "M,YYYY"
export function dateToMonth(date: Date): string {
  return `${date.getMonth() + 1},${date.getFullYear()}`
}

// Status badge barvy
export const incomeStatusConfig: Record<string, { label: string; className: string }> = {
  cekame:    { label: 'Čekáme',    className: 'bg-yellow-100 text-yellow-800' },
  potvrzeno: { label: 'Potvrzeno', className: 'bg-blue-100 text-blue-800' },
  vystaveno: { label: 'Vystaveno', className: 'bg-purple-100 text-purple-800' },
  zaplaceno: { label: 'Zaplaceno', className: 'bg-green-100 text-green-800' },
}
