import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: number
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  description?: string
  colorClass?: string
}

export function KpiCard({ title, value, icon: Icon, trend, description, colorClass }: KpiCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn('text-2xl font-bold tracking-tight', colorClass)}>
              {formatCZK(value)}
            </p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn('rounded-lg p-2', colorClass ? 'bg-current/10' : 'bg-primary-50')}>
            <Icon className={cn('h-5 w-5', colorClass ?? 'text-primary-900')} />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <TrendIcon className={cn(
              'h-3 w-3',
              trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : ''
            )} />
            <span>vs. předchozí měsíc</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function KpiCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  )
}
