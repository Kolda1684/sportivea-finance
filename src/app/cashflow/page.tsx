import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { getCurrentMonth, formatCZK, formatDate, formatMonth, getLastNMonths, monthBounds } from '@/lib/utils'
import { getFioBalances, type FioBalance } from '@/lib/fio'
import { MonthSelectorClient } from '@/components/dashboard/MonthSelectorClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Clock, Banknote, RefreshCw, Landmark, CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PENDING_STATUSES = ['cekame', 'potvrzeno', 'vystaveno']

const STATUS_LABEL: Record<string, string> = {
  cekame: 'Čekáme',
  potvrzeno: 'Potvrzeno',
  vystaveno: 'Vystaveno',
}

const STATUS_CLASS: Record<string, string> = {
  cekame: 'bg-yellow-100 text-yellow-800',
  potvrzeno: 'bg-blue-100 text-blue-800',
  vystaveno: 'bg-purple-100 text-purple-800',
}

async function getCashflowData(month: string) {
  const supabase = createAdminSupabaseClient()
  const { from, to } = monthBounds(month)

  const [
    fakturoidPaidRes,   // faktury zaplacené ve Fakturoidu (paid_on v daném měsíci)
    manualPaidRes,      // příjmy ručně označené jako zaplaceno
    pendingIncomeRes,   // pohledávky (income čeká na zaplacení)
    varRes, fixedRes, extraRes,
  ] = await Promise.all([
    supabase.from('invoices').select('number, subject_name, total, paid_on').eq('status', 'paid').gte('paid_on', from).lte('paid_on', to),
    supabase.from('income').select('amount, client, project_name').eq('month', month).eq('status', 'zaplaceno'),
    supabase.from('income').select('id, amount, client, project_name, date, status, month').in('status', PENDING_STATUSES).order('date', { ascending: false }),
    supabase.from('variable_costs').select('price').eq('month', month),
    supabase.from('fixed_costs').select('amount').eq('active', true),
    supabase.from('extra_costs').select('amount').eq('month', month),
  ])

  const fakturoidCashIn = fakturoidPaidRes.data?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0
  const manualCashIn = manualPaidRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0

  // Použij Fakturoid jako primární zdroj; pokud není žádná data, fall-back na ruční
  const hasFakturoidData = (fakturoidPaidRes.data?.length ?? 0) > 0
  const cashIn = hasFakturoidData ? fakturoidCashIn : manualCashIn

  const cashOut = (varRes.data?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0)
    + (fixedRes.data?.reduce((s, r) => s + r.amount, 0) ?? 0)
    + (extraRes.data?.reduce((s, r) => s + r.amount, 0) ?? 0)

  const pendingTotal = pendingIncomeRes.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0

  // Trend posledních 6 měsíců — preferuje Fakturoid paid_on, jinak income.zaplaceno
  const last6 = getLastNMonths(6)
  const trend = await Promise.all(last6.map(async (m) => {
    const { from: mFrom, to: mTo } = monthBounds(m)
    const [fPaid, mPaid, costs, fix, ext] = await Promise.all([
      supabase.from('invoices').select('total').eq('status', 'paid').gte('paid_on', mFrom).lte('paid_on', mTo),
      supabase.from('income').select('amount').eq('month', m).eq('status', 'zaplaceno'),
      supabase.from('variable_costs').select('price').eq('month', m),
      supabase.from('fixed_costs').select('amount').eq('active', true),
      supabase.from('extra_costs').select('amount').eq('month', m),
    ])
    const fTotal = fPaid.data?.reduce((s, r) => s + (r.total ?? 0), 0) ?? 0
    const mTotal = mPaid.data?.reduce((s, r) => s + (r.amount ?? 0), 0) ?? 0
    const income = fTotal > 0 ? fTotal : mTotal
    const expense = (costs.data?.reduce((s, r) => s + (r.price ?? 0), 0) ?? 0)
      + (fix.data?.reduce((s, r) => s + r.amount, 0) ?? 0)
      + (ext.data?.reduce((s, r) => s + r.amount, 0) ?? 0)
    return { month: m, income, fTotal, mTotal, expense, net: income - expense }
  }))

  return {
    cashIn,
    cashOut,
    net: cashIn - cashOut,
    pendingTotal,
    pendingItems: pendingIncomeRes.data ?? [],
    fakturoidItems: fakturoidPaidRes.data ?? [],
    manualItems: manualPaidRes.data ?? [],
    hasFakturoidData,
    trend,
  }
}

