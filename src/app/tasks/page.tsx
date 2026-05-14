'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Loader2, ChevronDown, X, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

type TaskStatus = 'zadano' | 'v_procesu' | 'na_checku' | 'hotovo'

interface Task {
  id: string
  title: string
  deadline: string | null
  status: TaskStatus
  client: string | null
  company_id: string | null
  hours: number
  minutes: number
  reward: number | null
  one_time_reward: number | null
  task_type: string | null
  month: string | null
  assignee_id: string | null
  assignee?: { id: string; name: string } | null
}

interface Profile { id: string; name: string; role: string }
interface Company { id: string; name: string }

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; dot: string }> = {
  zadano:    { label: 'Not Started', color: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400' },
  v_procesu: { label: 'V procesu',   color: 'bg-blue-50 text-blue-600',    dot: 'bg-blue-500' },
  na_checku: { label: 'Na checku',   color: 'bg-orange-50 text-orange-600',dot: 'bg-orange-400' },
  hotovo:    { label: 'Hotovo',      color: 'bg-green-50 text-green-600',  dot: 'bg-green-500' },
}

const TASK_TYPES = ['Reels', 'Daily', 'Long-form', 'Natáčení', 'Grafika', 'Captions', 'Stories', 'YouTube', 'Jiné']
const STATUSES = Object.keys(STATUS_CONFIG) as TaskStatus[]

// ────────────────────────────────────────────────────────────
// Inline editovatelná buňka
// ────────────────────────────────────────────────────────────
function Cell({
  value,
  type = 'text',
  options,
  placeholder = '—',
  onSave,
  className = '',
  readOnly = false,
}: {
  value: string | number | null
  type?: 'text' | 'number' | 'date' | 'select'
  options?: string[]
  placeholder?: string
  onSave?: (v: string) => void
  className?: string
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement & HTMLSelectElement>(null)

  useEffect(() => { setDraft(String(value ?? '')) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit(val: string) {
    setEditing(false)
    if (val !== String(value ?? '') && onSave) onSave(val)
  }

  function displayValue() {
    if (value === null || value === '' || value === undefined) return null
    if (type === 'date') {
      return new Date(String(value)).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
    return String(value)
  }

  if (readOnly) {
    return (
      <div className={cn('px-2 py-1.5 text-sm text-gray-400', className)}>
        {displayValue() ?? placeholder}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className={cn(
          'px-2 py-1.5 text-sm cursor-text rounded hover:bg-gray-50 min-h-[30px] flex items-center',
          !displayValue() && 'text-gray-300',
          className
        )}
      >
        {displayValue() ?? placeholder}
      </div>
    )
  }

  if (type === 'select' && options) {
    return (
      <select
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border-0 outline-none bg-white focus:ring-1 focus:ring-blue-400 rounded"
      >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') commit(draft)
        if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false) }
      }}
      className="w-full px-2 py-1.5 text-sm border-0 outline-none bg-white focus:ring-1 focus:ring-blue-400 rounded"
    />
  )
}

// Status badge s dropdownem
function StatusCell({ value, onSave, readOnly }: { value: TaskStatus; onSave?: (v: TaskStatus) => void; readOnly?: boolean }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[value]

  if (readOnly) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', cfg.color)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
        {cfg.label}
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium hover:opacity-80 transition-opacity', cfg.color)}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
        {cfg.label}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[140px]">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => { onSave?.(s); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 hover:bg-gray-50',
                  s === value && 'bg-gray-50'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STATUS_CONFIG[s].dot)} />
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Klient dropdown (z CRM companies)
function ClientCell({
  value,
  companies,
  onSave,
  readOnly,
}: {
  value: string | null
  companies: Company[]
  onSave?: (v: string) => void
  readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)

  if (readOnly) {
    return <div className="px-2 py-1.5 text-sm text-gray-400">{value ?? '—'}</div>
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'px-2 py-1.5 text-sm rounded hover:bg-gray-50 w-full text-left flex items-center gap-1',
          !value && 'text-gray-300'
        )}
      >
        {value || '—'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[180px] max-h-48 overflow-y-auto">
            <button
              onClick={() => { onSave?.(''); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
            >
              — žádný klient —
            </button>
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => { onSave?.(c.name); setOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50',
                  value === c.name && 'font-medium text-gray-900'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Hlavní stránka
// ────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [me, setMe] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('')
  const [newRowDraft, setNewRowDraft] = useState<{ title: string; assignee_id: string } | null>(null)
  const [savingNew, setSavingNew] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const newTitleRef = useRef<HTMLInputElement>(null)

  // Načti aktuálního uživatele a profily
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(data => {
      if (data) setMe(data)
    })
    fetch('/api/admin/users').then(r => {
      if (r.ok) {
        setIsAdmin(true)
        r.json().then(setProfiles)
      }
    })
    fetch('/api/companies').then(r => r.ok ? r.json() : []).then(setCompanies)
  }, [])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterMonth) params.set('month', filterMonth)
    if (filterStatus) params.set('status', filterStatus)
    const res = await fetch(`/api/tasks?${params}`)
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [filterMonth, filterStatus])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Inline update jednoho pole
  async function updateField(taskId: string, field: string, value: string | number | null) {
    const body: Record<string, unknown> = { [field]: value }
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updated } : t))
    }
  }

  // Vytvoř nový task (inline)
  async function createTask() {
    if (!newRowDraft?.title.trim()) {
      setNewRowDraft(null)
      return
    }
    setSavingNew(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newRowDraft.title,
        assignee_id: newRowDraft.assignee_id || me?.id || null,
      }),
    })
    if (res.ok) {
      const task = await res.json()
      setTasks(prev => [...prev, task])
    }
    setNewRowDraft(null)
    setSavingNew(false)
  }

  function startNewRow() {
    setNewRowDraft({ title: '', assignee_id: me?.id ?? '' })
    setTimeout(() => newTitleRef.current?.focus(), 50)
  }

  // Sumy pro footer
  const totalReward = tasks.reduce((s, t) => s + (t.reward ?? 0) + (t.one_time_reward ?? 0), 0)
  const totalHours = tasks.reduce((s, t) => s + (t.hours ?? 0) + (t.minutes ?? 0) / 60, 0)
  const doneCount = tasks.filter(t => t.status === 'hotovo').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-3 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Tasky</h1>
          <button
            onClick={startNewRow}
            className="flex items-center gap-1.5 bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nový task
          </button>
        </div>

        {/* Filtry */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtr měsíc */}
          <input
            type="month"
            onChange={e => {
              const val = e.target.value
              if (val) { const [y, m] = val.split('-'); setFilterMonth(`${parseInt(m)},${y}`) }
              else setFilterMonth('')
            }}
            className="text-xs border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400 text-gray-600"
          />

          {/* Filtr status */}
          <div className="flex gap-1">
            {(['', ...STATUSES] as (TaskStatus | '')[]).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  filterStatus === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                )}
              >
                {s === '' ? 'Vše' : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabulka */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          </div>
        ) : (
          <table className="w-full text-sm border-collapse border border-gray-200">
            <thead>
              <tr className="bg-gray-50 sticky top-0 z-10">
                <th className="border border-gray-200 px-3 py-2 font-medium text-gray-500 text-xs w-8 text-left">#</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs min-w-[200px] text-left">Task</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[110px] text-left">Deadline</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[160px] text-left">Klient</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[100px] text-left">Typ</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[60px] text-right">Hod.</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[60px] text-right">Min.</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[80px] text-left">Měsíc</th>
                <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[130px] text-left">Status</th>
                {isAdmin && <>
                  <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[80px] text-right">Jednor.</th>
                  <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[80px] text-right">Odměna</th>
                  <th className="border border-gray-200 px-2 py-2 font-medium text-gray-500 text-xs w-[110px] text-left">Editor</th>
                </>}
                <th className="border border-gray-200 w-8" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => (
                <tr key={task.id} className="group hover:bg-blue-50/30 transition-colors">
                  {/* Číslo */}
                  <td className="border border-gray-200 px-3 py-0 text-xs text-gray-300 select-none bg-gray-50/50">{i + 1}</td>

                  {/* Název */}
                  <td className="border border-gray-200 px-0 py-0">
                    <div className="flex items-center">
                      <Cell
                        value={task.title}
                        onSave={v => updateField(task.id, 'title', v)}
                        placeholder="Název tasku"
                        className="flex-1 font-medium text-gray-900"
                      />
                      <button
                        onClick={() => setDetailTask(task)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 transition-opacity flex-shrink-0 px-1"
                        title="Detail"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* Deadline */}
                  <td className="border border-gray-200 px-0 py-0">
                    <Cell
                      value={task.deadline}
                      type="date"
                      onSave={v => updateField(task.id, 'deadline', v || null)}
                      placeholder="—"
                      className="text-gray-500"
                    />
                  </td>

                  {/* Klient */}
                  <td className="border border-gray-200 px-0 py-0">
                    <ClientCell
                      value={task.client}
                      companies={companies}
                      onSave={v => updateField(task.id, 'client', v || null)}
                    />
                  </td>

                  {/* Typ */}
                  <td className="border border-gray-200 px-0 py-0">
                    <Cell
                      value={task.task_type}
                      type="select"
                      options={TASK_TYPES}
                      onSave={v => updateField(task.id, 'task_type', v || null)}
                      placeholder="—"
                      className="text-gray-500"
                    />
                  </td>

                  {/* Hodiny */}
                  <td className="border border-gray-200 px-0 py-0">
                    <Cell
                      value={task.hours || null}
                      type="number"
                      onSave={v => updateField(task.id, 'hours', v ? Number(v) : 0)}
                      placeholder="0"
                      className="text-gray-700 text-right"
                    />
                  </td>

                  {/* Minuty */}
                  <td className="border border-gray-200 px-0 py-0">
                    <Cell
                      value={task.minutes || null}
                      type="number"
                      onSave={v => updateField(task.id, 'minutes', v ? Number(v) : 0)}
                      placeholder="0"
                      className="text-gray-700 text-right"
                    />
                  </td>

                  {/* Měsíc */}
                  <td className="border border-gray-200 px-2 py-1 text-xs text-gray-400">{task.month ?? '—'}</td>

                  {/* Status */}
                  <td className="border border-gray-200 px-2 py-1">
                    <StatusCell
                      value={task.status}
                      onSave={v => updateField(task.id, 'status', v)}
                    />
                  </td>

                  {/* Admin-only sloupce */}
                  {isAdmin && <>
                    <td className="border border-gray-200 px-0 py-0">
                      <Cell
                        value={task.one_time_reward || null}
                        type="number"
                        onSave={v => updateField(task.id, 'one_time_reward', v ? Number(v) : null)}
                        placeholder="0"
                        className="text-right text-gray-700"
                      />
                    </td>
                    <td className="border border-gray-200 px-0 py-0">
                      <Cell
                        value={task.reward || null}
                        type="number"
                        onSave={v => updateField(task.id, 'reward', v ? Number(v) : null)}
                        placeholder="0"
                        className="text-right font-semibold text-gray-900"
                      />
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-xs text-gray-500">
                      {task.assignee?.name ?? '—'}
                    </td>
                  </>}

                  {/* Smazat (admin) */}
                  <td className="border border-gray-200 px-1 py-0 text-center">
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          if (!confirm('Smazat task?')) return
                          await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
                          setTasks(prev => prev.filter(t => t.id !== task.id))
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Nový task – inline řádek */}
              {newRowDraft !== null && (
                <tr className="bg-blue-50/40">
                  <td className="border border-gray-200 px-3 py-1 text-xs text-gray-300 bg-gray-50/50">*</td>
                  <td className="border border-gray-200 px-1 py-1" colSpan={isAdmin ? 8 : 7}>
                    <input
                      ref={newTitleRef}
                      value={newRowDraft.title}
                      onChange={e => setNewRowDraft(d => d ? { ...d, title: e.target.value } : d)}
                      onBlur={createTask}
                      onKeyDown={e => {
                        if (e.key === 'Enter') createTask()
                        if (e.key === 'Escape') setNewRowDraft(null)
                      }}
                      placeholder="Název tasku… (Enter pro uložení)"
                      className="w-full px-2 py-1 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                    />
                  </td>
                  {isAdmin && (
                    <td className="border border-gray-200 px-1 py-1">
                      <select
                        value={newRowDraft.assignee_id}
                        onChange={e => setNewRowDraft(d => d ? { ...d, assignee_id: e.target.value } : d)}
                        className="w-full border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">— editor —</option>
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="border border-gray-200 text-center">
                    {savingNew && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 mx-auto" />}
                  </td>
                </tr>
              )}
            </tbody>

            {/* Footer se sumami */}
            {tasks.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-3 py-2" />
                  <td className="border border-gray-200 px-2 py-2 text-xs text-gray-500">
                    COUNT <span className="font-semibold text-gray-700">{tasks.length}</span>
                    <span className="ml-2 text-green-600 font-medium">{doneCount} hotovo</span>
                  </td>
                  <td className="border border-gray-200" />
                  <td className="border border-gray-200" />
                  <td className="border border-gray-200" />
                  <td className="border border-gray-200 px-2 py-2 text-xs text-gray-500 text-right">
                    <span className="font-semibold text-gray-700">{totalHours.toFixed(1)} h</span>
                  </td>
                  <td className="border border-gray-200" />
                  <td className="border border-gray-200" />
                  <td className="border border-gray-200" />
                  {isAdmin && <>
                    <td className="border border-gray-200" />
                    <td className="border border-gray-200 px-2 py-2 text-xs text-right">
                      <span className="font-bold text-gray-800">{totalReward.toLocaleString('cs-CZ')} Kč</span>
                    </td>
                    <td className="border border-gray-200" />
                  </>}
                  <td className="border border-gray-200" />
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* + Nový task dole */}
        {!newRowDraft && (
          <button
            onClick={startNewRow}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors w-full text-left border-t"
          >
            <Plus className="h-3.5 w-3.5" />
            Nový task
          </button>
        )}
      </div>

      {/* Detail / komentáře modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          isAdmin={isAdmin}
          onClose={() => setDetailTask(null)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Task detail modal (komentáře)
// ────────────────────────────────────────────────────────────
function TaskDetailModal({
  task,
  isAdmin,
  onClose,
}: {
  task: Task
  isAdmin: boolean
  onClose: () => void
}) {
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<{ id: string; author_name: string | null; content: string; created_at: string }[]>([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch(`/api/tasks/${task.id}`).then(r => r.json()).then(data => {
      setComments(data.comments ?? [])
      setLoadingComments(false)
    })
  }, [task.id])

  async function sendComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setSending(true)
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: comment }),
    })
    if (res.ok) {
      const c = await res.json()
      setComments(prev => [...prev, c])
      setComment('')
    }
    setSending(false)
  }

  const totalReward = (task.reward ?? 0) + (task.one_time_reward ?? 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">{task.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {task.client && <span className="mr-2">{task.client}</span>}
              {task.month && <span>Měsíc: {task.month}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-sm overflow-y-auto flex-shrink-0">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Deadline</p>
              <p className="font-medium">{task.deadline ? new Date(task.deadline).toLocaleDateString('cs-CZ') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Čas</p>
              <p className="font-medium">{((task.hours ?? 0) + (task.minutes ?? 0) / 60).toFixed(2)} h</p>
            </div>
            {isAdmin && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Odměna</p>
                <p className="font-semibold text-green-700">{totalReward.toLocaleString('cs-CZ')} Kč</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
          <p className="text-xs font-medium text-gray-500">Komentáře</p>
          {loadingComments ? (
            <p className="text-xs text-gray-400">Načítám...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-gray-400">Žádné komentáře</p>
          ) : (
            <div className="space-y-2">
              {comments.map(c => (
                <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">{c.author_name ?? 'Neznámý'}</span>
                    <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString('cs-CZ')}</span>
                  </div>
                  <p className="text-sm text-gray-700">{c.content}</p>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={sendComment} className="flex gap-2 mt-3">
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Komentář…"
              className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="submit"
              disabled={sending || !comment.trim()}
              className="bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Odeslat'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
