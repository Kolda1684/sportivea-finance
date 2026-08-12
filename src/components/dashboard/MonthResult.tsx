import { formatCZK } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Bucket {
  label: string
  emoji: string
  value: number
  bar: string      // barva proužku
  dot: string      // barva tečky v legendě
}

interface MonthResultProps {
  monthLabel: string
  income: number
  wages: number
  travel: number
  fixed: number
  extra: number
  salaries: number
}

// Výsledek měsíce: první věc, kterou chceš vidět, je jestli jsme v plusu.
// Pod tím rozpad nákladů — proužek ukazuje, kam peníze reálně tečou.
export function MonthResult({ monthLabel, income, wages, travel, fixed, extra, salaries }: MonthResultProps) {
  const buckets: Bucket[] = [
    { label: 'Mzdy',     emoji: '🧑‍💻', value: wages,    bar: 'bg-blue-500',   dot: 'bg-blue-500' },
    { label: 'Platy',    emoji: '👔', value: salaries, bar: 'bg-violet-500', dot: 'bg-violet-500' },
    { label: 'Fixní',    emoji: '🏢', value: fixed,    bar: 'bg-amber-500',  dot: 'bg-amber-500' },
    { label: 'Extra',    emoji: '🧾', value: extra,    bar: 'bg-orange-500', dot: 'bg-orange-500' },
    { label: 'Cestovné', emoji: '🚗', value: travel,   bar: 'bg-teal-500',   dot: 'bg-teal-500' },
  ].filter(b => b.value > 0)

  const costs = wages + travel + fixed + extra + salaries
  const profit = income - costs
  const margin = income > 0 ? Math.round((profit / income) * 100) : null
  const positive = profit >= 0

  // Fixní náklady běží každý měsíc, i v tom, kde se zatím nic nestalo. Bez
  // tohohle rozlišení by budoucí měsíc hlásil poplašnou červenou ztrátu.
  const noActivity = income === 0 && wages + travel + extra + salaries === 0

  if (noActivity) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8">
        <p className="text-sm font-medium text-gray-600">🗓️ Výsledek · {monthLabel}</p>
        <p className="mt-1 text-2xl font-semibold text-gray-700">Zatím žádná aktivita</p>
        <p className="mt-2 text-sm text-gray-500">
          Žádné příjmy ani odvedená práce. Fixní náklady {formatCZK(fixed)} běží dál.
        </p>
      </section>
    )
  }

  return (
    <section
      className={cn(
        'rounded-2xl border p-6 sm:p-8',
        positive ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className={cn('text-sm font-medium', positive ? 'text-emerald-800' : 'text-rose-800')}>
            {positive ? '📈' : '📉'} Výsledek · {monthLabel}
          </p>
          <p
            className={cn(
              'mt-1 text-4xl sm:text-5xl font-bold tracking-tight tabular-nums',
              positive ? 'text-emerald-700' : 'text-rose-700'
            )}
          >
            {positive && '+'}{formatCZK(profit)}
          </p>
        </div>

        <dl className="flex items-end gap-6 sm:gap-8">
          <div>
            <dt className="text-xs font-medium text-emerald-800/70">💰 Příjmy</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-700">{formatCZK(income)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-rose-800/70">💸 Náklady</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-rose-700">{formatCZK(costs)}</dd>
          </div>
          {margin != null && (
            <div>
              <dt className={cn('text-xs font-medium', positive ? 'text-emerald-800/70' : 'text-rose-800/70')}>Marže</dt>
              <dd className={cn('mt-0.5 text-xl font-semibold tabular-nums', positive ? 'text-emerald-700' : 'text-rose-700')}>
                {margin} %
              </dd>
            </div>
          )}
        </dl>
      </div>

      {costs > 0 && (
        <div className="mt-6">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/70" role="presentation">
            {buckets.map(b => (
              <div key={b.label} className={b.bar} style={{ width: `${(b.value / costs) * 100}%` }} />
            ))}
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
            {buckets.map(b => (
              <div key={b.label} className="flex items-center gap-1.5 text-xs">
                <span className={cn('h-2 w-2 rounded-full', b.dot)} aria-hidden />
                <dt className="text-gray-700">{b.emoji} {b.label}</dt>
                <dd className="font-semibold tabular-nums text-gray-900">{formatCZK(b.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  )
}
