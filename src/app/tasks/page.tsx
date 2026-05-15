'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Loader2, ChevronDown, X, Calendar, User, Clock, Tag, Hash, AlignLeft, MessageSquare, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

type TaskStatus = 'zadano' | 'v_procesu' | 'na_checku' | 'hotovo'

interface Task {
  id: string
  title: string
  deadline: string | null
  status: TaskStatus
  client: string | null
  hours: number
  minutes: number
  reward: number | null
  one_time_reward: number | null
  task_type: string | null
  month: string | null
  assignee_id: string | null
  description: string | null
  assignee?: { id: string; name: string } | null
}

interface Comment { id: string; author_name: string | null; content: string; created_at: string }
interface Profile { id: string; name: string; role: string; hourly_rate?: number | null }
interface Company { id: string; name: string }

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; dot: string }> = {
  zadano:    { label: 'Not Started', bg: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
  v_procesu: { label: 'V procesu',   bg: 'bg-blue-50 text-blue-600',     dot: 'bg-blue-500' },
  na_checku: { label: 'Na checku',   bg: 'bg-orange-50 text-orange-600', dot: 'bg-orange-400' },
  hotovo:    { label: 'Hotovo',      bg: 'bg-green-50 text-green-700',   dot: 'bg-green-500' },
}
const STATUSES = Object.keys(STATUS_CONFIG) as TaskStatus[]
const TASK_TYPES = ['Reels', 'Daily', 'Long-form', 'Natáčení', 'Grafika', 'Captions', 'Stories', 'YouTube', 'Jiné']

// ── Inline cell ──────────────────────────────────────────────
function Cell({ value, type = 'text', options, placeholder = '—', onSave, className = '' }: {
  value: string | number | null; type?: 'text' | 'number' | 'date' | 'select'
  options?: string[]; placeholder?: string; onSave?: (v: string) => void; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null)
  useEffect(() => setDraft(String(value ?? '')), [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  function commit(v: string) { setEditing(false); if (v !== String(value ?? '') && onSave) onSave(v) }
  function display() {
    if (!value && value !== 0) return null
    if (type === 'date') return new Date(String(value)).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return String(value)
  }
  if (!editing) return (
    <div onClick={() => setEditing(true)} className={cn('px-2 py-1.5 text-sm cursor-text rounded hover:bg-blue-50/40 min-h-[30px] flex items-center', !display() && 'text-gray-300', className)}>
      {display() ?? placeholder}
    </div>
  )
  if (type === 'select' && options) return (
    <select ref={ref} value={draft} onChange={e => setDraft(e.target.value)} onBlur={e => commit(e.target.value)}
      className="w-full px-2 py-1.5 text-sm border-0 outline-none bg-white focus:ring-1 focus:ring-blue-400 rounded">
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
  return (
    <input ref={ref} type={type} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') { setDraft(String(value ?? '')); setEditing(false) } }}
      className="w-full px-2 py-1.5 text-sm border-0 outline-none bg-white focus:ring-1 focus:ring-blue-400 rounded" />
  )
}

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ value, onSave }: { value: TaskStatus; onSave?: (v: TaskStatus) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CONFIG[value]
  return (
    <div className="relative inline-block">
      <button onClick={() => onSave && setOpen(o => !o)} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.bg, onSave && 'hover:opacity-80 cursor-pointer')}>
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />{cfg.label}
        {onSave && <ChevronDown className="h-3 w-3 opacity-40" />}
      </button>
      {open && <>
        <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]">
          {STATUSES.map(s => (
            <button key={s} onClick={() => { onSave?.(s); setOpen(false) }}
              className={cn('w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors', s === value && 'bg-gray-50')}>
              <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', STATUS_CONFIG[s].dot)} />{STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </>}
    </div>
  )
}

// ── Client dropdown ───────────────────────────────────────────
function ClientCell({ value, companies, onSave }: { value: string | null; companies: Company[]; onSave?: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => onSave && setOpen(o => !o)} className={cn('px-2 py-1.5 text-sm rounded hover:bg-blue-50/40 w-full text-left min-h-[30px]', !value && 'text-gray-300')}>
        {value || '—'}
      </button>
      {open && <>
        <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-52 overflow-y-auto">
          <button onClick={() => { onSave?.(''); setOpen(false) }} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50">— žádný —</button>
          {companies.map(c => (
            <button key={c.id} onClick={() => { onSave?.(c.name); setOpen(false) }}
              className={cn('w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors', value === c.name && 'font-semibold')}>
              {c.name}
            </button>
          ))}
        </div>
      </>}
    </div>
  )
}

// ── Pravý panel (detail / nový task) ─────────────────────────
function TaskPanel({
  task, isAdmin, companies, profiles, me,
  onClose, onUpdate, onCreate,
}: {
  task: Task | 'new'; isAdmin: boolean; companies: Company[]; profiles: Profile[]; me: Profile | null
  onClose: () => void
  onUpdate: (id: string, field: string, value: unknown) => void
  onCreate: (data: Partial<Task>) => Promise<void>
}) {
  const isNew = task === 'new'
  const [draft, setDraft] = useState<Partial<Task>>(isNew ? { status: 'zadano', assignee_id: me?.id ?? '' } : {})
  const [comments, setComments] = useState<Comment[]>([])
  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingComments, setLoadingComments] = useState(!isNew)

  const t = isNew ? draft : task as Task

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/tasks/${(task as Task).id}`).then(r => r.json()).then(d => {
        setComments(d.comments ?? [])
        setLoadingComments(false)
      })
    }
  }, [isNew, task])

  function field<K extends keyof Task>(key: K): Task[K] {
    return (isNew ? (draft[key] ?? null) : (task as Task)[key]) as Task[K]
  }

  function update(key: keyof Task, value: unknown) {
    if (isNew) { setDraft(d => ({ ...d, [key]: value })) }
    else { onUpdate((task as Task).id, key, value) }
  }

  async function handleCreate() {
    if (!draft.title?.trim()) return
    setSaving(true)
    await onCreate(draft)
    setSaving(false)
    onClose()
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim() || isNew) return
    setSendingComment(true)
    const res = await fetch(`/api/tasks/${(task as Task).id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: comment }),
    })
    if (res.ok) { const c = await res.json(); setComments(p => [...p, c]); setComment('') }
    setSendingComment(false)
  }

  const totalTime = ((field('hours') ?? 0) as number) + ((field('minutes') ?? 0) as number) / 60

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden border-l border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <span className="text-xs text-gray-400 font-medium">{isNew ? 'Nový task' : 'Detail tasku'}</span>
          <div className="flex items-center gap-2">
            {!isNew && (
              <button onClick={() => window.open(`/tasks/${(task as Task).id}`, '_blank')} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Název */}
          <div className="px-5 pt-5 pb-3">
            {isNew ? (
              <input
                autoFocus
                value={(draft.title ?? '') as string}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="Název tasku…"
                className="w-full text-2xl font-bold text-gray-900 border-0 outline-none placeholder-gray-300 bg-transparent resize-none"
              />
            ) : (
              <h2 className="text-2xl font-bold text-gray-900 leading-tight">{(task as Task).title}</h2>
            )}
          </div>

          {/* Properties */}
          <div className="px-5 space-y-1 pb-4">
            {/* Deadline */}
            <PropRow icon={<Calendar className="h-3.5 w-3.5" />} label="Deadline">
              <input
                type="date"
                value={(field('deadline') ?? '') as string}
                onChange={e => update('deadline', e.target.value || null)}
                className="text-sm text-gray-700 border-0 outline-none bg-transparent focus:bg-gray-50 rounded px-2 py-1 -mx-2"
              />
            </PropRow>

            {/* Klient */}
            <PropRow icon={<User className="h-3.5 w-3.5" />} label="Klient">
              <div className="-mx-2">
                <ClientCell value={field('client') as string | null} companies={companies} onSave={v => update('client', v || null)} />
              </div>
            </PropRow>

            {/* Status */}
            <PropRow icon={<span className="h-3.5 w-3.5 flex items-center justify-center text-[10px]">◉</span>} label="Status">
              <StatusBadge value={(field('status') ?? 'zadano') as TaskStatus} onSave={v => update('status', v)} />
            </PropRow>

            {/* Typ */}
            <PropRow icon={<Tag className="h-3.5 w-3.5" />} label="Typ">
              <select
                value={(field('task_type') ?? '') as string}
                onChange={e => update('task_type', e.target.value || null)}
                className="text-sm text-gray-700 border-0 outline-none bg-transparent focus:bg-gray-50 rounded px-2 py-1 -mx-2 cursor-pointer"
              >
                <option value="">—</option>
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </PropRow>

            {/* Hodiny + Minuty */}
            <PropRow icon={<Clock className="h-3.5 w-3.5" />} label="Hodiny / Minuty">
              <div className="flex items-center gap-1 text-sm text-gray-700">
                <input type="number" min="0"
                  value={(field('hours') ?? 0) as number}
                  onChange={e => update('hours', Number(e.target.value) || 0)}
                  className="w-14 border-0 outline-none bg-transparent focus:bg-gray-50 rounded px-2 py-1 -mx-2 text-right"
                />
                <span className="text-gray-400">h</span>
                <input type="number" min="0" max="59"
                  value={(field('minutes') ?? 0) as number}
                  onChange={e => update('minutes', Number(e.target.value) || 0)}
                  className="w-14 border-0 outline-none bg-transparent focus:bg-gray-50 rounded px-2 py-1 text-right"
                />
                <span className="text-gray-400">m</span>
                <span className="text-xs text-gray-400 ml-1">= {totalTime.toFixed(2)} h</span>
              </div>
            </PropRow>

            {/* Měsíc */}
            <PropRow icon={<Hash className="h-3.5 w-3.5" />} label="Měsíc">
              <span className="text-sm text-gray-500">{(field('month') as string | null) ?? '—'}</span>
            </PropRow>

            {/* Odměna — jen admin */}
            {isAdmin && <>
              <PropRow icon={<span className="h-3.5 w-3.5 text-center text-[11px]">€</span>} label="Odměna (Kč)">
                <div className="flex items-center gap-2">
                  <input type="number"
                    value={(field('reward') ?? '') as number}
                    onChange={e => update('reward', e.target.value ? Number(e.target.value) : null)}
                    className="text-sm text-gray-700 border-0 outline-none bg-transparent focus:bg-gray-50 rounded px-2 py-1 -mx-2 font-semibold w-24"
                  />
                  {(() => {
                    const assigneeId = field('assignee_id') as string | null
                    const assignee = profiles.find(p => p.id === assigneeId)
                    if (!assignee?.hourly_rate) return null
                    const computed = Math.round(assignee.hourly_rate * (((field('hours') ?? 0) as number) + ((field('minutes') ?? 0) as number) / 60))
                    return <span className="text-xs text-gray-400">(sazba {assignee.hourly_rate} Kč/h → {computed} Kč)</span>
                  })()}
                </div>
              </PropRow>
              <PropRow icon={<span className="h-3.5 w-3.5 text-center text-[11px]">+</span>} label="Jednorázová odměna">
                <input type="number"
                  value={(field('one_time_reward') ?? '') as number}
                  onChange={e => update('one_time_reward', e.target.value ? Number(e.target.value) : null)}
                  className="text-sm text-gray-700 border-0 outline-none bg-transparent focus:bg-gray-50 rounded px-2 py-1 -mx-2"
                />
              </PropRow>
            </>}

            {/* Assignee — jen admin */}
            {isAdmin && (
              <PropRow icon={<User className="h-3.5 w-3.5" />} label="Editor">
                <select
                  value={(field('assignee_id') ?? '') as string}
                  onChange={e => update('assignee_id', e.target.value || null)}
                  className="text-sm text-gray-700 border-0 outline-none bg-transparent focus:bg-gray-50 rounded px-2 py-1 -mx-2 cursor-pointer"
                >
                  <option value="">—</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </PropRow>
            )}
          </div>

          {/* Oddělovač */}
          <div className="h-px bg-gray-100 mx-5" />

          {/* Description */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-2">
              <AlignLeft className="h-3.5 w-3.5" />Description
            </div>
            <textarea
              value={(field('description') ?? '') as string}
              onChange={e => update('description', e.target.value || null)}
              placeholder="Přidej popis…"
              rows={4}
              className="w-full text-sm text-gray-700 border-0 outline-none bg-transparent resize-none placeholder-gray-300 focus:bg-gray-50 rounded p-1 -m-1"
            />
          </div>

          {/* Tlačítko Vytvořit (pro nový task) */}
          {isNew && (
            <div className="px-5 pb-4">
              <button
                onClick={handleCreate}
                disabled={saving || !draft.title?.trim()}
                className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Vytvořit task
              </button>
            </div>
          )}

          {/* Komentáře — jen pro existující tasky */}
          {!isNew && (
            <div className="px-5 py-4 border-t border-gray-100">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-3">
                <MessageSquare className="h-3.5 w-3.5" />Comments
              </div>
              {loadingComments ? <p className="text-xs text-gray-400">Načítám…</p> : (
                <div className="space-y-3 mb-3">
                  {comments.length === 0 && <p className="text-xs text-gray-400">Žádné komentáře</p>}
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-gray-500">
                        {(c.author_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-gray-700">{c.author_name ?? 'Neznámý'}</span>
                          <span className="text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString('cs-CZ')}</span>
                        </div>
                        <p className="text-sm text-gray-600">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={sendComment} className="flex gap-2 mt-2">
                <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Přidat komentář…"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
                <button type="submit" disabled={sendingComment || !comment.trim()}
                  className="bg-gray-900 text-white rounded-lg px-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
                  {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : '↑'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function PropRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center min-h-[34px] rounded-md hover:bg-gray-50 -mx-2 px-2 transition-colors">
      <div className="flex items-center gap-2 w-[140px] flex-shrink-0 text-gray-400">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ── Hlavní stránka ────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [me, setMe] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('')
  const [panel, setPanel] = useState<Task | 'new' | null>(null)
  const [newRowDraft, setNewRowDraft] = useState<{ title: string } | null>(null)
  const [savingNew, setSavingNew] = useState(false)
  const newTitleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/init').then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      setMe(d.me)
      setIsAdmin(d.isAdmin)
      setProfiles(d.profiles)
      setCompanies(d.companies)
    })
  }, [])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filterMonth) p.set('month', filterMonth)
    if (filterStatus) p.set('status', filterStatus)
    const res = await fetch(`/api/tasks?${p}`)
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [filterMonth, filterStatus])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function updateField(taskId: string, field: string, value: unknown) {
    // Optimistická okamžitá aktualizace — UI odpoví ihned, server syncuje na pozadí
    const optimistic = { [field]: value }
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...optimistic } : t))
    if (panel && panel !== 'new' && (panel as Task).id === taskId) {
      setPanel(prev => prev && prev !== 'new' ? { ...prev as Task, ...optimistic } : prev)
    }

    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    if (res.ok) {
      // Sync se serverem — doplní auto-computed hodnoty (reward z hodinové sazby, month, atd.)
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updated } : t))
      if (panel && panel !== 'new' && (panel as Task).id === taskId) {
        setPanel(prev => prev && prev !== 'new' ? { ...prev as Task, ...updated } : prev)
      }
    } else {
      // Reverze při chybě — přenačti ze serveru
      fetchTasks()
    }
  }

  async function createTask(data: Partial<Task>) {
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, assignee_id: data.assignee_id || me?.id || null }),
    })
    if (res.ok) { const task = await res.json(); setTasks(prev => [...prev, task]) }
  }

  async function createInlineTask() {
    if (!newRowDraft?.title.trim()) { setNewRowDraft(null); return }
    setSavingNew(true)
    await createTask({ title: newRowDraft.title })
    setNewRowDraft(null)
    setSavingNew(false)
  }

  // Klienti pro filtr
  const clientsInTasks = Array.from(new Set(tasks.map(t => t.client).filter(Boolean))) as string[]
  const allClients = Array.from(new Set([...clientsInTasks, ...companies.map(c => c.name)])).sort()

  // Dostupné měsíce pro filtr
  const monthsInTasks = Array.from(new Set(tasks.map(t => t.month).filter(Boolean))) as string[]

  const filtered = tasks.filter(t => {
    if (filterClient && t.client !== filterClient) return false
    return true
  })

  const totalReward = filtered.reduce((s, t) => s + (t.reward ?? 0) + (t.one_time_reward ?? 0), 0)
  const totalHours = filtered.reduce((s, t) => s + (t.hours ?? 0) + (t.minutes ?? 0) / 60, 0)
  const doneCount = filtered.filter(t => t.status === 'hotovo').length

  const TH = 'border border-gray-200 px-2 py-2 font-semibold text-gray-500 text-xs bg-gray-50 text-left'
  const TD = 'border border-gray-200 px-0 py-0'

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Tasky</h1>
          <button onClick={() => setPanel('new')}
            className="flex items-center gap-1.5 bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-800 transition-colors">
            <Plus className="h-3.5 w-3.5" />Nový task
          </button>
        </div>

        {/* Filtry */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Měsíc */}
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-600 bg-white"
          >
            <option value="">Všechny měsíce</option>
            {monthsInTasks.sort().map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          {/* Klient */}
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300 text-gray-600 bg-white"
          >
            <option value="">Všichni klienti</option>
            {allClients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Status */}
          <div className="flex gap-1">
            {(['', ...STATUSES] as (TaskStatus | '')[]).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  filterStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                {s === '' ? 'Vše' : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          {(filterMonth || filterClient || filterStatus) && (
            <button onClick={() => { setFilterMonth(''); setFilterClient(''); setFilterStatus('') }}
              className="text-xs text-gray-400 hover:text-gray-600 underline">Reset</button>
          )}
        </div>
      </div>

      {/* Tabulka */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <table className="w-full text-sm border-collapse border border-gray-200">
            <thead>
              <tr>
                <th className="border border-gray-200 px-2 py-2 w-8 bg-gray-50" />
                {['min-w-[180px]','w-[105px]','w-[150px]','w-[95px]','w-[55px]','w-[55px]','w-[75px]','w-[125px]'].map((w, i) => (
                  <th key={i} className={`border border-gray-200 px-2 py-2 bg-gray-50 ${w}`}>
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className="border border-gray-200 px-2 py-2 bg-gray-50/40">
                    <div className="h-3 w-3 bg-gray-100 rounded animate-pulse mx-auto" />
                  </td>
                  <td className="border border-gray-200 px-3 py-2.5">
                    <div className="h-3.5 bg-gray-100 rounded animate-pulse" style={{ width: `${55 + (i * 17) % 40}%`, animationDelay: `${i * 60}ms` }} />
                  </td>
                  {[80, 90, 60, 40, 40, 55, 70].map((w, j) => (
                    <td key={j} className="border border-gray-200 px-3 py-2.5">
                      <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${w}%`, animationDelay: `${(i + j) * 40}ms` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm border-collapse border border-gray-200">
            <thead>
              <tr>
                <th className={cn(TH, 'w-8 text-center')}>#</th>
                <th className={cn(TH, 'min-w-[180px]')}>Task</th>
                <th className={cn(TH, 'w-[105px]')}>Deadline</th>
                <th className={cn(TH, 'w-[150px]')}>Klient</th>
                <th className={cn(TH, 'w-[95px]')}>Typ</th>
                <th className={cn(TH, 'w-[55px] text-right')}>Hod.</th>
                <th className={cn(TH, 'w-[55px] text-right')}>Min.</th>
                <th className={cn(TH, 'w-[75px]')}>Měsíc</th>
                <th className={cn(TH, 'w-[125px]')}>Status</th>
                {isAdmin && <>
                  <th className={cn(TH, 'w-[75px] text-right')}>Jednor.</th>
                  <th className={cn(TH, 'w-[80px] text-right')}>Odměna</th>
                  <th className={cn(TH, 'w-[105px]')}>Editor</th>
                </>}
                <th className={cn(TH, 'w-8')} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((task, i) => (
                <tr key={task.id} className="group hover:bg-blue-50/20 transition-colors cursor-pointer" onClick={() => setPanel(task)}>
                  <td className="border border-gray-200 px-2 py-0 text-xs text-gray-300 text-center select-none bg-gray-50/40">{i + 1}</td>
                  <td className={TD} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center">
                      <Cell value={task.title} onSave={v => updateField(task.id, 'title', v)} placeholder="Název…" className="flex-1 font-medium text-gray-900" />
                      <button onClick={e => { e.stopPropagation(); setPanel(task) }} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 px-1.5 flex-shrink-0 transition-opacity">
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                  <td className={TD} onClick={e => e.stopPropagation()}>
                    <Cell value={task.deadline} type="date" onSave={v => updateField(task.id, 'deadline', v || null)} placeholder="—" className="text-gray-500" />
                  </td>
                  <td className={TD} onClick={e => e.stopPropagation()}>
                    <ClientCell value={task.client} companies={companies} onSave={v => updateField(task.id, 'client', v || null)} />
                  </td>
                  <td className={TD} onClick={e => e.stopPropagation()}>
                    <Cell value={task.task_type} type="select" options={TASK_TYPES} onSave={v => updateField(task.id, 'task_type', v || null)} placeholder="—" className="text-gray-500" />
                  </td>
                  <td className={TD} onClick={e => e.stopPropagation()}>
                    <Cell value={task.hours || null} type="number" onSave={v => updateField(task.id, 'hours', v ? Number(v) : 0)} placeholder="0" className="text-right text-gray-700" />
                  </td>
                  <td className={TD} onClick={e => e.stopPropagation()}>
                    <Cell value={task.minutes || null} type="number" onSave={v => updateField(task.id, 'minutes', v ? Number(v) : 0)} placeholder="0" className="text-right text-gray-700" />
                  </td>
                  <td className="border border-gray-200 px-2 py-1 text-xs text-gray-400">{task.month ?? '—'}</td>
                  <td className="border border-gray-200 px-2 py-1" onClick={e => e.stopPropagation()}>
                    <StatusBadge value={task.status} onSave={v => updateField(task.id, 'status', v)} />
                  </td>
                  {isAdmin && <>
                    <td className={TD} onClick={e => e.stopPropagation()}>
                      <Cell value={task.one_time_reward || null} type="number" onSave={v => updateField(task.id, 'one_time_reward', v ? Number(v) : null)} placeholder="0" className="text-right text-gray-700" />
                    </td>
                    <td className={TD} onClick={e => e.stopPropagation()}>
                      <Cell value={task.reward || null} type="number" onSave={v => updateField(task.id, 'reward', v ? Number(v) : null)} placeholder="0" className="text-right font-semibold text-gray-900" />
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-xs text-gray-500">{task.assignee?.name ?? '—'}</td>
                  </>}
                  <td className="border border-gray-200 px-1 py-0 text-center" onClick={e => e.stopPropagation()}>
                    {isAdmin && (
                      <button onClick={async () => {
                        if (!confirm('Smazat task?')) return
                        await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
                        setTasks(prev => prev.filter(t => t.id !== task.id))
                      }} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity p-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Inline nový task */}
              {newRowDraft !== null && (
                <tr className="bg-blue-50/30">
                  <td className="border border-gray-200 px-2 py-1 text-xs text-gray-300 text-center bg-gray-50/40">*</td>
                  <td className="border border-gray-200 px-1 py-1" colSpan={isAdmin ? 8 : 7}>
                    <input ref={newTitleRef} value={newRowDraft.title}
                      onChange={e => setNewRowDraft({ title: e.target.value })}
                      onBlur={createInlineTask}
                      onKeyDown={e => { if (e.key === 'Enter') createInlineTask(); if (e.key === 'Escape') setNewRowDraft(null) }}
                      placeholder="Název tasku… (Enter)"
                      className="w-full px-2 py-1 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium" />
                  </td>
                  {isAdmin && <td className="border border-gray-200" colSpan={3} />}
                  <td className="border border-gray-200 text-center">{savingNew && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 mx-auto" />}</td>
                </tr>
              )}
            </tbody>

            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="border border-gray-200 px-2 py-2" />
                  <td className="border border-gray-200 px-2 py-2 text-xs text-gray-500">
                    COUNT <b className="text-gray-700">{filtered.length}</b>
                    <span className="ml-2 text-green-600 font-medium">{doneCount} hotovo</span>
                  </td>
                  <td className="border border-gray-200" /><td className="border border-gray-200" /><td className="border border-gray-200" />
                  <td className="border border-gray-200 px-2 py-2 text-xs text-right font-semibold text-gray-600" colSpan={2}>
                    {totalHours.toFixed(1)} h
                  </td>
                  <td className="border border-gray-200" /><td className="border border-gray-200" />
                  {isAdmin && <>
                    <td className="border border-gray-200" />
                    <td className="border border-gray-200 px-2 py-2 text-xs text-right font-bold text-gray-800">{totalReward.toLocaleString('cs-CZ')} Kč</td>
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
          <button onClick={() => { setNewRowDraft({ title: '' }); setTimeout(() => newTitleRef.current?.focus(), 50) }}
            className="flex items-center gap-2 px-5 py-2.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 w-full text-left border-t border-gray-200 transition-colors">
            <Plus className="h-3.5 w-3.5" />Nový task
          </button>
        )}
      </div>

      {/* Pravý panel */}
      {panel !== null && (
        <TaskPanel
          task={panel}
          isAdmin={isAdmin}
          companies={companies}
          profiles={profiles}
          me={me}
          onClose={() => setPanel(null)}
          onUpdate={updateField}
          onCreate={createTask}
        />
      )}
    </div>
  )
}
