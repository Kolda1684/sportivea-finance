'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

type Status = 'idle' | 'reading' | 'extracted' | 'submitting' | 'done' | 'error'

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

export default function UploadInvoicePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState<{ fakturoid_id: number; number: string } | null>(null)
  // track if user manually edited taxable_supply_date
  const [duzpManual, setDuzpManual] = useState(false)

  function handleFile(f: File) {
    setFile(f)
    setStatus('idle')
    setExtracted(null)
    setErrorMsg('')
    setResult(null)
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  async function handleExtract() {
    if (!file) return
    setStatus('reading')
    setErrorMsg('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/invoices/extract', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba při čtení faktury')
      setExtracted(data)
      setDuzpManual(false)
      setStatus('extracted')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Neznámá chyba')
      setStatus('error')
    }
  }

  async function handleSubmit() {
    if (!extracted) return
    setStatus('submitting')
    try {
      const res = await fetch('/api/invoices/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracted,
          file_base64: extracted._file_base64,
          file_type: extracted._file_type,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba při odesílání do Fakturoidu')
      setResult(data)
      setStatus('done')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Neznámá chyba')
      setStatus('error')
    }
  }

  function reset() {
    setFile(null); setPreview(null); setExtracted(null)
    setStatus('idle'); setErrorMsg(''); setResult(null)
  }

  function updateItem(i: number, patch: Partial<InvoiceItem>) {
    setExtracted(x => x ? { ...x, items: x.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) } : x)
  }

  function addItem() {
    setExtracted(x => x ? { ...x, items: [...x.items, { name: '', quantity: 1, unit: null, unit_price: 0, vat_rate: 21 }] } : x)
  }

  function removeItem(i: number) {
    setExtracted(x => x ? { ...x, items: x.items.filter((_, idx) => idx !== i) } : x)
  }

  // Computed totals from items
  const computedWithoutVat = extracted?.items.reduce((s, it) => s + it.quantity * it.unit_price, 0) ?? 0
  const computedVat = extracted?.items.reduce((s, it) => s + it.quantity * it.unit_price * (it.vat_rate / 100), 0) ?? 0
  const computedTotal = computedWithoutVat + computedVat

  const lowFields = new Set(extracted?.confidence?.low_confidence_fields ?? [])
  const confidence = extracted?.confidence?.overall ?? 100

  function isLow(field: string) { return lowFields.has(field) }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Upload faktury</h1>
        <p className="text-sm text-gray-500 mt-1">Nahraj PDF nebo fotku faktury — Claude ji přečte a vloží jako náklad do Fakturoidu</p>
      </div>

      {/* Úspěch */}
      {status === 'done' && result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
            <p className="font-semibold text-green-900">Náklad {result.number} byl vložen do Fakturoidu</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={reset}>Nahrát další fakturu</Button>
          </div>
        </div>
      )}

      {status !== 'done' && (
        <>
          {/* Drop zóna */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => !file && inputRef.current?.click()}
            className={cn(
              'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              file ? 'border-primary-900 bg-primary-50/30' : 'border-gray-300 bg-gray-50 hover:border-primary-900 hover:bg-primary-50/20 cursor-pointer'
            )}
          >
            <input ref={inputRef} type="file" accept=".pdf,image/*,.heic" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-primary-900" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button onClick={e => { e.stopPropagation(); reset() }} className="ml-2 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="font-medium text-gray-700">Přetáhni fakturu nebo klikni pro výběr</p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, HEIC · max 10 MB</p>
              </>
            )}
          </div>

          {preview && <img src={preview} alt="náhled" className="rounded-lg border max-h-64 object-contain w-full" />}

          {status === 'error' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />{errorMsg}
            </div>
          )}

          {file && status !== 'extracted' && status !== 'submitting' && (
            <Button onClick={handleExtract} disabled={status === 'reading'} className="w-full">
              {status === 'reading'
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Claude čte fakturu…</>
                : <><FileText className="h-4 w-4 mr-2" />Přečíst fakturu pomocí AI</>}
            </Button>
          )}

          {/* Formulář po extrakci */}
          {status === 'extracted' && extracted && (
            <div className="space-y-5">
              {/* Confidence banner */}
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
                        onClick={() => setExtracted(x => x ? { ...x, document_type: t } : x)}
                        className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors',
                          extracted.document_type === t ? 'bg-primary-900 text-white border-primary-900' : 'border-gray-200 text-gray-600 hover:border-primary-900'
                        )}>
                        {t === 'invoice' ? 'Faktura' : t === 'receipt' ? 'Účtenka' : 'Jiný'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dodavatel */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Field label="Dodavatel" value={extracted.supplier_name ?? ''} lowConfidence={isLow('supplier_name')}
                      onChange={v => setExtracted(x => x ? { ...x, supplier_name: v || null } : x)} />
                  </div>
                  <Field label="IČO" value={extracted.supplier_ico ?? ''} lowConfidence={isLow('supplier_ico')}
                    onChange={v => setExtracted(x => x ? { ...x, supplier_ico: v || null } : x)} />
                  <Field label="DIČ" value={extracted.supplier_dic ?? ''} lowConfidence={isLow('supplier_dic')}
                    onChange={v => setExtracted(x => x ? { ...x, supplier_dic: v || null } : x)} />
                  <div className="col-span-2">
                    <Field label="Adresa" value={extracted.supplier_address ?? ''} lowConfidence={isLow('supplier_address')}
                      onChange={v => setExtracted(x => x ? { ...x, supplier_address: v || null } : x)} />
                  </div>
                </div>

                {/* Čísla dokladu */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Číslo dokladu" value={extracted.invoice_number ?? ''} lowConfidence={isLow('invoice_number')}
                    onChange={v => setExtracted(x => x ? { ...x, invoice_number: v || null } : x)} />
                  <Field label="Variabilní symbol" value={extracted.variable_symbol ?? ''} lowConfidence={isLow('variable_symbol')}
                    onChange={v => setExtracted(x => x ? { ...x, variable_symbol: v || null } : x)} />
                </div>

                {/* Datumy */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vystaven" type="date" value={extracted.issued_on ?? ''} lowConfidence={isLow('issued_on')}
                    onChange={v => {
                      setExtracted(x => x ? {
                        ...x,
                        issued_on: v || null,
                        taxable_supply_date: !duzpManual ? (v || null) : x.taxable_supply_date,
                      } : x)
                    }} />
                  <Field label="Přijat" type="date" value={extracted.received_on ?? ''} lowConfidence={isLow('received_on')}
                    onChange={v => setExtracted(x => x ? { ...x, received_on: v || null } : x)} />
                  <Field label="Zdanitelné plnění (DUZP)" type="date" value={extracted.taxable_supply_date ?? ''} lowConfidence={isLow('taxable_supply_date')}
                    onChange={v => { setDuzpManual(true); setExtracted(x => x ? { ...x, taxable_supply_date: v || null } : x) }} />
                  <Field label="Splatnost" type="date" value={extracted.due_on ?? ''} lowConfidence={isLow('due_on')}
                    onChange={v => setExtracted(x => x ? { ...x, due_on: v || null } : x)} />
                </div>

                {/* Měna */}
                <div className="w-32">
                  <Field label="Měna" value={extracted.currency} lowConfidence={isLow('currency')}
                    onChange={v => setExtracted(x => x ? { ...x, currency: v } : x)} />
                </div>

                {/* Položky */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Položky</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500">Popis</th>
                          <th className="px-3 py-2 text-right text-gray-500 w-16">Ks</th>
                          <th className="px-3 py-2 text-right text-gray-500 w-24">Cena/ks</th>
                          <th className="px-3 py-2 text-right text-gray-500 w-16">DPH %</th>
                          <th className="px-3 py-2 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {extracted.items.map((item, i) => (
                          <tr key={i}>
                            <td className="px-2 py-1">
                              <input value={item.name} onChange={e => updateItem(i, { name: e.target.value })}
                                className="w-full rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-900 rounded" />
                            </td>
                            <td className="px-2 py-1">
                              <input type="number" value={item.quantity} onChange={e => updateItem(i, { quantity: parseFloat(e.target.value) || 1 })}
                                className="w-full text-right rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-900" />
                            </td>
                            <td className="px-2 py-1">
                              <input type="number" value={item.unit_price} onChange={e => updateItem(i, { unit_price: parseFloat(e.target.value) || 0 })}
                                className="w-full text-right rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-900" />
                            </td>
                            <td className="px-2 py-1">
                              <select value={item.vat_rate} onChange={e => updateItem(i, { vat_rate: parseInt(e.target.value) })}
                                className="w-full rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none">
                                <option value={21}>21</option>
                                <option value={12}>12</option>
                                <option value={0}>0</option>
                              </select>
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary-900 hover:underline mt-1">
                    <Plus className="h-3 w-3" /> Přidat položku
                  </button>
                </div>

                {/* Celkem */}
                <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1 text-right">
                  <div className="text-gray-500">Základ: <span className="font-medium text-gray-800">{computedWithoutVat.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {extracted.currency}</span></div>
                  <div className="text-gray-500">DPH: <span className="font-medium text-gray-800">{computedVat.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {extracted.currency}</span></div>
                  <div className="text-gray-900 font-bold">Celkem: {computedTotal.toLocaleString('cs-CZ', { minimumFractionDigits: 2 })} {extracted.currency}</div>
                </div>

                {/* Akce */}
                <div className="flex gap-3 pt-1">
                  <Button onClick={handleSubmit} className="flex-1">
                    Vložit náklad do Fakturoidu
                  </Button>
                  <Button variant="outline" onClick={reset}>Zrušit</Button>
                </div>
              </div>
            </div>
          )}

          {status === 'submitting' && (
            <div className="flex items-center justify-center gap-3 py-8 text-gray-500 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Odesílám do Fakturoidu…
            </div>
          )}
        </>
      )}
    </div>
  )
}
