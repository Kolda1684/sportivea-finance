'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Upload, CheckCircle, AlertCircle, X, Pencil, Trash2, AlertCircle as AlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate, getCurrentMonth, getLastNMonths, formatMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { EditVariableCostModal } from '@/components/costs/EditVariableCostModal'
import type { VariableCost } from '@/types'

const TEAM_MEMBERS = ['Adam Onderka', 'Anna Švaralová', 'Daniel Richtr', 'Filip Telenský', 'Jan Pachota', 'Michal Komárek', 'Ondřej Cetkovský', 'Ondřej Kolář', 'Vojtěch Kepka']

// ─── CSV Import Banner ──────────────────────────────────────────────────────
function CsvImportBanner({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      setStatus('error')
      setMessage('Soubor musí být ve formátu CSV')
      return
    }
    setStatus('uploading')
    setMessage('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/costs/variable/import', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Chyba importu')
      setStatus('ok')
      setMessage(`Importováno ${json.imported} z ${json.total} záznamů`)
      onImported()
    } catch (e: unknown) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : 'Neznámá chyba')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  if (status === 'ok') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
        <p className="text-sm text-green-800 flex-1">{message}</p>
        <button onClick={() => setStatus('idle')}><X className="h-4 w-4 text-green-600" /></button>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-700 flex-1">{message}</p>
        <button onClick={() => setStatus('idle')}><X className="h-4 w-4 text-red-500" /></button>
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center hover:border-primary-900 hover:bg-primary-50 transition-colors cursor-pointer"
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
      {status === 'uploading' ? (
        <p className="text-sm text-gray-600 font-medium">Importuji…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">Přetáhni CSV nebo klikni pro výběr</p>
          <p className="text-xs text-gray-500 mt-1">
            Export z Google Sheets: Soubor → Stáhnout → Hodnoty oddělené čárkami (.csv)
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Očekávané sloupce: Jméno, Klient, Počet hodin, Cena, Úkon, Datum, Task, Měsíc, ID
          </p>
        </>
      )}
    </div>
  )
}

// ─── Hlavní stránka ─────────────────────────────────────────────────────────
export default function VariableCostsPage() {
  const [costs, setCosts] = useState<VariableCost[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(getCurrentMonth())
  const [memberFilter, setMemberFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [showImport, setShowImport] = useState(false)
  const [editCost, setEditCost] = useState<VariableCost | null>(null)

  const months = getLastNMonths(12)

  const fetchCosts = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ month })
    if (memberFilter !== 'all') params.set('member', memberFilter)
    if (clientFilter !== 'all') params.set('client', clientFilter)
    const res = await fetch(`/api/costs/variable?${params}`)
    const data: VariableCost[] = await res.json()
    setCosts(data)
    setLoading(false)
  }, [month, memberFilter, clientFilter])

  useEffect(() => { fetchCosts() }, [fetchCosts])

  const totalPrice = costs.reduce((s, c) => s + (c.price ?? 0), 0)
  const totalHours = costs.reduce((s, c) => s + (c.hours ?? 0), 0)

  const byClient = costs.reduce<Record<string, number>>((acc, c) => {
    if (c.client) acc[c.client] = (acc[c.client] ?? 0) + (c.price ?? 0)
    return acc
  }, {})

  const byMember = costs.reduce<Record<string, { price: number; hours: number }>>((acc, c) => {
    const name = c.team_member ?? 'Neznámý'
    if (!acc[name]) acc[name] = { price: 0, hours: 0 }
    acc[name].price += c.price ?? 0
    acc[name].hours += c.hours ?? 0
    return acc
  }, {})

  const uniqueClients = Array.from(new Set(costs.map(c => c.client).filter(Boolean)))

  return (
    <div className="p-8 space-y-6">
      {/* Hlavička */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Variabilní náklady</h1>
          <p className="text-sm text-gray-500 mt-1">
            {costs.length} záznamů · {totalHours} h · {formatCZK(totalPrice)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(!showImport)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Přidat ručně
          </Button>
        </div>
      </div>

      {/* CSV Import */}
      {showImport && (
        <CsvImportBanner
          onImported={() => {
            fetchCosts()
            setShowImport(false)
          }}
        />
      )}

      {/* Filtry */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {formatMonth(m).charAt(0).toUpperCase() + formatMonth(m).slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Člen týmu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni členové</SelectItem>
            {TEAM_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Klient" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni klienti</SelectItem>
            {uniqueClients.map(c => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Souhrnné karty po členech */}
      {Object.keys(byMember).length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(byMember).map(([name, d]) => (
            <div key={name} className="rounded-xl border bg-white p-4">
              <p className="text-xs text-muted-foreground font-medium">{name}</p>
              <p className="text-lg font-bold text-red-600 mt-1">{formatCZK(d.price)}</p>
              <p className="text-xs text-muted-foreground">{d.hours} h</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabulka */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Jméno', 'Klient', 'Task', 'Typ', 'Datum', 'Hodiny', 'Cena', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {costs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>Žádné záznamy — importuj CSV z Google Sheets</p>
                    <button
                      onClick={() => setShowImport(true)}
                      className="mt-2 text-sm text-primary-900 hover:underline"
                    >
                      Otevřít import
                    </button>
                  </td>
                </tr>
              ) : costs.map((cost) => {
                const missingClient = !cost.client
                return (
                  <tr key={cost.id} className={cn('transition-colors group', missingClient ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-50')}>
                    <td className="px-4 py-2.5 font-medium">{cost.team_member ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {missingClient ? (
                        <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                          <AlertIcon className="h-3 w-3" />
                          chybí klient
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{cost.client}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px] truncate" title={cost.task_name ?? ''}>{cost.task_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{cost.task_type ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(cost.date)}</td>
                    <td className="px-4 py-2.5 text-right">{cost.hours ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">
                      {cost.price != null ? formatCZK(cost.price) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setEditCost(cost)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 text-muted-foreground hover:text-gray-700"
                        title="Upravit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {costs.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">CELKEM</td>
                  <td className="px-4 py-2.5 text-right font-bold text-sm">{totalHours} h</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600 text-sm">{formatCZK(totalPrice)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <EditVariableCostModal
        cost={editCost}
        open={!!editCost}
        onClose={() => setEditCost(null)}
        onSaved={(updated) => {
          setCosts(prev => prev.map(c => c.id === updated.id ? updated : c))
          setEditCost(null)
        }}
      />

      {/* Přehled po klientech */}
      {Object.keys(byClient).length > 0 && (
        <div className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold mb-4">Náklady po klientech</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left text-xs text-muted-foreground uppercase">Klient</th>
                <th className="pb-2 text-right text-xs text-muted-foreground uppercase">Náklady</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Object.entries(byClient).sort(([, a], [, b]) => b - a).map(([client, total]) => (
                <tr key={client}>
                  <td className="py-2">{client}</td>
                  <td className="py-2 text-right font-medium text-red-600">{formatCZK(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
