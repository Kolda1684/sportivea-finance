'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Clock, XCircle, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCZK, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Invoice {
  id: string
  fakturoid_id: string
  number: string
  subject_name: string
  issued_on: string
  due_on: string
  total: number
  currency: string
  status: string
  variable_symbol: string
  note: string | null
  pdf_url: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:          { label: 'Nezaplacena',  color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
  sent:          { label: 'Odeslaná',     color: 'bg-blue-100 text-blue-800',     icon: <FileText className="h-3 w-3" /> },
  overdue:       { label: 'Po splatnosti',color: 'bg-red-100 text-red-800',       icon: <AlertCircle className="h-3 w-3" /> },
  paid:          { label: 'Zaplacena',    color: 'bg-green-100 text-green-800',   icon: <CheckCircle className="h-3 w-3" /> },
  cancelled:     { label: 'Stornována',   color: 'bg-gray-100 text-gray-600',     icon: <XCircle className="h-3 w-3" /> },
  uncollectible: { label: 'Nedobytná',    color: 'bg-red-100 text-red-900',       icon: <XCircle className="h-3 w-3" /> },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cfg.color)}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    const res = await fetch(`/api/invoices${params}`)
    const data = await res.json()
    setInvoices(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/invoices/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba synchronizace')
      setSyncMsg({ ok: true, text: `Synchronizováno ${data.imported} faktur z Fakturoid` })
      fetchInvoices()
    } catch (e: unknown) {
      setSyncMsg({ ok: false, text: e instanceof Error ? e.message : 'Chyba synchronizace' })
    } finally {
      setSyncing(false)
    }
  }

  // Statistiky
  const total = invoices.reduce((s, i) => s + (i.total ?? 0), 0)
  const unpaid = invoices.filter(i => i.status === 'open' || i.status === 'sent').reduce((s, i) => s + (i.total ?? 0), 0)
  const overdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.total ?? 0), 0)
  const paid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total ?? 0), 0)

  return (
    <div className="p-8 space-y-6">
      {/* Hlavička */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faktury</h1>
          <p className="text-sm text-gray-500 mt-1">{invoices.length} faktur · synchronizováno z Fakturoid</p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw className={cn('h-4 w-4 mr-2', syncing && 'animate-spin')} />
          {syncing ? 'Synchronizuji…' : 'Sync z Fakturoid'}
        </Button>
      </div>

      {/* Sync zpráva */}
      {syncMsg && (
        <div className={cn('flex items-center gap-3 rounded-xl border p-4 text-sm',
          syncMsg.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        )}>
          {syncMsg.ok ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {syncMsg.text}
        </div>
      )}

      {/* Statistiky */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Celkem fakturováno', value: formatCZK(total), color: 'text-gray-900' },
          { label: 'Nezaplaceno', value: formatCZK(unpaid), color: 'text-yellow-600' },
          { label: 'Po splatnosti', value: formatCZK(overdue), color: 'text-red-600' },
          { label: 'Zaplaceno', value: formatCZK(paid), color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
            <p className={cn('text-xl font-bold mt-1', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtr */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Všechny statusy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny statusy</SelectItem>
            <SelectItem value="open">Nezaplacené</SelectItem>
            <SelectItem value="sent">Odeslané</SelectItem>
            <SelectItem value="overdue">Po splatnosti</SelectItem>
            <SelectItem value="paid">Zaplacené</SelectItem>
            <SelectItem value="cancelled">Stornované</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabulka */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Číslo', 'Klient', 'Vystaveno', 'Splatnost', 'Částka', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>Žádné faktury — klikni na "Sync z Fakturoid"</p>
                  </td>
                </tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.number}</td>
                  <td className="px-4 py-3 font-medium">{inv.subject_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.issued_on)}</td>
                  <td className={cn('px-4 py-3', inv.status === 'overdue' && 'text-red-600 font-medium')}>
                    {formatDate(inv.due_on)}
                  </td>
                  <td className="px-4 py-3 font-bold">{formatCZK(inv.total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3">
                    {inv.pdf_url && (
                      <a
                        href={inv.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-gray-900 transition-colors"
                        title="Otevřít PDF"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {invoices.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">CELKEM</td>
                  <td className="px-4 py-2.5 font-bold text-sm">{formatCZK(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
