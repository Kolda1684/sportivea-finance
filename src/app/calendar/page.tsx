'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Link, ExternalLink, Trash2 } from 'lucide-react'
import type { CalendarEvent, CalendarEventStatus, CalendarEventType } from '@/types'
import { cn } from '@/lib/utils'

const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  nataceni: 'bg-orange-100 text-orange-800 border-orange-200',
  dovolena: 'bg-teal-100 text-teal-800 border-teal-200',
  workshop: 'bg-purple-100 text-purple-800 border-purple-200',
  jine: 'bg-gray-100 text-gray-700 border-gray-200',
}

const EVENT_TYPE_DOT: Record<CalendarEventType, string> = {
  nataceni: 'bg-orange-400',
  dovolena: 'bg-teal-400',
  workshop: 'bg-purple-400',
  jine: 'bg-gray-400',
}

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  nataceni: 'Natáčení',
  dovolena: 'Dovolená',
  workshop: 'Workshop',
  jine: 'Jiné',
}

const STATUS_LABELS: Record<CalendarEventStatus, string> = {
  neni_potvrzeno: '❌ NENÍ VŮBEC POTVRZENO',
  ceka_potvrzeni: '⏳ ČEKÁ SE NA POTVRZENÍ',
  potvrzeno_lidi: '✅ POTVRZENO LIDI',
  potvrzeno: '📅 POTVRZENO',
  planovano: 'Plánováno',
  zruseno: 'Zrušeno',
}

const STATUS_COLORS: Record<CalendarEventStatus, string> = {
  neni_potvrzeno: 'bg-gray-100 text-gray-600 border-gray-200',
  ceka_potvrzeni: 'bg-purple-100 text-purple-700 border-purple-200',
  potvrzeno_lidi: 'bg-green-100 text-green-700 border-green-200',
  potvrzeno: 'bg-orange-100 text-orange-700 border-orange-200',
  planovano: 'bg-gray-100 text-gray-600 border-gray-200',
  zruseno: 'bg-red-100 text-red-600 border-red-200',
}

const MONTHS_CS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec']
const DAYS_CS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

interface Profile { id: string; name: string }

type Panel = 'new' | CalendarEvent | null

interface NewEventForm {
  title: string
  start_date: string
  end_date: string
  client: string
  event_type: CalendarEventType
  status: CalendarEventStatus
  location: string
  description: string
  assignee_ids: string[]
}

function PropRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 w-28 flex-shrink-0 text-gray-400 mt-0.5">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="flex-1 text-sm text-gray-800">{children}</div>
    </div>
  )
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [me, setMe] = useState<{ id: string } | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editDocUrl, setEditDocUrl] = useState('')

  const [form, setForm] = useState<NewEventForm>({
    title: '', start_date: '', end_date: '', client: '',
    event_type: 'nataceni', status: 'neni_potvrzeno', location: '', description: '', assignee_ids: [],
  })

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    // Monday-first: expand range slightly to catch multi-day events
    const from = new Date(year, month, 1).toISOString().split('T')[0]
    const to = new Date(year, month + 1, 0).toISOString().split('T')[0]
    const res = await fetch(`/api/calendar?from=${from}&to=${to}`)
    if (res.ok) {
      setEvents(await res.json())
      setFetchError(null)
    } else {
      const err = await res.json().catch(() => ({}))
      setFetchError(err.error ?? `HTTP ${res.status}`)
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  useEffect(() => {
    fetch('/api/init').then(r => r.json()).then(data => {
      setProfiles(data.profiles ?? [])
      setMe(data.me ?? null)
    })
  }, [])

  // Sync editovatelná pole při otevření detailu
  useEffect(() => {
    if (panel && panel !== 'new') {
      const e = panel as CalendarEvent
      setEditNotes(e.description ?? '')
      setEditDocUrl(e.document_url ?? '')
    }
  }, [panel])

  async function patchField(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/calendar/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    fetchEvents()
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Monday-first grid
  const firstDayRaw = new Date(year, month, 1).getDay() // 0=Sun
  const firstDay = (firstDayRaw + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function eventsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => {
      const start = e.start_date
      const end = e.end_date ?? e.start_date
      return dateStr >= start && dateStr <= end
    })
  }

  function openNew(day?: number) {
    const dateStr = day
      ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : ''
    setForm({
      title: '', start_date: dateStr, end_date: '', client: '',
      event_type: 'nataceni', status: 'neni_potvrzeno', location: '', description: '',
      assignee_ids: me ? [me.id] : [],
    })
    setPanel('new')
  }

  function toggleAssignee(uid: string) {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(uid)
        ? f.assignee_ids.filter(id => id !== uid)
        : [...f.assignee_ids, uid],
    }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        start_date: form.start_date,
        end_date: form.end_date || null,
        client: form.client || null,
        event_type: form.event_type,
        status: form.status,
        location: form.location || null,
        description: form.description || null,
        assignee_ids: form.assignee_ids,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setPanel(null)
      fetchEvents()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Smazat tento event?')) return
    await fetch(`/api/calendar/${id}`, { method: 'DELETE' })
    setPanel(null)
    fetchEvents()
  }

  const panelOpen = panel !== null
  const selectedEvent = panel !== 'new' ? panel as CalendarEvent : null

  return (
    <div className="flex h-full">
      {/* Main calendar area */}
      <div className={cn('flex flex-col flex-1 min-w-0 transition-all duration-300', panelOpen && 'mr-[420px]')}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Kalendář</h1>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-base font-medium text-gray-700 min-w-[160px] text-center">
                {MONTHS_CS[month]} {year}
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Legend */}
            <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
              {(Object.entries(EVENT_TYPE_LABELS) as [CalendarEventType, string][]).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', EVENT_TYPE_DOT[k])} />
                  {v}
                </span>
              ))}
            </div>
            <button
              onClick={() => openNew()}
              className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Přidat event
            </button>
          </div>
        </div>

        {/* Calendar grid — full height */}
        <div className="flex flex-col flex-1 overflow-hidden bg-white border-t">
          <div className="grid grid-cols-7 border-b flex-shrink-0">
            {DAYS_CS.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : fetchError ? (
            <div className="flex items-center justify-center flex-1 text-sm text-red-500">
              Chyba při načítání: {fetchError}
            </div>
          ) : (
            <div
              className="flex-1 grid grid-cols-7 divide-x divide-y overflow-hidden"
              style={{ gridTemplateRows: `repeat(${cells.length / 7}, 1fr)` }}
            >
              {cells.map((day, i) => {
                const dayEvents = day ? eventsForDay(day) : []
                const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
                return (
                  <div
                    key={i}
                    onClick={() => day && openNew(day)}
                    className={cn(
                      'p-1.5 cursor-pointer group overflow-hidden',
                      !day && 'bg-gray-50 cursor-default',
                      day && 'hover:bg-gray-50/80'
                    )}
                  >
                    {day && (
                      <>
                        <span className={cn(
                          'text-xs font-medium mb-1 flex h-6 w-6 items-center justify-center rounded-full',
                          isToday ? 'bg-gray-900 text-white' : 'text-gray-600 group-hover:bg-gray-200'
                        )}>
                          {day}
                        </span>
                        <div className="space-y-0.5">
                          {dayEvents.map(event => {
                            const type = (event.event_type ?? 'jine') as CalendarEventType
                            const assigneeNames = (event.assignees as unknown as { profile: { name: string } | null }[] | undefined)
                              ?.map(a => a.profile?.name?.split(' ')[0]).filter(Boolean).join(', ')
                            return (
                              <button
                                key={event.id}
                                onClick={e => { e.stopPropagation(); setPanel(event) }}
                                className={cn(
                                  'w-full text-left rounded px-1.5 py-1 text-xs border',
                                  EVENT_TYPE_COLORS[type]
                                )}
                              >
                                <div className="font-medium truncate">{event.title}</div>
                                {event.client && <div className="truncate opacity-70">{event.client}</div>}
                                {assigneeNames && <div className="truncate opacity-60">{assigneeNames}</div>}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — fixed, nad kalendářem */}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[420px] bg-white border-l shadow-xl flex flex-col transition-transform duration-300 z-40',
        panelOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <span className="font-semibold text-gray-900 text-sm">
            {panel === 'new' ? 'Nový event' : (selectedEvent?.title ?? '')}
          </span>
          <button onClick={() => setPanel(null)} className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* === New event form === */}
          {panel === 'new' && (
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {/* Typ */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Typ eventu</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(EVENT_TYPE_LABELS) as [CalendarEventType, string][]).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, event_type: k }))}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                        form.event_type === k
                          ? EVENT_TYPE_COLORS[k] + ' ring-1 ring-offset-1 ring-current'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Status</label>
                <div className="flex flex-wrap gap-2">
                  {(['neni_potvrzeno', 'ceka_potvrzeni', 'potvrzeno_lidi', 'potvrzeno'] as CalendarEventStatus[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                        form.status === s
                          ? STATUS_COLORS[s] + ' ring-1 ring-offset-1 ring-current'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Název */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Název *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Davis Cup – Jihlava"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Daty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Od *</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Do</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Klient + Lokace */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Klient</label>
                  <input
                    value={form.client}
                    onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                    placeholder="Olympijský tým"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Lokace</label>
                  <input
                    value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="Praha, Jihlava..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Tým */}
              {profiles.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Tým (vytvoří jim task)</label>
                  <div className="flex flex-wrap gap-2">
                    {profiles.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleAssignee(p.id)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                          form.assignee_ids.includes(p.id)
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        {p.name || p.id.slice(0, 8)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Poznámka */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Poznámka</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setPanel(null)}
                  className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50">
                  Zrušit
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Přidat event
                </button>
              </div>
            </form>
          )}

          {/* === Event detail — Notion style === */}
          {selectedEvent && (
            <div className="flex flex-col h-full">
              {/* Typ emoji + nadpis */}
              <div className="px-8 pt-8 pb-4 flex-shrink-0">
                <div className="text-4xl mb-3">
                  {selectedEvent.event_type === 'nataceni' ? '🎬' : selectedEvent.event_type === 'dovolena' ? '🏖️' : selectedEvent.event_type === 'workshop' ? '🎓' : '📌'}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 leading-tight">{selectedEvent.title}</h2>
              </div>

              {/* Properties */}
              <div className="px-8 pb-2 flex-shrink-0 space-y-0">
                {/* Person */}
                {selectedEvent.assignees && selectedEvent.assignees.length > 0 && (
                  <div className="flex items-start py-2 border-b border-gray-100">
                    <span className="w-32 text-xs text-gray-500 pt-0.5 flex-shrink-0">👤 Person</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedEvent.assignees as unknown as { profile: { name: string } | null }[]).map((a, i) => (
                        <span key={i} className="bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5 text-xs font-medium">
                          {a.profile?.name || '?'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stav */}
                <div className="flex items-center py-2 border-b border-gray-100">
                  <span className="w-32 text-xs text-gray-500 flex-shrink-0">📋 Stav</span>
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border',
                    STATUS_COLORS[selectedEvent.status as CalendarEventStatus] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                  )}>
                    {STATUS_LABELS[selectedEvent.status as CalendarEventStatus] ?? selectedEvent.status}
                  </span>
                </div>

                {/* Datum */}
                <div className="flex items-center py-2 border-b border-gray-100">
                  <span className="w-32 text-xs text-gray-500 flex-shrink-0">📅 Datum</span>
                  <span className="text-sm text-gray-800">
                    {new Date(selectedEvent.start_date + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date && (
                      <> – {new Date(selectedEvent.end_date + 'T12:00:00').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                    )}
                  </span>
                </div>

                {/* Klient */}
                {selectedEvent.client && (
                  <div className="flex items-center py-2 border-b border-gray-100">
                    <span className="w-32 text-xs text-gray-500 flex-shrink-0">🏢 Klient</span>
                    <span className="text-sm text-gray-800">{selectedEvent.client}</span>
                  </div>
                )}

                {/* Typ */}
                <div className="flex items-center py-2 border-b border-gray-100">
                  <span className="w-32 text-xs text-gray-500 flex-shrink-0">🎭 Typ</span>
                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border', EVENT_TYPE_COLORS[(selectedEvent.event_type ?? 'jine') as CalendarEventType])}>
                    {EVENT_TYPE_LABELS[(selectedEvent.event_type ?? 'jine') as CalendarEventType]}
                  </span>
                </div>

                {/* Lokace */}
                {selectedEvent.location && (
                  <div className="flex items-center py-2 border-b border-gray-100">
                    <span className="w-32 text-xs text-gray-500 flex-shrink-0">📍 Lokace</span>
                    <span className="text-sm text-gray-800">{selectedEvent.location}</span>
                  </div>
                )}

                {/* Dokument */}
                <div className="flex items-center py-2 border-b border-gray-100">
                  <span className="w-32 text-xs text-gray-500 flex-shrink-0">🔗 Dokument</span>
                  <div className="flex-1 flex items-center gap-2">
                    {editDocUrl ? (
                      <a href={editDocUrl} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline truncate max-w-[160px] flex items-center gap-1">
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        {editDocUrl.replace(/^https?:\/\//, '').slice(0, 30)}…
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">Přidat odkaz…</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Editovatelné pole — Dokument URL */}
              <div className="px-8 pt-2 pb-1 flex-shrink-0">
                <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white">
                  <Link className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <input
                    type="url"
                    placeholder="Vložit odkaz na dokument (Google Drive, Notion…)"
                    value={editDocUrl}
                    onChange={e => setEditDocUrl(e.target.value)}
                    onBlur={() => patchField(selectedEvent.id, { document_url: editDocUrl || null })}
                    className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
                  />
                  {editDocUrl && (
                    <button onClick={() => { setEditDocUrl(''); patchField(selectedEvent.id, { document_url: null }) }}
                      className="text-gray-400 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Poznámky — editovatelné */}
              <div className="px-8 pt-3 pb-4 flex-1 flex flex-col">
                <p className="text-xs font-medium text-gray-500 mb-2">📝 Poznámky</p>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  onBlur={() => patchField(selectedEvent.id, { description: editNotes || null })}
                  placeholder="Napiš poznámky k eventu…"
                  className="flex-1 w-full text-sm text-gray-800 placeholder:text-gray-400 resize-none outline-none border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 min-h-[120px]"
                />
                <p className="text-xs text-gray-400 mt-1">Uloží se automaticky po kliknutí jinam</p>
              </div>

              {/* Delete */}
              <div className="px-8 py-4 border-t flex-shrink-0">
                <button
                  onClick={() => handleDelete(selectedEvent.id)}
                  className="flex items-center gap-2 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Smazat event
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Backdrop for panel on small screens */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          onClick={() => setPanel(null)}
        />
      )}
    </div>
  )
}
