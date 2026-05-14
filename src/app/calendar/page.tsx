'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, MapPin } from 'lucide-react'
import type { CalendarEvent, CalendarEventStatus } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<CalendarEventStatus, string> = {
  planovano: 'bg-blue-100 text-blue-800 border-blue-200',
  potvrzeno: 'bg-green-100 text-green-800 border-green-200',
  zruseno: 'bg-red-100 text-red-800 border-red-200',
}

const STATUS_LABELS: Record<CalendarEventStatus, string> = {
  planovano: 'Plánováno',
  potvrzeno: 'Potvrzeno',
  zruseno: 'Zrušeno',
}

const MONTHS_CS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec']
const DAYS_CS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']

interface NewEventForm {
  title: string
  start_date: string
  end_date: string
  client: string
  status: CalendarEventStatus
  location: string
  description: string
  assignee_ids: string[]
}

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<NewEventForm>({
    title: '', start_date: '', end_date: '', client: '',
    status: 'planovano', location: '', description: '', assignee_ids: [],
  })

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const from = new Date(year, month, 1).toISOString().split('T')[0]
    const to = new Date(year, month + 1, 0).toISOString().split('T')[0]
    const res = await fetch(`/api/calendar?from=${from}&to=${to}`)
    if (res.ok) setEvents(await res.json())
    setLoading(false)
  }, [year, month])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  useEffect(() => {
    fetch('/api/admin/users').then(r => {
      if (r.ok) {
        setIsAdmin(true)
        r.json().then(setProfiles)
      }
    })
  }, [])

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  // Kalendářní grid
  const firstDay = new Date(year, month, 1).getDay()
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
        status: form.status,
        location: form.location || null,
        description: form.description || null,
        assignee_ids: form.assignee_ids,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setShowNewModal(false)
      setForm({ title: '', start_date: '', end_date: '', client: '', status: 'planovano', location: '', description: '', assignee_ids: [] })
      fetchEvents()
    }
  }

  function toggleAssignee(uid: string) {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(uid)
        ? f.assignee_ids.filter(id => id !== uid)
        : [...f.assignee_ids, uid],
    }))
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Hlavička */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Kalendář natáčení</h1>
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
        {isAdmin && (
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Přidat event
          </button>
        )}
      </div>

      {/* Kalendář grid */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {/* Hlavička dnů */}
        <div className="grid grid-cols-7 border-b">
          {DAYS_CS.map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-500">
              {d}
            </div>
          ))}
        </div>

        {/* Buňky */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-7 divide-x divide-y">
            {cells.map((day, i) => {
              const dayEvents = day ? eventsForDay(day) : []
              const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
              return (
                <div key={i} className={cn('min-h-[100px] p-1.5', !day && 'bg-gray-50')}>
                  {day && (
                    <>
                      <span className={cn(
                        'text-xs font-medium mb-1 block w-6 h-6 flex items-center justify-center rounded-full',
                        isToday ? 'bg-gray-900 text-white' : 'text-gray-600'
                      )}>
                        {day}
                      </span>
                      <div className="space-y-0.5">
                        {dayEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={() => setSelectedEvent(event)}
                            className={cn(
                              'w-full text-left rounded px-1.5 py-0.5 text-xs font-medium border truncate',
                              STATUS_COLORS[event.status as CalendarEventStatus]
                            )}
                          >
                            {event.title}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Event detail */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-start justify-between p-6 border-b">
              <div>
                <h2 className="font-semibold text-gray-900">{selectedEvent.title}</h2>
                <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium border',
                  STATUS_COLORS[selectedEvent.status as CalendarEventStatus])}>
                  {STATUS_LABELS[selectedEvent.status as CalendarEventStatus]}
                </span>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Datum</p>
                <p className="font-medium">
                  {new Date(selectedEvent.start_date).toLocaleDateString('cs-CZ')}
                  {selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date &&
                    ` – ${new Date(selectedEvent.end_date).toLocaleDateString('cs-CZ')}`}
                </p>
              </div>
              {selectedEvent.client && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Klient</p>
                  <p className="font-medium">{selectedEvent.client}</p>
                </div>
              )}
              {selectedEvent.location && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Lokace</p>
                  <p className="font-medium flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                    {selectedEvent.location}
                  </p>
                </div>
              )}
              {selectedEvent.assignees && selectedEvent.assignees.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Tým</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedEvent.assignees as unknown as { profile: { name: string } }[]).map((a, i) => (
                      <span key={i} className="bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5 text-xs font-medium">
                        {a.profile?.name ?? '?'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selectedEvent.description && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Poznámka</p>
                  <p className="text-gray-700">{selectedEvent.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nový event modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">Nový event</h2>
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
                  placeholder="Davis Cup – Jihlava"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as CalendarEventStatus }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="planovano">Plánováno</option>
                    <option value="potvrzeno">Potvrzeno</option>
                    <option value="zruseno">Zrušeno</option>
                  </select>
                </div>
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
              {profiles.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Tým</label>
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
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                <button type="button" onClick={() => setShowNewModal(false)}
                  className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50">
                  Zrušit
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Přidat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
