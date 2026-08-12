import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function DashboardLoading() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>

      {/* Výsledek měsíce — drží stejnou výšku jako hotová karta, aby stránka po načtení neposkočila */}
      <section className="rounded-2xl border p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-12 w-64" />
          </div>
          <div className="flex items-end gap-6 sm:gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="mt-6 h-2.5 w-full rounded-full" />
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-28" />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader><Skeleton className="h-5 w-64" /></CardHeader>
        <CardContent><Skeleton className="h-72 w-full" /></CardContent>
      </Card>

      <section className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
