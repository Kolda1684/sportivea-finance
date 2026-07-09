'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Plus, Trash2,
  Clock, ChevronRight, Link2, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface InvoiceItem {
  name: string
  quantity: number
  unit: string | null
  unit_price: number
  vat_rate: number
}

interface ExtractedInvoice {
  document_type: 'invoice' | 'receipt' | 'other'
  supplier_name: string | null
  supplier_ico: string | null
  supplier_dic: string | null
  supplier_address: string | null
  invoice_number: string | null
  variable_symbol: string | null
  issued_on: string | null
  received_on: string | null
  taxable_supply_date: string | null
  due_on: string | null
  currency: string
  vat_mode: 'standard' | 'none'
  items: InvoiceItem[]
  total_without_vat: number | null
  vat_amount: number | null
  total_with_vat: number | null
  note: string | null
}

interface OcrWarning { field: string; message: string }
interface DuplicateRef { id: string; supplier_name: string | null; amount: number | null; date: string | null; review_status: string }

type ItemStatus = 'pending' | 'reading' | 'extracted' | 'submitting' | 'done' | 'error'

interface SuggestedTx {
  id: string
  date: string
  amount: number
  amount_czk: number | null
  currency: string
  counterparty_name: string | null
  message: string | null
  score: number
}

interface QueueItem {
  id: string
  // For locally uploaded files: file blob (used for preview URL)
  // For drafts loaded from server: no file blob, we use signed file_url instead
  file: File | null
  filename: string
  previewUrl: string | null
  status: ItemStatus
  draftId: string | null
  extracted: ExtractedInvoice | null
  warnings: OcrWarning[]
  duplicateOf: DuplicateRef | null
  result: { fakturoid_id: number; number: string } | null
  errorMsg: string
  duzpManual: boolean
  vatCalcMode: 'from_base' | 'from_total'
  suggestedTx: SuggestedTx | null
  matchConfirmed: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusIcon(status: ItemStatus) {
  switch (status) {
    case 'pending':    return <Clock className="h-3.5 w-3.5 text-gray-400" />
    case 'reading':    return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
    case 'extracted':  return <FileText className="h-3.5 w-3.5 text-yellow-500" />
    case 'submitting': return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
    case 'done':       return <CheckCircle className="h-3.5 w-3.5 text-green-500" />
    case 'error':      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
  }
}

function statusLabel(status: ItemStatus) {
  switch (status) {
    case 'pending':    return 'Čeká'
    case 'reading':    return 'Čtu…'
    case 'extracted':  return 'Ke kontrole'
    case 'submitting': return 'Odesílám…'
    case 'done':       return 'Schváleno'
    case 'error':      return 'Chyba'
  }
}

function Field({ label, value, onChange, type = 'text', warning }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; warning?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-500 flex items-center gap-1">
        {label}
        {warning && <span title={warning} className="text-yellow-500">⚠</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900',
          warning ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
        )}
      />
    </div>
  )
}