// ── 3měsíční výhled ──────────────────────────────────────────────────────────
// Očekávané příjmy = neuhrazené vydané faktury podle splatnosti (po splatnosti
// se počítají do aktuálního měsíce). Očekávané výdaje = fixní + průměr
// (mzdy+cestovné+extra) a platů majitelů za poslední 3 měsíce.

interface OutlookMonth {
  month: string
  expectedIn: number
  expectedOut: number
  net: number
  projectedBalance: number
}

async function getOutlook(totalBalance: number | null) {
  const supabase = createAdminSupabaseClient()
  const now = new Date()
  const nextMonths: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    nextMonths.push(`${d.getMonth() + 1},${d.getFullYear()}`)
  }
  const last3: string[] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    last3.push(`${d.getMonth() + 1},${d.getFullYear()}`)
  }

  const [unpaidRes, varRes, extraRes, salRes, fixedRes, syncRes] = await Promise.all([
    supabase.from('invoices').select('total, due_on').neq('status', 'paid'),
    supabase.from('variable_costs').select('month, price').in('month', last3),
    supabase.from('extra_costs').select('month, amount').in('month', last3),
    supabase.from('owner_salaries').select('month, amount').in('month', last3),
    supabase.from('fixed_costs').select('amount').eq('active', true),
    supabase.from('invoices').select('synced_at').order('synced_at', { ascending: false }).limit(1),
  ])
  const lastInvoiceSync = syncRes.data?.[0]?.synced_at ?? null
  const syncAgeHours = lastInvoiceSync ? (Date.now() - new Date(lastInvoiceSync).getTime()) / 3_600_000 : null

  const fixedMonthly = (fixedRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const avg = (rows: { month: string; total: number }[]) =>
    last3.length ? rows.reduce((s, r) => s + r.total, 0) / last3.length : 0
  const varAvg = avg(last3.map(m => ({ month: m, total: (varRes.data ?? []).filter(r => r.month === m).reduce((s, r) => s + Number(r.price ?? 0), 0) })))
  const extraAvg = avg(last3.map(m => ({ month: m, total: (extraRes.data ?? []).filter(r => r.month === m).reduce((s, r) => s + Number(r.amount ?? 0), 0) })))
  const salAvg = avg(last3.map(m => ({ month: m, total: (salRes.data ?? []).filter(r => r.month === m).reduce((s, r) => s + Number(r.amount ?? 0), 0) })))
  const expectedOutMonthly = fixedMonthly + varAvg + extraAvg + salAvg

  // Neuhrazené faktury do měsíců podle splatnosti; po splatnosti → aktuální měsíc
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const inByMonth = new Map<string, number>(nextMonths.map(m => [m, 0]))
  let overdue = 0
  for (const inv of unpaidRes.data ?? []) {
    const due = inv.due_on ? new Date(inv.due_on) : null
    const total = Number(inv.total ?? 0)
    if (!due || due < monthStart) { overdue += total; continue }
    const key = `${due.getMonth() + 1},${due.getFullYear()}`
    if (inByMonth.has(key)) inByMonth.set(key, (inByMonth.get(key) ?? 0) + total)
    // splatnost za horizontem 3 měsíců se do výhledu nepočítá
  }
  inByMonth.set(nextMonths[0], (inByMonth.get(nextMonths[0]) ?? 0) + overdue)

  let running = totalBalance ?? 0
  const months: OutlookMonth[] = nextMonths.map(m => {
    const expectedIn = inByMonth.get(m) ?? 0
    const net = expectedIn - expectedOutMonthly
    running += net
    return { month: m, expectedIn, expectedOut: expectedOutMonthly, net, projectedBalance: running }
  })

  return { months, overdue, expectedOutMonthly, hasBalance: totalBalance != null, lastInvoiceSync, syncAgeHours }
}

