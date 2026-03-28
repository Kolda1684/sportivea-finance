import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, getLastNMonths, monthBounds } from '@/lib/utils'
import type { DashboardStats, MonthlyData, ClientSummary, TeamMemberCostSummary } from '@/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? getCurrentMonth()
  const supabase = createAdminSupabaseClient()

  const { from, to } = monthBounds(month)

  // Příjmy aktuální měsíc
  const { data: incomeRows } = await supabase
    .from('income')
    .select('amount')
    .eq('month', month)

  const totalIncome = incomeRows?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0

  // Variabilní náklady
  const { data: varCostRows } = await supabase
    .from('variable_costs')
    .select('price')
    .eq('month', month)

  const totalVarCosts = varCostRows?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0

  // Fixní náklady (aktivní)
  const { data: fixedRows } = await supabase
    .from('fixed_costs')
    .select('amount')
    .eq('active', true)

  const totalFixedCosts = fixedRows?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0

  // Extra náklady
  const { data: extraRows } = await supabase
    .from('extra_costs')
    .select('amount')
    .eq('month', month)

  const totalExtraCosts = extraRows?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0

  const totalCosts = totalVarCosts + totalFixedCosts + totalExtraCosts

  // Nezaplacené faktury
  const { data: unpaidInvoices } = await supabase
    .from('invoices')
    .select('total')
    .not('status', 'eq', 'paid')

  const unpaidInvoicesCount = unpaidInvoices?.length ?? 0
  const unpaidInvoicesSum = unpaidInvoices?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0

  // Fakturováno tento měsíc
  const { data: invoicedRows } = await supabase
    .from('invoices')
    .select('total')
    .gte('issued_on', from)
    .lte('issued_on', to)

  const invoicedAmount = invoicedRows?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0

  // Nepárované transakce
  const { count: unmatchedCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'unmatched')

  const stats: DashboardStats = {
    totalIncome,
    totalCosts,
    profit: totalIncome - totalCosts,
    invoicedAmount,
    unpaidInvoicesCount,
    unpaidInvoicesSum,
    unmatchedTransactionsCount: unmatchedCount ?? 0,
  }

  // Měsíční data pro graf (6 měsíců)
  const months = getLastNMonths(6)
  const monthlyData: MonthlyData[] = await Promise.all(
    months.map(async (m) => {
      const { data: inc } = await supabase.from('income').select('amount').eq('month', m)
      const { data: vc } = await supabase.from('variable_costs').select('price').eq('month', m)
      const { data: ec } = await supabase.from('extra_costs').select('amount').eq('month', m)
      const income = inc?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
      const costs = (vc?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0)
        + totalFixedCosts
        + (ec?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0)
      return { month: m, label: m, income, costs }
    })
  )

  // Top klienti tento měsíc
  const { data: clientRows } = await supabase
    .from('income')
    .select('client, amount')
    .eq('month', month)

  const clientMap = new Map<string, { total: number; count: number }>()
  for (const r of clientRows ?? []) {
    const existing = clientMap.get(r.client) ?? { total: 0, count: 0 }
    clientMap.set(r.client, { total: existing.total + (r.amount ?? 0), count: existing.count + 1 })
  }
  const topClients: ClientSummary[] = Array.from(clientMap.entries())
    .map(([client, d]) => ({ client, ...d }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // Náklady na člena týmu
  const { data: memberRows } = await supabase
    .from('variable_costs')
    .select('team_member, price, hours')
    .eq('month', month)

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
