'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle, X, ExternalLink, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface EmployeeDb {
  id: string
  team_member: string
  notion_database_id: string
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export default function NotionSettingsPage() {
  const [employees, setEmployees] = useState<EmployeeDb[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newDbId, setNewDbId] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, string>>({})

  const companiesDbConfigured = typeof window !== 'undefined' // just for UI hint

  async function load() {
    setLoading(true)
    const r = await fetch('/api/notion/employees')
    const data = await r.json()
    if (Array.isArray(data)) setEmployees(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setError(null)
    const r = await fetch('/api/notion/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_member: newName, notion_database_id: newDbId, notes: newNotes }),
    })
    const data = await r.json()
    setAdding(false)
    if (!r.ok) {
      setError(data.error ?? 'Chyba')
      return
    }
    setNewName(''); setNewDbId(''); setNewNotes('')
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Opravdu odstranit?')) return
    await fetch('/api/notion/employees', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  async function handleToggleActive(emp: EmployeeDb) {
    await fetch('/api/notion/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: emp.id, active: !emp.active }),
    })
    await load()
  }

  async function handleTest(emp: EmployeeDb) {
    setTestingId(emp.id)
    setTestResult(prev => ({ ...prev, [emp.id]: '' }))
    try {
      const r = await fetch('/api/notion/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'tasks' }),
      })
      const data = await r.json()
      if (!r.ok) {
        setTestResult(prev => ({ ...prev, [emp.id]: `❌ ${data.error}` }))
      } else {
        const me = data.tasks?.perEmployee?.find((p: { team_member: string }) => p.team_member === emp.team_member)
        if (me?.error) setTestResult(prev => ({ ...prev, [emp.id]: `❌ ${me.error}` }))
        else if (me) setTestResult(prev => ({ ...prev, [emp.id]: `✓ ${me.created} nových, ${me.updated} update z ${me.total}` }))
        else setTestResult(prev => ({ ...prev, [emp.id]: '✓ OK (žádné záznamy)' }))
      }
    } catch (e) {
      setTestResult(prev => ({ ...prev, [emp.id]: `❌ ${e instanceof Error ? e.message : 'Chyba'}` }))
    }
    setTestingId(null)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notion sync</h1>
        <p className="text-sm text-gray-500 mt-1">
          Konfigurace zaměstnaneckých Notion DB. Každý zaměstnanec má vlastní Tasks DB v Notionu,
          ta se synchronizuje do variabilních nákladů.
        </p>
      </div>

      {/* Companies info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Companies DB</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-gray-600">
            Notion DB s klienty (firmami) se konfiguruje přes env var <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">NOTION_COMPANIES_DB_ID</code> ve Vercelu.
          </p>
          <p className="text-gray-600">
            <strong>Důležité:</strong> Companies DB musí být ručně sdílená s integrací Notion. Otevři ji v Notionu → <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">⋯ → Connections → Add</code> → vybrat integraci.
          </p>
        </CardContent>
      </Card>

      {/* Employees DB list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zaměstnanecké Tasks DB</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Zatím žádní zaměstnanci. Přidej prvního níže.
            </div>
          ) : (
            <div className="space-y-2">
              {employees.map(emp => (
                <div key={emp.id} className={cn('rounded-lg border p-3', emp.active ? 'bg-white' : 'bg-gray-50 opacity-60')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{emp.team_member}</p>
                      <p className="text-xs font-mono text-gray-500 truncate">{emp.notion_database_id}</p>
                      {emp.notes && <p className="text-xs text-gray-500 mt-1">{emp.notes}</p>}
                      {testResult[emp.id] && (
                        <p className={cn('text-xs mt-1', testResult[emp.id].startsWith('✓') ? 'text-green-700' : 'text-red-700')}>
                          {testResult[emp.id]}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(emp)}
                        className={cn(
                          'text-xs px-2 py-1 rounded',
                          emp.active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                        )}
                      >
                        {emp.active ? 'Aktivní' : 'Pauza'}
                      </button>
                      <a
                        href={`https://notion.so/${emp.notion_database_id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-gray-400 hover:text-gray-900"
                        title="Otevřít v Notionu"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => handleTest(emp)}
                        disabled={testingId === emp.id}
                        className="text-gray-400 hover:text-gray-900 disabled:opacity-50"
                        title="Otestovat sync"
                      >
                        {testingId === emp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => handleDelete(emp.id)} className="text-gray-400 hover:text-red-600" title="Odstranit">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Přidat nového */}
          <form onSubmit={handleAdd} className="border-2 border-dashed border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Přidat zaměstnance</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-500">Jméno *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="např. Adam Onderka" />
              </div>
              <div>
                <Label className="text-xs text-gray-500">Notion DB ID *</Label>
                <Input
                  value={newDbId}
                  onChange={e => setNewDbId(e.target.value)}
                  placeholder="32 hex znaků z URL"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Poznámka</Label>
              <Input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="volitelné" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={adding || !newName.trim() || !newDbId.trim()}>
                {adding ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Přidávám</> : <><Plus className="h-3.5 w-3.5 mr-1.5" />Přidat</>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Návod */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Návod</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p><strong>1.</strong> Pro každého zaměstnance otevři jeho Notion Tasks DB → <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">⋯ → Connections → Add</code> → vyber integraci <strong>Claude code - Finanční dashboard</strong>.</p>
          <p><strong>2.</strong> Zkopíruj DB ID z URL (32 hex znaků mezi posledním <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">/</code> a <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">?v=</code>).</p>
          <p><strong>3.</strong> Vyplň formulář výše. Po přidání můžeš otestovat tlačítkem <RefreshCw className="h-3 w-3 inline" /> u řádku.</p>
          <p><strong>4.</strong> Plný sync všech zaměstnanců najednou: <a href="/costs/variable" className="text-primary-900 underline">/costs/variable</a> → Sync z Notion.</p>
        </CardContent>
      </Card>
    </div>
  )
}
