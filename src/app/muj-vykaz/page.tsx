'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle2, Clock, Circle, AlertCircle, Loader2 } from 'lucide-react'
import type { Task, TaskStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  zadano: { label: 'Zadáno', icon: Circle, color: 'text-gray-400' },
  v_procesu: { label: 'V procesu', icon: AlertCircle, color: 'text-blue-500' },
  na_checku: { label: 'Na checku', icon: Clock, color: 'text-amber-500' },
  hotovo: { label: 'Hotovo', icon: CheckCircle2, color: 'text-green-500' },
}

export default function MujVykazPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date()
    return `${now.getMonth() + 1},${now.getFullYear()}`
  })

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/tasks?month=${filterMonth}`)
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [filterMonth])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const done = tasks.filter(t => t.status === 'hotovo')
  const inProgress = tasks.filter(t => t.status !== 'hotovo')
  const totalReward = done.reduce((s, t) => s + (t.reward ?? 0) + (t.one_time_reward ?? 0), 0)
  const totalTime = tasks.reduce((s, t) => s + (t.hours ?? 0) + (t.minutes ?? 0) / 60, 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Můj výkaz</h1>
        <input
          type="month"
          onChange={e => {
            const val = e.target.value
            if (val) {
              const [y, m] = val.split('-')
              setFilterMonth(`${parseInt(m)},${y}`)
            }
          }}
          defaultValue={(() => {
            const now = new Date()
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          })()}
          className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Statistiky */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 mb-1">Hotovo</p>
          <p className="text-2xl font-bold text-gray-900">{done.length}</p>
          <p className="text-xs text-gray-400">z {tasks.length} tasků</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 mb-1">Celkový čas</p>
          <p className="text-2xl font-bold text-gray-900">{totalTime.toFixed(1)} h</p>
          <p className="text-xs text-gray-400">odpracováno</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 mb-1">Moje odměna</p>
          <p className="text-2xl font-bold text-green-600">{totalReward.toLocaleString('cs-CZ')} Kč</p>
          <p className="text-xs text-gray-400">za hotové tasky</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Hotové */}
          {done.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">Hotové tasky</h2>
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Task</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Klient</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Typ</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Čas</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Odměna</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {done.map(task => (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span className="font-medium text-gray-900">{task.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{task.client ?? '—'}</td>
                        <td className="px-4 py-3">
                          {task.task_type ? (
                            <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium">
                              {task.task_type}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {((task.hours ?? 0) + (task.minutes ?? 0) / 60).toFixed(2)} h
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">
                          {((task.reward ?? 0) + (task.one_time_reward ?? 0)).toLocaleString('cs-CZ')} Kč
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Celkem</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                        {totalTime.toFixed(2)} h
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                        {totalReward.toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Rozpracované */}
          {inProgress.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">Aktuální tasky</h2>
              <div className="space-y-2">
                {inProgress.map(task => {
                  const Icon = STATUS_CONFIG[task.status].icon
                  return (
                    <div key={task.id} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3">
                      <Icon className={cn('h-4 w-4 flex-shrink-0', STATUS_CONFIG[task.status].color)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{task.title}</p>
                        <p className="text-xs text-gray-400">{task.client ?? ''}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {STATUS_CONFIG[task.status].label}
                      </span>
                      {task.deadline && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(task.deadline).toLocaleDateString('cs-CZ')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Žádné tasky v tomto měsíci</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
