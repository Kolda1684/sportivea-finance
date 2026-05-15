'use client'

import { useState } from 'react'
import { ExtraTable } from './ExtraTable'
import { formatCZK } from '@/lib/utils'
import { cn } from '@/lib/utils'

function fmtH(h: number) { return h > 0 ? Math.round(h * 10) / 10 + ' h' : '—' }

interface VarRow { client?: string; member?: string; count: number; hours: number; price: number }

interface Props {
  month: string
  totalIncome: number
  totalVar: number
  totalFixed: number
  initialExtra: number
  varByClient: VarRow[]
  varByMember: VarRow[]
}

export function CostSection({ month, totalIncome, totalVar, totalFixed, initialExtra, varByClient, varByMember }: Props) {
  const [extraTotal, setExtraTotal] = useState(initialExtra)
  const totalCosts = totalVar + extraTotal + totalFixed
  const profit = totalIncome - totalCosts
  const margin = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0
  const isProfit = profit >= 0
  const maxRows = Math.max(varByClient.length, varByMember.length)

  return (
    <div className="space-y-6">

      {/* Výsledek měsíce */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-900">
          <h2 className="text-sm font-semibold text-white">Výsledek měsíce</h2>
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-200">
          <div className="px-6 py-5">
            <div className="text-xs font-medium text-gray-500 mb-1">Příjmy</div>
            <div className="text-2xl font-bold text-green-700">{formatCZK(totalIncome)}</div>
          </div>
          <div className="px-6 py-5">
            <div className="text-xs font-medium text-gray-500 mb-1">Náklady celkem</div>
            <div className="text-2xl font-bold text-red-600">{formatCZK(totalCosts)}</div>
            <div className="text-xs text-gray-400 mt-1">var + extra + fixní</div>
          </div>
          <div className="px-6 py-5">
            <div className="text-xs font-medium text-gray-500 mb-1">Marže</div>
            <div className={cn('text-2xl font-bold', isProfit ? 'text-green-700' : 'text-red-600')}>{margin} %</div>
            <div className="text-xs text-gray-400 mt-1">{isProfit ? 'v zisku' : 've ztrátě'}</div>
          </div>
          <div className={cn('px-6 py-5', isProfit ? 'bg-green-50' : 'bg-red-50')}>
            <div className={cn('text-xs font-medium mb-1', isProfit ? 'text-green-600' : 'text-red-600')}>
              {isProfit ? 'Zisk' : 'Ztráta'}
            </div>
            <div className={cn('text-2xl font-bold', isProfit ? 'text-green-700' : 'text-red-700')}>
              {formatCZK(Math.abs(profit))}
            </div>
            <div className={cn('text-xs mt-1', isProfit ? 'text-green-500' : 'text-red-400')}>příjmy − náklady</div>
          </div>
        </div>
      </div>

      {/* Variabilní náklady — dle klienta + dle zaměstnance */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-900 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Variabilní náklady</h2>
          <span className="text-sm font-semibold text-gray-300">{formatCZK(totalVar)}</span>
        </div>
        <div className="flex divide-x divide-gray-200">

          {/* Dle klienta */}
          <div className="flex-1">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium text-gray-500">Klient</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-16">Zázn.</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-16">Hod.</th>
                  <th className="text-right px-5 py-2.5 font-medium text-gray-500 w-28">Cena</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {varByClient.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">Žádná data</td></tr>
                )}
                {Array.from({ length: maxRows }).map((_, i) => {
                  const row = varByClient[i]
                  return row ? (
                    <tr key={i} className={cn('hover:bg-blue-50/30', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
                      <td className="px-5 py-2.5 font-medium text-gray-800">{row.client}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{row.count}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{fmtH(row.hours)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCZK(row.price)}</td>
                    </tr>
                  ) : (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td colSpan={4} className="py-2.5">&nbsp;</td>
                    </tr>
                  )
                })}
              </tbody>
              {varByClient.length > 0 && (
                <tfoot className="border-t-2 border-gray-300 bg-gray-100">
                  <tr>
                    <td className="px-5 py-3 font-bold text-gray-900 text-xs uppercase">Celkem</td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{varByClient.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{fmtH(varByClient.reduce((s, r) => s + r.hours, 0))}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCZK(totalVar)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Dle zaměstnance */}
          <div className="flex-1">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium text-gray-500">Zaměstnanec</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-16">Zázn.</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-500 w-16">Hod.</th>
                  <th className="text-right px-5 py-2.5 font-medium text-gray-500 w-28">Cena</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {varByMember.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 text-xs">Žádná data</td></tr>
                )}
                {Array.from({ length: maxRows }).map((_, i) => {
                  const row = varByMember[i]
                  return row ? (
                    <tr key={i} className={cn('hover:bg-blue-50/30', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40')}>
                      <td className="px-5 py-2.5 font-medium text-gray-800">{row.member}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{row.count}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{fmtH(row.hours)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{formatCZK(row.price)}</td>
                    </tr>
                  ) : (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td colSpan={4} className="py-2.5">&nbsp;</td>
                    </tr>
                  )
                })}
              </tbody>
              {varByMember.length > 0 && (
                <tfoot className="border-t-2 border-gray-300 bg-gray-100">
                  <tr>
                    <td className="px-5 py-3 font-bold text-gray-900 text-xs uppercase">Celkem</td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{varByMember.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{fmtH(varByMember.reduce((s, r) => s + r.hours, 0))}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-900">{formatCZK(totalVar)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Extra náklady (editovatelné) */}
      <ExtraTable month={month} onTotalsChange={setExtraTotal} />

      {/* Souhrn nákladů */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs font-medium text-gray-500 mb-1">Variabilní náklady</div>
          <div className="text-xl font-bold text-gray-900">{formatCZK(totalVar)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs font-medium text-gray-500 mb-1">Extra náklady</div>
          <div className="text-xl font-bold text-gray-900">{formatCZK(extraTotal)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <div className="text-xs font-medium text-gray-500 mb-1">Fixní náklady</div>
          <div className="text-xl font-bold text-gray-900">{formatCZK(totalFixed)}</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 px-5 py-4">
          <div className="text-xs font-medium text-red-600 mb-1">Náklady celkem</div>
          <div className="text-xl font-bold text-red-700">{formatCZK(totalCosts)}</div>
        </div>
      </div>
    </div>
  )
}
