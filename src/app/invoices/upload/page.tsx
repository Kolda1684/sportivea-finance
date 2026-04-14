'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Plus, Trash2,
  Clock, ChevronRight,
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
  confidence: { overall: number; low_confidence_fields: string[] }
  _file_base64?: string
  _file_type?: string
}

type ItemStatus = 'pending' | 'reading' | 'extracted' | 'submitting' | 'done' | 'error'

interface QueueItem {
  id: string
  file: File
  previewUrl: string           // blob URL — works for both PDF and images
  status: ItemStatus
  extracted: ExtractedInvoice | null
  result: { fakturoid_id: number; number: string } | null
  errorMsg: string
  duzpManual: boolean
  vatCalcMode: 'from_base' | 'from_total'
}

// ─── Small helpers ────────────────────────────────────────────────────────────

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
    case 'done':       return 'Hotovo'
    case 'error':      return 'Chyba'
  }
}

function Field({ label, value, onChange, type = 'text', lowConfidence }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; lowConfidence?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-gray-500 flex items-center gap-1">
        {label}
        {lowConfidence && <span title="Ověřte prosím tuto hodnotu" className="text-yellow-500">⚠</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900',
          lowConfidence ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
        )}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UploadInvoicePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = queue.find(q => q.id === selectedId) ?? null

  // ── Patch queue item ─────────────────────────────────────────────────────
  const patch = useCallback((id: string, update: Partial<QueueItem>) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...update } : q))
  }, [])

  // ── Extract one file ─────────────────────────────────────────────────────
  const extractItem = useCallback(async (item: QueueItem) => {
    patch(item.id, { status: 'reading' })
    try {
      const form = new FormData()
      form.append('file', item.file)
      const res = await fetch('/api/invoices/extract', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba při čtení faktury')
      patch(item.id, { status: 'extracted', extracted: data })
    } catch (e: unknown) {
      patch(item.id, {
        status: 'error',
        errorMsg: e instanceof Error ? e.message : 'Neznámá chyba',
      })
    }
  }, [patch])

  // ── Add files ────────────────────────────────────────────────────────────
  const addFiles = useCallback((files: File[]) => {
    const newItems: QueueItem[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending' as ItemStatus,
      extracted: null,
      result: null,
      errorMsg: '',
      duzpManual: false,
      vatCalcMode: 'from_base',
    }))
    setQueue(prev => {
      const updated = [...prev, ...newItems]
      // Auto-select first if nothing selected
      return updated
    })
    // Auto-select first new item
    if (newItems.length > 0) setSelectedId(newItems[0].id)
    // Kick off extraction for each
    newItems.forEach(item => extractItem(item))
  }, [extractItem])

  // ── Submit one item to Fakturoid ─────────────────────────────────────────
  async function submitItem(id: string) {
    const item = queue.find(q => q.id === id)
    if (!item?.extracted) return
    patch(id, { status: 'submitting' })
    try {
      const { extracted, vatCalcMode } = item
      const extractedForSubmit = vatCalcMode === 'from_total'
        ? { ...extracted, items: extracted.items.map(it => ({ ...it, unit_price: it.unit_price / (1 + it.vat_rate / 100) })) }
        : extracted
      const res = await fetch('/api/invoices/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracted: extractedForSubmit,
          file_base64: extracted._file_base64,
          file_type: extracted._file_type,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = data.details ? JSON.stringify(data.details, null, 2) : ''
        throw new Error(`${data.error ?? 'Chyba'}${detail ? '\n' + detail : ''}`)
      }
      patch(id, { status: 'done', result: data })
      if (data.attachmentError) {
        patch(id, { errorMsg: `Vloženo, ale příloha selhala: ${data.attachmentError}` })
      }
    } catch (e: unknown) {
      patch(id, { status: 'error', errorMsg: e instanceof Error ? e.message : 'Neznámá chyba' })
    }
  }

  function removeItem(id: string) {
    const item = queue.find(q => q.id === id)
    if (item) URL.revokeObjectURL(item.previewUrl)
    setQueue(prev => prev.filter(q => q.id !== id))
    if (selectedId === id) setSelectedId(queue.find(q => q.id !== id)?.id ?? null)
  }

  function updateExtracted(id: string, update: Partial<ExtractedInvoice>) {
    setQueue(prev => prev.map(q =>
      q.id === id && q.extracted ? { ...q, extracted: { ...q.extracted, ...update } } : q
    ))
  }

  function updateItem(queueId: string, itemIdx: number, patch2: Partial<InvoiceItem>) {
    setQueue(prev => prev.map(q =>
      q.id === queueId && q.extracted
        ? { ...q, extracted: { ...q.extracted, items: q.extracted.items.map((it, i) => i === itemIdx ? { ...it, ...patch2 } : it) } }
        : q
    ))
  }

  function addLineItem(queueId: string) {
    setQueue(prev => prev.map(q =>
      q.id === queueId && q.extracted
        ? { ...q, extracted: { ...q.extracted, items: [...q.extracted.items, { name: '', quantity: 1, unit: null, unit_price: 0, vat_rate: 21 }] } }
        : q
    ))
  }

  function removeLineItem(queueId: string, itemIdx: number) {
    setQueue(prev => prev.map(q =>
      q.id === queueId && q.extracted
        ? { ...q, extracted: { ...q.extracted, items: q.extracted.items.filter((_, i) => i !== itemIdx) } }
        : q
    ))
  }

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => { queue.forEach(q => URL.revokeObjectURL(q.previewUrl)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Computed totals ──────────────────────────────────────────────────────
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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-8 gap-6 min-h-0">

      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Upload faktur</h1>
          <p className="text-sm text-gray-500 mt-1">
            Nahraj více PDF/fotek najednou — Claude je přečte a ty jen zkontrolovuješ
          </p>
        </div>
        {queue.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {pendingCount > 0 && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {pendingCount} zpracovávám</span>}
            {doneCount > 0 && <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3 w-3" /> {doneCount} hotovo</span>}
          </div>
        )}
      </div>

      {/* Drop zone — always visible */}
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

      {queue.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Zatím žádné faktury
        </div>
      )}

      {queue.length > 0 && (
        <div className="flex flex-1 gap-4 min-h-0">

          {/* ── Left: queue list ─────────────────────────────────────────── */}
          <div className="w-56 flex-shrink-0 flex flex-col gap-1 overflow-y-auto">
            {queue.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors w-full group',
                  selectedId === item.id
                    ? 'bg-primary-900 text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                )}
              >
                {statusIcon(item.status)}
                <span className="flex-1 truncate text-xs font-medium">{item.file.name}</span>
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

          {/* ── Right: detail panel ───────────────────────────────────────── */}
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
              <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
                  <p className="font-semibold text-green-900">
                    Náklad <span className="font-mono">{selected.result.number}</span> byl vložen do Fakturoidu
                  </p>
                </div>
                {selected.errorMsg && (
                  <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
                    {selected.errorMsg}
                  </p>
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
                onSubmit={() => submitItem(selected.id)}
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

// ─── Detail panel (extracted invoice + PDF preview) ───────────────────────────

function DetailPanel({
  item, onUpdateExtracted, onUpdateItem, onAddItem, onRemoveItem,
  onToggleVatMode, onToggleDuzp, onSubmit, onRemove, totals,
}: {
  item: QueueItem
  onUpdateExtracted: (u: Partial<ExtractedInvoice>) => void
  onUpdateItem: (i: number, u: Partial<InvoiceItem>) => void
  onAddItem: () => void
  onRemoveItem: (i: number) => void
  onToggleVatMode: () => void
  onToggleDuzp: () => void
  onSubmit: () => void
  onRemove: () => void
  totals: { withoutVat: number; total: number; vat: number }
}) {
  const ext = item.extracted!
  const lowFields = new Set(ext.confidence?.low_confidence_fields ?? [])
  const confidence = ext.confidence?.overall ?? 100
  const isLow = (f: string) => lowFields.has(f)
  const isPdf = item.file.type === 'application/pdf'

  return (
    <div className="flex gap-4 items-start">

      {/* PDF / Image preview */}
      <div className="w-80 flex-shrink-0 rounded-xl border overflow-hidden bg-gray-100 sticky top-0" style={{ height: '85vh' }}>
        {isPdf ? (
          <iframe
            src={item.previewUrl}
            className="w-full h-full"
            title="Náhled faktury"
          />
        ) : (
          <img
            src={item.previewUrl}
            alt="Náhled faktury"
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {/* Form */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Confidence banners */}
        {confidence < 60 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Snímek je nekvalitní — Claude si nebyl jistý většinou polí. Zkontrolujte vše pečlivě.
          </div>
        )}
        {confidence >= 60 && confidence < 80 && lowFields.size > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Pole označená ⚠ si prosím ověřte — Claude si nebyl 100% jistý hodnotou.
          </div>
        )}

        <div className="rounded-xl border bg-white p-5 space-y-5">

          {/* Typ dokumentu */}
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

          {/* Dodavatel */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Dodavatel" value={ext.supplier_name ?? ''} lowConfidence={isLow('supplier_name')}
                onChange={v => onUpdateExtracted({ supplier_name: v || null })} />
            </div>
            <Field label="IČO" value={ext.supplier_ico ?? ''} lowConfidence={isLow('supplier_ico')}
              onChange={v => onUpdateExtracted({ supplier_ico: v || null })} />
            <Field label="DIČ" value={ext.supplier_dic ?? ''} lowConfidence={isLow('supplier_dic')}
              onChange={v => onUpdateExtracted({ supplier_dic: v || null })} />
            <div className="col-span-2">
              <Field label="Adresa" value={ext.supplier_address ?? ''} lowConfidence={isLow('supplier_address')}
                onChange={v => onUpdateExtracted({ supplier_address: v || null })} />
            </div>
          </div>

          {/* Čísla dokladu */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Číslo dokladu" value={ext.invoice_number ?? ''} lowConfidence={isLow('invoice_number')}
              onChange={v => onUpdateExtracted({ invoice_number: v || null })} />
            <Field label="Variabilní symbol" value={ext.variable_symbol ?? ''} lowConfidence={isLow('variable_symbol')}
              onChange={v => onUpdateExtracted({ variable_symbol: v || null })} />
          </div>

          {/* Datumy */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vystaven" type="date" value={ext.issued_on ?? ''} lowConfidence={isLow('issued_on')}
              onChange={v => {
                onUpdateExtracted({
                  issued_on: v || null,
                  taxable_supply_date: !item.duzpManual ? (v || null) : ext.taxable_supply_date,
                })
              }} />
            <Field label="Přijat" type="date" value={ext.received_on ?? ''} lowConfidence={isLow('received_on')}
              onChange={v => onUpdateExtracted({ received_on: v || null })} />
            <Field label="Zdanitelné plnění (DUZP)" type="date" value={ext.taxable_supply_date ?? ''} lowConfidence={isLow('taxable_supply_date')}
              onChange={v => { onToggleDuzp(); onUpdateExtracted({ taxable_supply_date: v || null }) }} />
            <Field label="Splatnost" type="date" value={ext.due_on ?? ''} lowConfidence={isLow('due_on')}
              onChange={v => onUpdateExtracted({ due_on: v || null })} />
          </div>

          {/* Měna */}
          <div className="w-32">
            <Field label="Měna" value={ext.currency} lowConfidence={isLow('currency')}
              onChange={v => onUpdateExtracted({ currency: v })} />
          </div>

          {/* Položky */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Položky</p>
              <p className="text-xs text-gray-500">
                DPH počítám z{' '}
                <button
                  onClick={onToggleVatMode}
                  className="font-semibold text-primary-900 underline underline-offset-2 hover:text-primary-700"
                >
                  {item.vatCalcMode === 'from_base' ? 'Základu' : 'Celkové částky'}
                </button>
                {'  '}
                <button onClick={onToggleVatMode} className="text-primary-900 hover:text-primary-700">Změnit</button>
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

          {/* Celkem */}
          <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1 text-right">
            <div className="text-gray-500">Základ: <span className="font-medium text-gray-800">{totals.withoutVat.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {ext.currency}</span></div>
            <div className="text-gray-500">DPH: <span className="font-medium text-gray-800">{totals.vat.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {ext.currency}</span></div>
            <div className="text-gray-900 font-bold">Celkem: {totals.total.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {ext.currency}</div>
          </div>

          {/* Akce */}
          <div className="flex gap-3 pt-1">
            <Button onClick={onSubmit} disabled={item.status === 'submitting'} className="flex-1">
              {item.status === 'submitting'
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Odesílám…</>
                : 'Vložit náklad do Fakturoidu'
              }
            </Button>
            <Button variant="outline" onClick={onRemove}>Odebrat</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
