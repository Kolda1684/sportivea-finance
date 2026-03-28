'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonth, getLastNMonths } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface MonthSelectorClientProps {
  currentMonth: string
}

export function MonthSelectorClient({ currentMonth }: MonthSelectorClientProps) {
  const router = useRouter()
  const months = getLastNMonths(24)

  function go(month: string) {
    router.push(`/dashboard?month=${month}`)
  }

  const idx = months.indexOf(currentMonth)
  const prev = idx > 0 ? months[idx - 1] : null
  const next = idx < months.length - 1 ? months[idx + 1] : null

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => prev && go(prev)}
        disabled={!prev}
        className="rounded-lg border bg-white p-1.5 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <Select value={currentMonth} onValueChange={go}>
        <SelectTrigger className="w-44 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map(m => (
            <SelectItem key={m} value={m}>
              {formatMonth(m).charAt(0).toUpperCase() + formatMonth(m).slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        onClick={() => next && go(next)}
        disabled={!next}
        className="rounded-lg border bg-white p-1.5 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
