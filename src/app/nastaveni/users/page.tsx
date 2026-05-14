'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Loader2, User, Shield } from 'lucide-react'

interface Profile {
  id: string
  name: string
  email: string | null
  role: 'admin' | 'editor'
  hourly_rate: number | null
}

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'editor' as 'admin' | 'editor' })
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(data => {
      setProfiles(data)
      setLoading(false)
    })
  }, [])

  async function handleRoleChange(id: string, role: 'admin' | 'editor') {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    })
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, role } : p))
  }

  async function handleRateChange(id: string, hourly_rate: string) {
    const parsed = hourly_rate === '' ? null : Number(hourly_rate) || null
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, hourly_rate: parsed }),
    })
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, hourly_rate: parsed } : p))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const newProfile = await res.json()
      setProfiles(prev => [...prev, newProfile])
      setShowModal(false)
      setForm({ name: '', email: '', password: '', role: 'editor' })
    } else {
      const data = await res.json()
      setError(data.error ?? 'Chyba při vytváření uživatele')
    }
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Správa uživatelů</h1>
          <p className="text-sm text-gray-500 mt-0.5">{profiles.length} uživatelů v systému</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Přidat uživatele
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Uživatel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 w-[140px]">
                  Hodinovka (Kč/h)
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Změnit roli</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {profiles.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-gray-600">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <RateInput
                      value={p.hourly_rate}
                      onSave={v => handleRateChange(p.id, v)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {p.role === 'admin' ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {p.role === 'admin' ? 'Admin' : 'Editor'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={p.role}
                      onChange={e => handleRoleChange(p.id, e.target.value as 'admin' | 'editor')}
                      className="border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">Nový uživatel</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Jméno *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Vojtěch Kepka"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
                <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="vojta@sportivea.cz"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Heslo *</label>
                <input required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Alespoň 6 znaků"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'admin' | 'editor' }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Zrušit</button>
                <button type="submit" disabled={saving} className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}Vytvořit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function RateInput({ value, onSave }: { value: number | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value != null ? String(value) : '')

  if (!editing) return (
    <button
      onClick={() => { setDraft(value != null ? String(value) : ''); setEditing(true) }}
      className="text-sm text-gray-700 hover:bg-gray-100 rounded px-2 py-1 -mx-2 min-w-[80px] text-left"
    >
      {value != null ? `${value.toLocaleString('cs-CZ')} Kč` : <span className="text-gray-300">—</span>}
    </button>
  )

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onSave(draft) }}
        onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onSave(draft) } if (e.key === 'Escape') setEditing(false) }}
        className="w-24 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="0"
      />
      <span className="text-xs text-gray-400">Kč/h</span>
    </div>
  )
}
