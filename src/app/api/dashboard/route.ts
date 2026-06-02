import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, getLastNMonths, monthBounds } from '@/lib/utils'
import type { DashboardStats, MonthlyData, ClientSummary, TeamMemberCostSummary } from '@/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? getCurrentMonth()
  const supabase = createAdminSupabaseClient()

  const { from, to } = monthBounds(month)
  const months = getLastNMonths(6)

  // Všechny queries paralelně — 9 DB roundtripů → 1 Promise.all
  const [
    { data: incomeRows },
    { data: varCostRows },
    { data: fixedRows },
    { data: extraRows },
    { data: unpaidInvoices },
    { data: invoicedRows },
    { count: unmatchedCount },
    { data: clientRows },
    { data: memberRows },
    { data: chartIncome },
    { data: chartVar },
    { data: chartExtra },
  ] = await Promise.all([
    supabase.from('income').select('amount').eq('month', month),
    supabase.from('variable_costs').select('price').eq('month', month),
    supabase.from('fixed_costs').select('amount').eq('active', true),
    supabase.from('extra_costs').select('amount').eq('month', month),
    supabase.from('invoices').select('total').not('status', 'eq', 'paid'),
    supabase.from('invoices').select('total').gte('issued_on', from).lte('issued_on', to),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'unmatched'),
    supabase.from('income').select('client, amount').eq('month', month),
    supabase.from('variable_costs').select('team_member, price, hours').eq('month', month),
    supabase.from('income').select('month, amount').in('month', months),
    supabase.from('variable_costs').select('month, price').in('month', months),
    supabase.from('extra_costs').select('month, amount').in('month', months),
  ])

  const totalIncome = incomeRows?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalVarCosts = varCostRows?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0
  const totalFixedCosts = fixedRows?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalExtraCosts = extraRows?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
  const totalCosts = totalVarCosts + totalFixedCosts + totalExtraCosts

  const unpaidInvoicesCount = unpaidInvoices?.length ?? 0
  const unpaidInvoicesSum = unpaidInvoices?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0
  const invoicedAmount = invoicedRows?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0

  const stats: DashboardStats = {
    totalIncome,
    totalCosts,
    profit: totalIncome - totalCosts,
    invoicedAmount,
    unpaidInvoicesCount,
    unpaidInvoicesSum,
    unmatchedTransactionsCount: unmatchedCount ?? 0,
  }

  // Měsíční data pro graf — 3 queries místo 18 (6 měsíců × 3)
  const monthlyData: MonthlyData[] = months.map((m) => {
    const income = (chartIncome ?? []).filter(r => r.month === m).reduce((s, r) => s + (r.amount ?? 0), 0)
    const varCosts = (chartVar ?? []).filter(r => r.month === m).reduce((s, r) => s + (r.price ?? 0), 0)
    const extraCosts = (chartExtra ?? []).filter(r => r.month === m).reduce((s, r) => s + (r.amount ?? 0), 0)
    return { month: m, label: m, income, costs: varCosts + totalFixedCosts + extraCosts }
  })

  const clientMap = new Map<string, { total: number; count: number }>()
  for (const r of clientRows ?? []) {
    const existing = clientMap.get(r.client) ?? { total: 0, count: 0 }
    clientMap.set(r.client, { total: existing.total + (r.amount ?? 0), count: existing.count + 1 })
  }
  const topClients: ClientSummary[] = Array.from(clientMap.entries())
    .map(([client, d]) => ({ client, ...d }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const memberMap = new Map<string, { total: number; hours: number }>()
  for (const r of memberRows ?? []) {
    const name = r.team_member ?? 'Neznámý'
    const existing = memberMap.get(name) ?? { total: 0, hours: 0 }
    memberMap.set(name, { total: existing.total + (r.price ?? 0), hours: existing.hours + (r.hours ?? 0) })
  }
  const teamCosts: TeamMemberCostSummary[] = Array.from(memberMap.entries())
    .map(([team_member, d]) => ({ team_member, ...d }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ stats, monthlyData, topClients, teamCosts })
}
