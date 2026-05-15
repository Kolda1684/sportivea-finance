import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') ?? getCurrentMonth()
  const supabase = createAdminSupabaseClient()

  const [
    { data: incomeRows },
    { data: varRows },
    { data: fixedRows },
    { data: extraRows },
  ] = await Promise.all([
    supabase
      .from('income')
      .select('id, client, project_name, amount, status, billed_to')
      .eq('month', month)
      .order('amount', { ascending: false }),
    supabase
      .from('variable_costs')
      .select('client, team_member, hours, price')
      .eq('month', month),
    supabase
      .from('fixed_costs')
      .select('name, amount')
      .eq('active', true)
      .order('amount', { ascending: false }),
    supabase
      .from('extra_costs')
      .select('name, amount')
      .eq('month', month)
      .order('amount', { ascending: false }),
  ])

  // Pivot: variable costs by client
  const clientMap = new Map<string, { count: number; hours: number; price: number }>()
  for (const r of varRows ?? []) {
    const key = r.client ?? 'Neznámý'
    const e = clientMap.get(key) ?? { count: 0, hours: 0, price: 0 }
    clientMap.set(key, { count: e.count + 1, hours: e.hours + (r.hours ?? 0), price: e.price + (r.price ?? 0) })
  }
  const varByClient = Array.from(clientMap.entries())
    .map(([client, d]) => ({ client, ...d }))
    .sort((a, b) => b.price - a.price)

  // Pivot: variable costs by team member
  const memberMap = new Map<string, { count: number; hours: number; price: number }>()
  for (const r of varRows ?? []) {
    const key = r.team_member ?? 'Neznámý'
    const e = memberMap.get(key) ?? { count: 0, hours: 0, price: 0 }
    memberMap.set(key, { count: e.count + 1, hours: e.hours + (r.hours ?? 0), price: e.price + (r.price ?? 0) })
  }
  const varByMember = Array.from(memberMap.entries())
    .map(([member, d]) => ({ member, ...d }))
    .sort((a, b) => b.price - a.price)

  // Totals
  const totalIncome = (incomeRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalVar    = (varRows ?? []).reduce((s, r) => s + (r.price ?? 0), 0)
  const totalFixed  = (fixedRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalExtra  = (extraRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalCosts  = totalVar + totalFixed + totalExtra
  const profit      = totalIncome - totalCosts
  const margin      = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0

  return NextResponse.json({
    income:     incomeRows ?? [],
    varByClient,
    varByMember,
    fixedCosts: fixedRows ?? [],
    extraCosts: extraRows ?? [],
    totals: { totalIncome, totalVar, totalFixed, totalExtra, totalCosts, profit, margin },
  })
}