export default async function CashflowPage({ searchParams }: { searchParams: { month?: string } }) {
  const month = searchParams.month ?? getCurrentMonth()
  const [d, balances] = await Promise.all([getCashflowData(month), getFioBalances()])
  const totalBalance = balances.length > 0 ? balances.reduce((s, b) => s + b.balance, 0) : null
  const outlook = await getOutlook(totalBalance)
  const monthLabel = formatMonth(month).charAt(0).toUpperCase() + formatMonth(month).slice(1)
  const maxTrend = Math.max(...d.trend.map(t => Math.max(t.income, t.expense)), 1)

  return (
    <div className="p-8 space-y-8">
      {/* Hlavička */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash flow</h1>
          <p className="text-sm text-gray-500 mt-1">Skutečné peněžní toky — kdy peníze přišly na účet, ne kdy vznikl nárok</p>
        </div>
        <MonthSelectorClient currentMonth={month} basePath="/cashflow" />
      </div>

      {/* Zůstatky na účtech (Fio, živě) */}
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Landmark className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Na účtech teď (Fio)</p>
                <p className="text-2xl font-bold text-blue-900">
                  {totalBalance != null ? formatCZK(totalBalance) : 'Nedostupné'}
                </p>
              </div>
            </div>
            <div className="flex gap-6">
              {balances.map(b => (
                <div key={b.envKey} className="text-right">
                  <p className="text-xs text-muted-foreground font-mono">{b.accountId}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatCZK(b.balance)}</p>
                </div>
              ))}
              {balances.length === 0 && (
                <p className="text-xs text-muted-foreground max-w-[220px]">
                  Fio API teď neodpovídá (limit 1 dotaz/30 s) — obnov stránku za chvíli.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3měsíční výhled */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-blue-500" />
            Výhled na 3 měsíce
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Příjmy = neuhrazené vydané faktury podle splatnosti{outlook.overdue > 0 && <> (z toho <span className="font-semibold text-orange-600">{formatCZK(outlook.overdue)} po splatnosti</span>, počítáno do aktuálního měsíce)</>}.
            Výdaje = fixní + průměr mezd, extra a platů za poslední 3 měsíce ({formatCZK(outlook.expectedOutMonthly)}/měsíc).
          </p>
          {outlook.syncAgeHours != null && outlook.syncAgeHours > 48 ? (
            <p className="text-xs font-semibold text-red-600 mt-1">
              ⚠ Faktury naposledy synchronizované {formatDate(outlook.lastInvoiceSync!)} — data můžou být zastaralá! Zkontroluj cron na Vercelu.
            </p>
          ) : outlook.lastInvoiceSync && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Faktury synchronizované {formatDate(outlook.lastInvoiceSync)}.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                <th className="pb-2 text-left font-semibold">Měsíc</th>
                <th className="pb-2 text-right font-semibold">Očekávané příjmy</th>
                <th className="pb-2 text-right font-semibold">Očekávané výdaje</th>
                <th className="pb-2 text-right font-semibold">Netto</th>
                {outlook.hasBalance && <th className="pb-2 text-right font-semibold">Zůstatek na konci</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {outlook.months.map(m => (
                <tr key={m.month} className="hover:bg-gray-50/70">
                  <td className="py-2.5 font-medium capitalize">{formatMonth(m.month)}</td>
                  <td className="py-2.5 text-right tabular-nums text-green-700">{formatCZK(m.expectedIn)}</td>
                  <td className="py-2.5 text-right tabular-nums text-red-600">{formatCZK(m.expectedOut)}</td>
                  <td className={cn('py-2.5 text-right tabular-nums font-semibold', m.net >= 0 ? 'text-green-700' : 'text-red-600')}>
                    {m.net >= 0 ? '+' : ''}{formatCZK(m.net)}
                  </td>
                  {outlook.hasBalance && (
                    <td className={cn('py-2.5 text-right tabular-nums font-bold', m.projectedBalance >= 0 ? 'text-blue-900' : 'text-red-600')}>
                      {formatCZK(m.projectedBalance)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            ⚠ Odhad — nepočítá s budoucími fakturami, které ještě nejsou vystavené, ani s DPH.
          </p>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-100 p-2">
                <TrendingUp className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Přijato — {monthLabel}
                  {d.hasFakturoidData && <span className="ml-1 text-blue-500">(Fakturoid)</span>}
                </p>
                <p className="text-xl font-bold text-green-700">{formatCZK(d.cashIn)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vydáno — {monthLabel}</p>
                <p className="text-xl font-bold text-red-600">{formatCZK(d.cashOut)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className={cn('rounded-lg p-2', d.net >= 0 ? 'bg-blue-100' : 'bg-red-100')}>
                <Banknote className={cn('h-5 w-5', d.net >= 0 ? 'text-blue-700' : 'text-red-600')} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Čistý cashflow</p>
                <p className={cn('text-xl font-bold', d.net >= 0 ? 'text-blue-700' : 'text-red-600')}>
                  {formatCZK(d.net)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={d.pendingTotal > 0 ? 'border-orange-200' : ''}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pohledávky celkem</p>
                <p className="text-xl font-bold text-orange-600">{formatCZK(d.pendingTotal)}</p>
                <p className="text-xs text-muted-foreground">{d.pendingItems.length} faktur čeká</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zdroje cash-in vedle sebe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fakturoid zaplacené faktury */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-500" />
              Zaplaceno přes Fakturoid — {monthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.fakturoidItems.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-sm text-muted-foreground">Žádné faktury s datem zaplacení v tomto měsíci.</p>
                <p className="text-xs text-muted-foreground">Spusť sync Fakturoidu aby se data aktualizovala.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 text-left">Č. faktury</th>
                    <th className="pb-2 text-left">Klient</th>
                    <th className="pb-2 text-left">Zaplaceno</th>
                    <th className="pb-2 text-right">Částka</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.fakturoidItems.map((inv, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 text-muted-foreground text-xs font-mono">{inv.number ?? '—'}</td>
                      <td className="py-2 font-medium text-xs">{inv.subject_name ?? '—'}</td>
                      <td className="py-2 text-muted-foreground text-xs">{inv.paid_on ? formatDate(inv.paid_on) : '—'}</td>
                      <td className="py-2 text-right font-bold text-green-700">{formatCZK(inv.total ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={3} className="py-2 text-xs font-semibold text-muted-foreground">CELKEM</td>
                    <td className="py-2 text-right font-bold text-green-700">
                      {formatCZK(d.fakturoidItems.reduce((s, r) => s + (r.total ?? 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Ručně označené jako zaplaceno */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Ručně označeno zaplaceno — {monthLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.manualItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Žádné příjmy označené jako Zaplaceno v tomto měsíci.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 text-left">Klient</th>
                    <th className="pb-2 text-left">Projekt</th>
                    <th className="pb-2 text-right">Částka</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.manualItems.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 font-medium">{item.client}</td>
                      <td className="py-2 text-muted-foreground text-xs">{item.project_name}</td>
                      <td className="py-2 text-right font-bold text-green-700">{formatCZK(item.amount ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={2} className="py-2 text-xs font-semibold text-muted-foreground">CELKEM</td>
                    <td className="py-2 text-right font-bold text-green-700">
                      {formatCZK(d.manualItems.reduce((s, r) => s + (r.amount ?? 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend graf */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend — posledních 6 měsíců</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {d.trend.map((t) => {
              const mLabel = formatMonth(t.month)
              const incWidth = Math.round((t.income / maxTrend) * 100)
              const expWidth = Math.round((t.expense / maxTrend) * 100)
              const isCurrentMonth = t.month === month
              const sourceNote = t.fTotal > 0 ? 'Fakturoid' : t.mTotal > 0 ? 'ruční' : null
              return (
                <div key={t.month} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn('text-muted-foreground', isCurrentMonth && 'text-gray-900 font-semibold')}>
                      {mLabel.charAt(0).toUpperCase() + mLabel.slice(1)}
                      {sourceNote && <span className="ml-1 text-gray-400">({sourceNote})</span>}
                    </span>
                    <span className={cn('font-medium', t.net >= 0 ? 'text-green-700' : 'text-red-600')}>
                      {t.net >= 0 ? '+' : ''}{formatCZK(t.net)}
                    </span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${incWidth}%` }} />
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${expWidth}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="text-green-700">↑ {formatCZK(t.income)}</span>
                    <span className="text-red-500">↓ {formatCZK(t.expense)}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />Přijato</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" />Vydáno</span>
          </div>
        </CardContent>
      </Card>

      {/* Pohledávky */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            Pohledávky — čeká na zaplacení
          </CardTitle>
        </CardHeader>
        <CardContent>
          {d.pendingItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Všechny faktury jsou zaplaceny 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 text-left">Klient</th>
                  <th className="pb-2 text-left">Projekt</th>
                  <th className="pb-2 text-left">Měsíc</th>
                  <th className="pb-2 text-left">Status</th>
                  <th className="pb-2 text-right">Částka</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {d.pendingItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-2.5 font-medium">{item.client}</td>
                    <td className="py-2.5 text-muted-foreground text-xs">{item.project_name}</td>
                    <td className="py-2.5 text-muted-foreground text-xs">{item.month}</td>
                    <td className="py-2.5">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLASS[item.status] ?? 'bg-gray-100 text-gray-700')}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold text-orange-600">
                      {item.amount != null ? formatCZK(item.amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-gray-50">
                <tr>
                  <td colSpan={4} className="py-2.5 text-xs font-semibold text-muted-foreground">CELKEM POHLEDÁVKY</td>
                  <td className="py-2.5 text-right font-bold text-orange-600">{formatCZK(d.pendingTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
