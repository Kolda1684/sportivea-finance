'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Building2, ChevronRight } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import type { VariableCost, FixedCost, ExtraCost } from '@/types'
import { cn } from '@/lib/utils'

const TRAVEL_TYPE = 'Cesťák'
const isTravel = (v: VariableCost) => v.task_type === TRAVEL_TYPE

export default function AllCostsPage() {
  const router = useRouter()
  const [variable, setVariable] = useState<VariableCost[]>([])
  const [fixed, setFixed] = useState<FixedCost[]>([])
  const [extra, setExtra] = useState<ExtraCost[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentMonth())

  const months = getLastNMonths(12)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [varRes, fixRes, extRes] = await Promise.all([
      fetch(`/api/costs/variable?month=${month}`).then(r => r.json()),
      fetch('/api/costs/fixed').then(r => r.json()),
      fetch(`/api/costs/extra?month=${month}`).then(r => r.json()),
    ])
    setVariable(varRes)
    setFixed(fixRes.filter((f: FixedCost) => f.active))
    setExtra(extRes)
    setLoading(false)
  }, [month])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Mzdy = tasky z Notionu, Cestovné = cesťáky (náhrada, ne mzda)
  const totalWages = variable.filter(v => !isTravel(v)).reduce((s, v) => s + (v.price ?? 0), 0)
  const totalTravel = variable.filter(isTravel).reduce((s, v) => s + (v.price ?? 0), 0)
  const totalFixed = fixed.reduce((s, f) => s + f.amount, 0)
  const totalExtra = extra.reduce((s, e) => s + e.amount, 0)
  const totalAll = totalWages + totalTravel + totalFixed + totalExtra

  // Náklady po klientech (jen variabilní práce; cesťáky bez klienta jdou do "bez klienta")
  const byClient = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of variable) {
      const key = v.client ?? '— bez klienta —'
      map.set(key, (map.get(key) ?? 0) + (v.price ?? 0))
    }
    return Array.from(map.entries())
      .map(([client, total]) => ({ client, total }))
      .sort((a, b) => b.total - a.total)
  }, [variable])

  // Náklady po zaměstnancích — mzda + cestovné zvlášť
  const byMember = useMemo(() => {
    const map = new Map<string, { wages: number; travel: number; hours: number }>()
    for (const v of variable) {
      const key = v.team_member ?? '— neznámý —'
      const rec = map.get(key) ?? { wages: 0, travel: 0, hours: 0 }
      if (isTravel(v)) rec.travel += v.price ?? 0
      else { rec.wages += v.price ?? 0; rec.hours += v.hours ?? 0 }
      map.set(key, rec)
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, ...d, total: d.wages + d.travel }))
      .sort((a, b) => b.total - a.total)
  }, [variable])

  function goToVariable(params: Record<string, string>) {
    const qs = new URLSearchParams({ month, ...params })
    router.push(`/costs/variable?${qs}`)
  }

  const monthLabel = formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)

  return (
    <div className="p-8 space-y-5">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Přehled nákladů</h1>
        <p className="text-sm text-gray-500 mt-1">
          {monthLabel} · celkem <span className="font-semibold text-red-600">{formatCZK(totalAll)}</span>
        </p>
      </div>

      {/* KPI karty */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {([
          { label: 'Mzdy',     value: totalWages,  hint: 'práce z Notionu', color: 'text-blue-600' },
          { label: 'Cestovné', value: totalTravel, hint: 'náhrady cest',     color: 'text-teal-600' },
          { label: 'Extra',    value: totalExtra,  hint: `${extra.length} položek`, color: 'text-orange-600' },
          { label: 'Fixní',    value: totalFixed,  hint: `${fixed.length} položek`, color: 'text-purple-600' },
          { label: 'Celkem',   value: totalAll,    hint: 'vše dohromady',    color: 'text-gray-900' },
        ]).map(card => (
          <div key={card.label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-gray-500 font-medium">{card.label}</p>
            <p className={cn('text-xl font-bold mt-1', card.color)}>{formatCZK(card.value)}</p>
            <p className="text-xs text-gray-400">{card.hint}</p>
          </div>
        ))}
      </div>

      {/* Měsíc */}
      <div className="flex items-center gap-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {formatMonth(m).charAt(0).toUpperCase() + formatMonth(m).slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dvě tabulky: Klienti | Zaměstnanci */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map(i => <Skeleton key={i} className="h-80 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Náklady po klientech */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
              <Building2 className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">Náklady po klientech</h2>
              <span className="ml-auto text-xs text-gray-400">{byClient.length} klientů</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {byClient.length === 0 && (
                  <tr><td className="px-4 py-8 text-center text-gray-400">Žádné náklady</td></tr>
                )}
                {byClient.map(({ client, total }) => {
                  const noClient = client.startsWith('—')
                  return (
                    <tr
                      key={client}
                      onClick={() => !noClient && goToVariable({ client })}
                      className={cn('group', !noClient && 'cursor-pointer hover:bg-gray-50/70', noClient && 'bg-amber-50/50')}
                    >
                      <td className="px-4 py-2.5">
                        <span className={cn(noClient ? 'text-amber-600 font-medium' : 'text-gray-900')}>{client}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-600 tabular-nums whitespace-nowrap">
                        {formatCZK(total)}
                        {!noClient && <ChevronRight className="inline-block ml-1 h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Celkem</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums">
                    {formatCZK(totalWages + totalTravel)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Náklady po zaměstnancích */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
              <Users className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-sm">Náklady po zaměstnancích</h2>
              <span className="ml-auto text-xs text-gray-400">{byMember.length} lidí</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-2 text-left font-medium">Zaměstnanec</th>
                  <th className="px-2 py-2 text-right font-medium">Mzda</th>
                  <th className="px-2 py-2 text-right font-medium">Cestovné</th>
                  <th className="px-4 py-2 text-right font-medium">Celkem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byMember.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Žádné náklady</td></tr>
                )}
                {byMember.map(m => (
                  <tr
                    key={m.name}
                    onClick={() => goToVariable({ member: m.name })}
                    className="group cursor-pointer hover:bg-gray-50/70"
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-gray-900">{m.name}</span>
                      {m.hours > 0 && <span className="ml-2 text-xs text-gray-400">{Math.round(m.hours * 10) / 10} h</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-gray-900 whitespace-nowrap">{formatCZK(m.wages)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-teal-600 whitespace-nowrap">
                      {m.travel > 0 ? formatCZK(m.travel) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600 tabular-nums whitespace-nowrap">
                      {formatCZK(m.total)}
                      <ChevronRight className="inline-block ml-1 h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Celkem</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums text-gray-900">{formatCZK(totalWages)}</td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums text-teal-600">{formatCZK(totalTravel)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums">{formatCZK(totalWages + totalTravel)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}
