import { Skeleton } from '@/components/ui/skeleton'
import { KpiCardSkeleton } from '@/components/dashboard/KpiCard'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function DashboardLoading() {
  return (
    <div className="p-8 space-y-8">
      {/* Hlavička */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>

      {/* KPI karty */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>

      {/* Výsledek měsíce */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-900">
          <Skeleton className="h-4 w-32 bg-gray-700" />
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-200">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-6 py-5 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      </div>

      {/* Variabilní náklady — dvě tabulky */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-900">
          <Skeleton className="h-4 w-40 bg-gray-700" />
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          {Array.from({ length: 2 }).map((_, col) => (
            <div key={col} className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className="flex justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Souhrn nákladů */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* YTD */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>

      {/* Graf */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[280px] w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