function fileToPreviewUrl(file: File | null): string | null {
  if (!file) return null
  return URL.createObjectURL(file)
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function UploadInvoicePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftsLoaded, setDraftsLoaded] = useState(false)

  // Debounced auto-save: map of draftId → timeout
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const selected = queue.find(q => q.id === selectedId) ?? null

  const patch = useCallback((id: string, update: Partial<QueueItem>) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...update } : q))
  }, [])

  // Load existing drafts on mount so refresh doesn't lose work
  useEffect(() => {
    let cancelled = false
    fetch('/api/invoices/drafts')
      .then(r => r.json())
      .then((data: { drafts?: Array<{ id: string; extracted_data: ExtractedInvoice; ocr_warnings: OcrWarning[]; file_url: string | null; original_filename: string | null; supplier_name: string | null }> }) => {
        if (cancelled) return
        const items: QueueItem[] = (data.drafts ?? []).map(d => ({
          id: crypto.randomUUID(),
          file: null,
          filename: d.original_filename ?? d.supplier_name ?? 'Draft',
          previewUrl: d.file_url,
          status: 'extracted',
          draftId: d.id,
          extracted: d.extracted_data,
          warnings: d.ocr_warnings ?? [],
          duplicateOf: null,
          result: null,
          errorMsg: '',
          duzpManual: false,
          vatCalcMode: 'from_base',
          suggestedTx: null,
          matchConfirmed: false,
        }))
        setQueue(items)
        if (items.length > 0) setSelectedId(items[0].id)
        setDraftsLoaded(true)
      })
      .catch(() => setDraftsLoaded(true))
    return () => { cancelled = true }
  }, [])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      queue.forEach(q => { if (q.file && q.previewUrl) URL.revokeObjectURL(q.previewUrl) })
      Object.values(saveTimers.current).forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Schedule a debounced PATCH for a draft
  const scheduleSave = useCallback((draftId: string, extracted: ExtractedInvoice) => {
    if (saveTimers.current[draftId]) clearTimeout(saveTimers.current[draftId])
    saveTimers.current[draftId] = setTimeout(async () => {
      delete saveTimers.current[draftId]
      try {
        await fetch(`/api/invoices/drafts/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extracted }),
        })
      } catch { /* silent — user is editing, retry on next change */ }
    }, 800)
  }, [])

  // Extract one file (server saves draft)
  const extractItem = useCallback(async (item: QueueItem) => {
    patch(item.id, { status: 'reading' })
    try {
      if (!item.file) throw new Error('Chybí soubor')
      const form = new FormData()
      form.append('file', item.file)
      const res = await fetch('/api/invoices/extract', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba při čtení faktury')
      patch(item.id, {
        status: 'extracted',
        draftId: data.draft_id,
        extracted: data.extracted,
        warnings: data.warnings ?? [],
        duplicateOf: data.duplicate_of ?? null,
      })
    } catch (e) {
      patch(item.id, { status: 'error', errorMsg: e instanceof Error ? e.message : 'Neznámá chyba' })
    }
  }, [patch])

  const addFiles = useCallback((files: File[]) => {
    const newItems: QueueItem[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      filename: file.name,
      previewUrl: fileToPreviewUrl(file),
      status: 'pending' as ItemStatus,
      draftId: null,
      extracted: null,
      warnings: [],
      duplicateOf: null,
      result: null,
      errorMsg: '',
      duzpManual: false,
      vatCalcMode: 'from_base',
      suggestedTx: null,
      matchConfirmed: false,
    }))
    setQueue(prev => [...prev, ...newItems])
    if (newItems.length > 0) setSelectedId(newItems[0].id)
    // Sekvenčně zpracuj nahrané soubory — chrání nás před rate-limity Claude API
    void (async () => {
      for (const item of newItems) await extractItem(item)
    })()
  }, [extractItem])

  // Approve = send to Fakturoid
  async function approveItem(id: string) {
    const item = queue.find(q => q.id === id)
    if (!item?.draftId || !item.extracted) return
    patch(id, { status: 'submitting' })
    try {
      const { extracted, vatCalcMode, draftId } = item
      // Pokud byly položky zadány jako "z celkové ceny", přepočítej před odesláním
      const extractedToSend = vatCalcMode === 'from_total'
        ? { ...extracted, items: extracted.items.map(it => ({ ...it, unit_price: it.unit_price / (1 + it.vat_rate / 100) })) }
        : extracted

      // Nejprve uložit aktuální editovaný stav (pokud čeká debounced save)
      if (saveTimers.current[draftId]) {
        clearTimeout(saveTimers.current[draftId])
        delete saveTimers.current[draftId]
      }
      const patchRes = await fetch(`/api/invoices/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted: extractedToSend }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        throw new Error(`Uložení změn selhalo: ${err.error ?? patchRes.status}`)
      }

      const res = await fetch(`/api/invoices/drafts/${draftId}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Schválení selhalo')

      patch(id, {
        status: 'done',
        result: { fakturoid_id: data.fakturoid_id, number: data.number },
        suggestedTx: data.suggestedTx ?? null,
      })

      // Dávkový průchod: pokud schválená faktura nemá bankovní návrh k potvrzení,
      // přeskoč rovnou na další fakturu ke kontrole
      if (!data.suggestedTx) selectNextForReview(id)
    } catch (e) {
      patch(id, { status: 'error', errorMsg: e instanceof Error ? e.message : 'Neznámá chyba' })
    }
  }

  // Najdi další položku ke kontrole (v pořadí fronty, začíná za aktuální)
  function selectNextForReview(afterId: string) {
    setQueue(prev => {
      const idx = prev.findIndex(q => q.id === afterId)
      const ordered = [...prev.slice(idx + 1), ...prev.slice(0, idx)]
      const next = ordered.find(q => q.status === 'extracted')
      if (next) setSelectedId(next.id)
      return prev
    })
  }

  async function confirmMatch(queueId: string, txId: string, expenseInvoiceId: string) {
    await fetch(`/api/banking/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_match', expense_invoice_id: expenseInvoiceId }),
    })
    patch(queueId, { matchConfirmed: true })
    selectNextForReview(queueId)
  }

  async function removeItem(id: string) {
    const item = queue.find(q => q.id === id)
    if (!item) return
    // Pokud má draft v DB a ještě neschválen, smaž ho
    if (item.draftId && item.status !== 'done') {
      try {
        await fetch(`/api/invoices/drafts/${item.draftId}`, { method: 'DELETE' })
      } catch { /* už nemůžeme — pokračuj v UI cleanup */ }
    }
    if (item.file && item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setQueue(prev => prev.filter(q => q.id !== id))
    if (selectedId === id) setSelectedId(queue.find(q => q.id !== id)?.id ?? null)
  }

  function updateExtracted(id: string, update: Partial<ExtractedInvoice>) {
    setQueue(prev => prev.map(q => {
      if (q.id !== id || !q.extracted) return q
      const newExt = { ...q.extracted, ...update }
      if (q.draftId) scheduleSave(q.draftId, newExt)
      return { ...q, extracted: newExt }
    }))
  }

  function updateItem(queueId: string, itemIdx: number, patch2: Partial<InvoiceItem>) {
    setQueue(prev => prev.map(q => {
      if (q.id !== queueId || !q.extracted) return q
      const newExt = { ...q.extracted, items: q.extracted.items.map((it, i) => i === itemIdx ? { ...it, ...patch2 } : it) }
      if (q.draftId) scheduleSave(q.draftId, newExt)
      return { ...q, extracted: newExt }
    }))
  }

  function addLineItem(queueId: string) {
    setQueue(prev => prev.map(q => {
      if (q.id !== queueId || !q.extracted) return q
      const newExt = { ...q.extracted, items: [...q.extracted.items, { name: '', quantity: 1, unit: null, unit_price: 0, vat_rate: 21 }] }
      if (q.draftId) scheduleSave(q.draftId, newExt)
      return { ...q, extracted: newExt }
    }))
  }

  function removeLineItem(queueId: string, itemIdx: number) {
    setQueue(prev => prev.map(q => {
      if (q.id !== queueId || !q.extracted) return q
      const newExt = { ...q.extracted, items: q.extracted.items.filter((_, i) => i !== itemIdx) }
      if (q.draftId) scheduleSave(q.draftId, newExt)
      return { ...q, extracted: newExt }
    }))
  }

  function computeTotals(item: QueueItem) {
    const items = item.extracted?.items ?? []
    const mode = item.vatCalcMode
    const withoutVat = mode === 'from_base'
      ? items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
      : items.reduce((s, it) => s + it.quantity * it.unit_price / (1 + it.vat_rate / 100), 0)
    const total = mode === 'from_base'
      ? items.reduce((s, it) => s + it.quantity * it.unit_price * (1 + it.vat_rate / 100), 0)
      : items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
    return { withoutVat, total, vat: total - withoutVat }
  }

  const pendingCount = queue.filter(q => q.status === 'pending' || q.status === 'reading').length
  const doneCount = queue.filter(q => q.status === 'done').length
  const draftCount = queue.filter(q => q.status === 'extracted').length

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-8 gap-6 min-h-0">

      <div className="flex-shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Upload faktur</h1>
          <p className="text-sm text-gray-500 mt-1">
            Nahraj fakturu — AI ji přečte, ty zkontroluješ, schválíš → poletí do Fakturoidu.
          </p>
        </div>
        {queue.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {pendingCount > 0 && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {pendingCount} čtu</span>}
            {draftCount > 0 && <span className="flex items-center gap-1 text-yellow-700"><FileText className="h-3 w-3" /> {draftCount} ke kontrole</span>}
            {doneCount > 0 && <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" /> {doneCount} schváleno</span>}
          </div>
        )}
      </div>

      <div
        className="flex-shrink-0"
        onDrop={e => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*,.heic"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) { addFiles(Array.from(e.target.files)); e.target.value = '' } }}
        />
        <div className={cn(
          'rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
          queue.length > 0
            ? 'border-primary-900/30 bg-primary-50/20 hover:bg-primary-50/40 py-4'
            : 'border-gray-300 bg-gray-50 hover:border-primary-900 hover:bg-primary-50/20 py-10'
        )}>
          <Upload className={cn('mx-auto text-gray-400 mb-2', queue.length > 0 ? 'h-6 w-6' : 'h-10 w-10 mb-3')} />
          <p className={cn('font-medium text-gray-700', queue.length > 0 ? 'text-sm' : 'text-base')}>
            {queue.length > 0 ? 'Přidat další faktury' : 'Přetáhni faktury nebo klikni pro výběr'}
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, HEIC · více souborů najednou</p>
        </div>
      </div>

      {queue.length === 0 && draftsLoaded && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Zatím žádné faktury
        </div>
      )}

      {queue.length === 0 && !draftsLoaded && (
        <div className="flex-1 flex items-center justify-center gap-2 text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítám drafty…
        </div>
      )}

      {queue.length > 0 && (
        <div className="flex flex-1 gap-4 min-h-0">

          <div className="w-56 flex-shrink-0 flex flex-col gap-1 overflow-y-auto">
            {queue.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors w-full group',
                  selectedId === item.id ? 'bg-primary-900 text-white' : 'hover:bg-gray-100 text-gray-700'
                )}
              >
                {statusIcon(item.status)}
                <span className="flex-1 truncate text-xs font-medium">{item.filename}</span>
                <span className={cn(
                  'text-xs flex-shrink-0',
                  selectedId === item.id ? 'text-primary-200' : 'text-gray-400'
                )}>
                  {statusLabel(item.status)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeItem(item.id) }}
                  className={cn(
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                    selectedId === item.id ? 'text-primary-200 hover:text-white' : 'text-gray-300 hover:text-red-500'
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto">
            {!selected && (
              <div className="flex h-full items-center justify-center text-gray-400 text-sm">
                <ChevronRight className="h-4 w-4 mr-1" /> Vyber fakturu ze seznamu
              </div>
            )}

            {selected && selected.status === 'reading' && (
              <div className="flex h-64 items-center justify-center gap-3 text-gray-500 text-sm">
                <Loader2 className="h-5 w-5 animate-spin" /> Claude čte fakturu…
              </div>
            )}

            {selected && selected.status === 'pending' && (
              <div className="flex h-64 items-center justify-center gap-3 text-gray-400 text-sm">
                <Clock className="h-5 w-5" /> Čeká na zpracování…
              </div>
            )}

            {selected && selected.status === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <pre className="whitespace-pre-wrap font-sans">{selected.errorMsg}</pre>
              </div>
            )}

            {selected && selected.status === 'done' && selected.result && (
              <div className="space-y-3">
                <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                      <p className="font-semibold text-green-900">
                        Náklad <span className="font-mono">{selected.result.number}</span> byl vložen do Fakturoidu
                      </p>
                    </div>
                    {draftCount > 0 && (
                      <Button size="sm" onClick={() => selectNextForReview(selected.id)}>
                        Další ke kontrole ({draftCount})
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>

                {draftCount === 0 && pendingCount === 0 && doneCount > 1 && (
                  <div className="rounded-xl border border-green-100 bg-green-50/50 p-3 text-sm text-green-800 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    Hotovo — všech {doneCount} faktur je ve Fakturoidu 🎉
                  </div>
                )}

                {selected.suggestedTx && !selected.matchConfirmed && selected.draftId && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
                    <Link2 className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-blue-900 mb-0.5">Pravděpodobná shoda v bance</p>
                      <p className="text-sm text-blue-700">
                        {new Date(selected.suggestedTx.date + 'T12:00:00').toLocaleDateString('cs-CZ')}
                        {' · '}
                        {selected.suggestedTx.counterparty_name || selected.suggestedTx.message || '—'}
                        {' · '}
                        <span className="font-medium tabular-nums">
                          {Math.abs(selected.suggestedTx.amount_czk ?? selected.suggestedTx.amount).toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {selected.suggestedTx.currency}
                        </span>
                      </p>
                      <p className="text-xs text-blue-500 mt-0.5">Shoda: {selected.suggestedTx.score} / 100</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => confirmMatch(selected.id, selected.suggestedTx!.id, selected.draftId!)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Spárovat
                      </button>
                      <button
                        onClick={() => { patch(selected.id, { suggestedTx: null }); selectNextForReview(selected.id) }}
                        className="px-3 py-1.5 border border-blue-200 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        Přeskočit
                      </button>
                    </div>
                  </div>
                )}

                {selected.matchConfirmed && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 flex items-center gap-2 text-sm text-blue-700">
                    <CheckCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    Faktura spárována s bankovní transakcí
                  </div>
                )}
              </div>
            )}

            {selected && (selected.status === 'extracted' || selected.status === 'submitting') && selected.extracted && (
              <DetailPanel
                item={selected}
                onUpdateExtracted={upd => updateExtracted(selected.id, upd)}
                onUpdateItem={(idx, upd) => updateItem(selected.id, idx, upd)}
                onAddItem={() => addLineItem(selected.id)}
                onRemoveItem={idx => removeLineItem(selected.id, idx)}
                onToggleVatMode={() => patch(selected.id, { vatCalcMode: selected.vatCalcMode === 'from_base' ? 'from_total' : 'from_base' })}
                onToggleDuzp={() => patch(selected.id, { duzpManual: true })}
                onApprove={() => approveItem(selected.id)}
                onRemove={() => removeItem(selected.id)}
                totals={computeTotals(selected)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({
  item, onUpdateExtracted, onUpdateItem, onAddItem, onRemoveItem,
  onToggleVatMode, onToggleDuzp, onApprove, onRemove, totals,
}: {
  item: QueueItem
  onUpdateExtracted: (u: Partial<ExtractedInvoice>) => void
  onUpdateItem: (i: number, u: Partial<InvoiceItem>) => void
  onAddItem: () => void
  onRemoveItem: (i: number) => void
  onToggleVatMode: () => void
  onToggleDuzp: () => void
  onApprove: () => void
  onRemove: () => void
  totals: { withoutVat: number; total: number; vat: number }
}) {
  const ext = item.extracted!
  const warningByField = new Map(item.warnings.map(w => [w.field, w.message]))
  const isPdf = item.previewUrl?.toLowerCase().includes('.pdf') || item.file?.type === 'application/pdf'

  // PDF ze storage stahujeme jako blob — signed URL má hlavičky (CSP sandbox),
  // kvůli kterým Chrome v iframe nezobrazí PDF viewer (černý panel)
  const [pdfSrc, setPdfSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!item.previewUrl || !isPdf) { setPdfSrc(null); return }
    if (item.file || item.previewUrl.startsWith('blob:')) { setPdfSrc(item.previewUrl); return }
    let cancelled = false
    let objectUrl: string | null = null
    fetch(item.previewUrl)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
      .then(b => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(b.slice(0, b.size, 'application/pdf'))
        setPdfSrc(objectUrl)
      })
      .catch(() => { if (!cancelled) setPdfSrc(item.previewUrl) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [item.previewUrl, item.file, isPdf])

  return (
    <div className="flex gap-4 items-start">

      <div className="w-[520px] flex-shrink-0 rounded-xl border overflow-hidden bg-gray-100 sticky top-0 flex flex-col" style={{ height: '90vh' }}>
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-white flex-shrink-0">
          <span className="text-xs font-medium text-gray-500 truncate">{item.filename}</span>
          {item.previewUrl && (
            <a
              href={pdfSrc ?? item.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline whitespace-nowrap"
            >
              Otevřít v novém okně ↗
            </a>
          )}
        </div>
        <div className="flex-1 min-h-0">
          {item.previewUrl && isPdf && pdfSrc && (
            <iframe src={pdfSrc} className="w-full h-full" title="Náhled faktury" />
          )}
          {item.previewUrl && isPdf && !pdfSrc && (
            <div className="w-full h-full flex items-center justify-center gap-2 text-gray-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Načítám náhled…
            </div>
          )}
          {item.previewUrl && !isPdf && (
            <img src={item.previewUrl} alt="Náhled faktury" className="w-full h-full object-contain" />
          )}
          {!item.previewUrl && (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
              Náhled není k dispozici
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-4">

        {item.duplicateOf && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 flex items-start gap-2 text-sm text-orange-900">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">Možný duplikát</p>
              <p className="text-xs text-orange-800 mt-0.5">
                {item.duplicateOf.supplier_name ?? 'neznámý dodavatel'} · {item.duplicateOf.date ?? '—'} · {item.duplicateOf.amount?.toLocaleString('cs-CZ') ?? '—'} Kč
                {' '}({item.duplicateOf.review_status === 'draft' ? 'existující draft' : 'už ve Fakturoidu'})
              </p>
            </div>
          </div>
        )}

        {item.warnings.length > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              Pole označená ⚠ si prosím zkontroluj
            </div>
            <ul className="text-xs text-yellow-700 list-disc ml-5">
              {item.warnings.slice(0, 5).map((w, i) => <li key={i}>{w.field}: {w.message}</li>)}
            </ul>
          </div>
        )}

        <div className="rounded-xl border bg-white p-5 space-y-5">

          <div className="space-y-1">
            <label className="text-xs text-gray-500">Typ dokumentu</label>
            <div className="flex gap-2">
              {(['invoice', 'receipt', 'other'] as const).map(t => (
                <button key={t}
                  onClick={() => onUpdateExtracted({ document_type: t })}
                  className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors',
                    ext.document_type === t ? 'bg-primary-900 text-white border-primary-900' : 'border-gray-200 text-gray-600 hover:border-primary-900'
                  )}>
                  {t === 'invoice' ? 'Faktura' : t === 'receipt' ? 'Účtenka' : 'Jiný'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Dodavatel" value={ext.supplier_name ?? ''} warning={warningByField.get('supplier_name')}
                onChange={v => onUpdateExtracted({ supplier_name: v || null })} />
            </div>
            <Field label="IČO" value={ext.supplier_ico ?? ''} warning={warningByField.get('supplier_ico')}
              onChange={v => onUpdateExtracted({ supplier_ico: v || null })} />
            <Field label="DIČ" value={ext.supplier_dic ?? ''} warning={warningByField.get('supplier_dic')}
              onChange={v => onUpdateExtracted({ supplier_dic: v || null })} />
            <div className="col-span-2">
              <Field label="Adresa" value={ext.supplier_address ?? ''} warning={warningByField.get('supplier_address')}
                onChange={v => onUpdateExtracted({ supplier_address: v || null })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Číslo dokladu" value={ext.invoice_number ?? ''} warning={warningByField.get('invoice_number')}
              onChange={v => onUpdateExtracted({ invoice_number: v || null })} />
            <Field label="Variabilní symbol" value={ext.variable_symbol ?? ''} warning={warningByField.get('variable_symbol')}
              onChange={v => onUpdateExtracted({ variable_symbol: v || null })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vystaven" type="date" value={ext.issued_on ?? ''} warning={warningByField.get('issued_on')}
              onChange={v => {
                onUpdateExtracted({
                  issued_on: v || null,
                  taxable_supply_date: !item.duzpManual ? (v || null) : ext.taxable_supply_date,
                })
              }} />
            <Field label="Přijat" type="date" value={ext.received_on ?? ''} warning={warningByField.get('received_on')}
              onChange={v => onUpdateExtracted({ received_on: v || null })} />
            <Field label="Zdanitelné plnění (DUZP)" type="date" value={ext.taxable_supply_date ?? ''} warning={warningByField.get('taxable_supply_date')}
              onChange={v => { onToggleDuzp(); onUpdateExtracted({ taxable_supply_date: v || null }) }} />
            <Field label="Splatnost" type="date" value={ext.due_on ?? ''} warning={warningByField.get('due_on')}
              onChange={v => onUpdateExtracted({ due_on: v || null })} />
          </div>

          <div className="w-32">
            <Field label="Měna" value={ext.currency} warning={warningByField.get('currency')}
              onChange={v => onUpdateExtracted({ currency: v })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Položky</p>
              <p className="text-xs text-gray-500">
                DPH počítám z{' '}
                <button onClick={onToggleVatMode} className="font-semibold text-primary-900 underline underline-offset-2 hover:text-primary-700">
                  {item.vatCalcMode === 'from_base' ? 'Základu' : 'Celkové částky'}
                </button>
              </p>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500">Popis</th>
                    <th className="px-3 py-2 text-right text-gray-500 w-16">Ks</th>
                    <th className="px-3 py-2 text-right text-gray-500 w-28">
                      {item.vatCalcMode === 'from_base' ? 'Cena/ks (bez DPH)' : 'Cena/ks (s DPH)'}
                    </th>
                    <th className="px-3 py-2 text-right text-gray-500 w-16">DPH %</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ext.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">
                        <input value={it.name} onChange={e => onUpdateItem(i, { name: e.target.value })}
                          className="w-full rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-900" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" value={it.quantity} onChange={e => onUpdateItem(i, { quantity: parseFloat(e.target.value) || 1 })}
                          className="w-full text-right rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-900" />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" value={it.unit_price} onChange={e => onUpdateItem(i, { unit_price: parseFloat(e.target.value) || 0 })}
                          className="w-full text-right rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-900" />
                      </td>
                      <td className="px-2 py-1">
                        <select value={it.vat_rate} onChange={e => onUpdateItem(i, { vat_rate: parseInt(e.target.value) })}
                          className="w-full rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none">
                          <option value={21}>21</option>
                          <option value={12}>12</option>
                          <option value={0}>0</option>
                        </select>
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button onClick={() => onRemoveItem(i)} className="text-gray-300 hover:text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={onAddItem} className="flex items-center gap-1 text-xs text-primary-900 hover:underline mt-1">
              <Plus className="h-3 w-3" /> Přidat položku
            </button>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1 text-right">
            <div className="text-gray-500">Základ: <span className="font-medium text-gray-800">{totals.withoutVat.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {ext.currency}</span></div>
            <div className="text-gray-500">DPH: <span className="font-medium text-gray-800">{totals.vat.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {ext.currency}</span></div>
            <div className="text-gray-900 font-bold">Celkem: {totals.total.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {ext.currency}</div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button onClick={onApprove} disabled={item.status === 'submitting'} className="flex-1">
              {item.status === 'submitting'
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Odesílám…</>
                : 'Schválit a poslat do Fakturoidu'
              }
            </Button>
            <Button variant="outline" onClick={onRemove}>Smazat draft</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
