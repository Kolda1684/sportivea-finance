'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Filter, ChevronDown, Clock, CheckCircle2, Circle, AlertCircle, Loader2, X, Calendar, User } from 'lucide-react'
import type { Task, TaskStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  zadano: { label: 'Zadáno', icon: Circle, color: 'text-gray-400' },
  v_procesu: { label: 'V procesu', icon: AlertCircle, color: 'text-blue-500' },
  na_checku: { label: 'Na checku', icon: Clock, color: 'text-amber-500' },
  hotovo: { label: 'Hotovo', icon: CheckCircle2, color: 'text-green-500' },
}

const TASK_TYPES = ['Reels', 'Daily', 'Long-form', 'Natáčení', 'Grafika', 'Captions', 'Stories', 'YouTube', 'Jiné']

const STATUS_PILL_COLORS: Record<TaskStatus, string> = {
  zadano: 'bg-gray-100 text-gray-600',
  v_procesu: 'bg-blue-100 text-blue-700',
  na_checku: 'bg-amber-100 text-amber-700',
  hotovo: 'bg-green-100 text-green-700',
}

interface NewTaskForm {
  title: string
  deadline: string
  assignee_id: string
  client: string
  task_type: string
  reward: string
  one_time_reward: string
  hours: string
  minutes: string
  description: string
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'vse'>('vse')
  const [filterMonth, setFilterMonth] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<NewTaskForm>({
    title: '', deadline: '', assignee_id: '', client: '', task_type: '',
    reward: '', one_time_reward: '', hours: '0', minutes: '0', description: '',
  })

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus !== 'vse') params.set('status', filterStatus)
    if (filterMonth) params.set('month', filterMonth)
    const res = await fetch(`/api/tasks?${params}`)
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [filterStatus, filterMonth])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  useEffect(() => {
    // Zjisti roli přes profiles endpoint
    fetch('/api/admin/users').then(r => {
      if (r.ok) {
        setIsAdmin(true)
        r.json().then(setProfiles)
      }
    })
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        deadline: form.deadline || null,
        assignee_id: form.assignee_id || null,
        client: form.client || null,
        task_type: form.task_type || null,
        reward: form.reward ? Number(form.reward) : null,
        one_time_reward: form.one_time_reward ? Number(form.one_time_reward) : null,
        hours: Number(form.hours) || 0,
        minutes: Number(form.minutes) || 0,
        description: form.description || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setShowNewModal(false)
      setForm({ title: '', deadline: '', assignee_id: '', client: '', task_type: '', reward: '', one_time_reward: '', hours: '0', minutes: '0', description: '' })
      fetchTasks()
    }
  }

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
  }

  const totalReward = tasks.filter(t => t.status === 'hotovo').reduce((s, t) => s + (t.reward ?? 0) + (t.one_time_reward ?? 0), 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Hlavička */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasky</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tasks.length} úkolů{isAdmin && ` · ${totalReward.toLocaleString('cs-CZ')} Kč hotovo`}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filtr měsíc */}
          <input
            type="month"
            value={filterMonth}
            onChange={e => {
              const val = e.target.value
              if (val) {
                const [y, m] = val.split('-')
                setFilterMonth(`${parseInt(m)},${y}`)
              } else {
                setFilterMonth('')
              }
            }}
            className="text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {isAdmin && (
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nový task
            </button>
          )}
        </div>
      </div>

      {/* Status filtry */}
      <div className="flex gap-2 mb-4">
        {(['vse', 'zadano', 'v_procesu', 'na_checku', 'hotovo'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filterStatus === s
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {s === 'vse' ? 'Vše' : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Tabulka tasků */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Žádné tasky</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Task</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Deadline</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Klient</th>
                {isAdmin && <th className="text-right px-4 py-3 font-medium text-gray-500">Odměna</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-500">Typ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Editor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tasks.map(task => {
                const StatusIcon = STATUS_CONFIG[task.status].icon
                return (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={cn('h-4 w-4 flex-shrink-0', STATUS_CONFIG[task.status].color)} />
                        <span className="font-medium text-gray-900">{task.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {task.deadline ? new Date(task.deadline).toLocaleDateString('cs-CZ') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_PILL_COLORS[task.status])}>
                        {STATUS_CONFIG[task.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{task.client ?? '—'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {((task.reward ?? 0) + (task.one_time_reward ?? 0)).toLocaleString('cs-CZ')} Kč
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {task.task_type ? (
                        <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs font-medium">
                          {task.task_type}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {(task.assignee as unknown as { name?: string })?.name ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail tasku */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isAdmin={isAdmin}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleStatusChange}
          onRefresh={fetchTasks}
        />
      )}

      {/* Nový task modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">Nový task</h2>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Název *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Název tasku"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Typ</label>
                  <select
                    value={form.task_type}
                    onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— vybrat —</option>
                    {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Klient</label>
                  <input
                    value={form.client}
                    onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                    placeholder="Fortuna liga žen"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Přiřadit</label>
                  <select
                    value={form.assignee_id}
                    onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— vybrat —</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Odměna (Kč)</label>
                  <input
                    type="number"
                    value={form.reward}
                    onChange={e => setForm(f => ({ ...f, reward: e.target.value }))}
                    placeholder="0"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Jednorázová odměna</label>
                  <input
                    type="number"
                    value={form.one_time_reward}
                    onChange={e => setForm(f => ({ ...f, one_time_reward: e.target.value }))}
                    placeholder="0"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Hodiny</label>
                  <input
                    type="number"
                    min="0"
                    value={form.hours}
                    onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Minuty</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={form.minutes}
                    onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Popis</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Volitelný popis tasku..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Vytvořit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskDetailModal({
  task,
  isAdmin,
  onClose,
  onStatusChange,
  onRefresh,
}: {
  task: Task
  isAdmin: boolean
  onClose: () => void
  onStatusChange: (id: string, status: TaskStatus) => void
  onRefresh: () => void
}) {
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<{ id: string; author_name: string | null; content: string; created_at: string }[]>([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [sendingComment, setSendingComment] = useState(false)

  useEffect(() => {
    fetch(`/api/tasks/${task.id}`).then(r => r.json()).then(data => {
      setComments(data.comments ?? [])
      setLoadingComments(false)
    })
  }, [task.id])

  async function sendComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setSendingComment(true)
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: comment }),
    })
    if (res.ok) {
      const newComment = await res.json()
      setComments(prev => [...prev, newComment])
      setComment('')
    }
    setSendingComment(false)
  }

  const totalTime = (task.hours ?? 0) + (task.minutes ?? 0) / 60
  const totalReward = (task.reward ?? 0) + (task.one_time_reward ?? 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex-1 pr-4">
            <h2 className="font-semibold text-gray-900 text-lg">{task.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {task.client && <span className="mr-3">{task.client}</span>}
              {task.month && <span>Měsíc: {task.month}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <select
                value={task.status}
                onChange={e => onStatusChange(task.id, e.target.value as TaskStatus)}
                className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Deadline</p>
              <p className="font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                {task.deadline ? new Date(task.deadline).toLocaleDateString('cs-CZ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Editor</p>
              <p className="font-medium flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-gray-400" />
                {(task.assignee as unknown as { name?: string })?.name ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Typ</p>
              <p className="font-medium">{task.task_type ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Čas</p>
              <p className="font-medium">{totalTime.toFixed(2)} h ({task.hours ?? 0}h {task.minutes ?? 0}m)</p>
            </div>
            {isAdmin && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Odměna</p>
                <p className="font-medium text-green-700">{totalReward.toLocaleString('cs-CZ')} Kč</p>
              </div>
            )}
          </div>

          {task.description && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Popis</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Komentáře */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-3">Komentáře</p>
            {loadingComments ? (
              <p className="text-xs text-gray-400">Načítám...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-gray-400">Zatím žádné komentáře</p>
            ) : (
              <div className="space-y-3 mb-3">
                {comments.map(c => (
                  <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{c.author_name ?? 'Neznámý'}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(c.created_at).toLocaleDateString('cs-CZ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={sendComment} className="flex gap-2">
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Napsat komentář..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={sendingComment || !comment.trim()}
                className="bg-gray-900 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60"
              >
                {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Odeslat'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
