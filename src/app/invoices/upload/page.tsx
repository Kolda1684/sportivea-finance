'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ExtractedInvoice {
  supplier_name: string | null
  amount: number | null
  currency: string
  date: string | null
  due_date: string | null
  variable_symbol: string | null
  note: string | null
}

type Status = 'idle' | 'reading' | 'extracted' | 'saving' | 'saved' | 'error'

export default function UploadInvoicePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [extracted, setExtracted] = useState<ExtractedInvoice | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  function handleFile(f: File) {
    setFile(f)
    setStatus('idle')
    setExtracted(null)
    setErrorMsg('')

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
      setStatus('extracted')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Neznámá chyba')
      setStatus('error')
    }
  }

  async function handleSave() {
    if (!extracted) return
    setStatus('saving')
    try {
      const res = await fetch('/api/expense-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extracted),
      })
      if (!res.ok) throw new Error('Chyba při ukládání')
      setStatus('saved')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Neznámá chyba')
      setStatus('error')
    }
  }

  function reset() {
    setFile(null)
    setPreview(null)
    setExtracted(null)
    setStatus('idle')
    setErrorMsg('')
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Upload faktury</h1>
        <p className="text-sm text-gray-500 mt-1">Nahraj PDF nebo fotku faktury — Claude ji přečte a předvyplní formulář</p>
      </div>

      {/* Úspěch */}
      {status === 'saved' && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex items-center gap-4">
          <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-900">Faktura uložena</p>
            <p className="text-sm text-green-700">{extracted?.supplier_name} — {extracted?.amount?.toLocaleString('cs-CZ')} {extracted?.currency}</p>
          </div>
          <Button variant="outline" size="sm" onClick={reset}>Nahrát další</Button>
        </div>
      )}

      {/* Upload zóna */}
      {status !== 'saved' && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => !file && inputRef.current?.click()}
            className={cn(
              'rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              file ? 'border-primary-900 bg-primary-50/30' : 'border-gray-300 bg-gray-50 hover:border-primary-900 hover:bg-primary-50/20 cursor-pointer'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-primary-900" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); reset() }} className="ml-2 text-gray-400 hover:text-gray-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="font-medium text-gray-700">Přetáhni fakturu nebo klikni pro výběr</p>
                <p className="text-xs text-gray-400 mt-1">PDF nebo obrázek (JPG, PNG)</p>
              </>
            )}
          </div>

          {/* Náhled obrázku */}
          {preview && (
            <img src={preview} alt="náhled" className="rounded-lg border max-h-64 object-contain w-full" />
          )}

          {/* Chyba */}
          {status === 'error' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {errorMsg}
            </div>
          )}

          {/* Tlačítko — přečíst */}
          {file && status !== 'extracted' && (
            <Button onClick={handleExtract} disabled={status === 'reading'} className="w-full">
              {status === 'reading' ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Claude čte fakturu…</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />Přečíst fakturu pomocí AI</>
              )}
            </Button>
          )}

          {/* Výsledek extrakce */}
          {status === 'extracted' && extracted && (
            <div className="rounded-xl border bg-white p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Přečtené údaje — zkontroluj před uložením:</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Dodavatel" value={extracted.supplier_name} onChange={v => setExtracted(x => x && ({ ...x, supplier_name: v }))} />
                <Field label="Částka" value={extracted.amount != null ? String(extracted.amount) : ''} onChange={v => setExtracted(x => x && ({ ...x, amount: parseFloat(v) || null }))} type="number" />
                <Field label="Měna" value={extracted.currency} onChange={v => setExtracted(x => x && ({ ...x, currency: v }))} />
                <Field label="Datum" value={extracted.date ?? ''} onChange={v => setExtracted(x => x && ({ ...x, date: v || null }))} type="date" />
                <Field label="Splatnost" value={extracted.due_date ?? ''} onChange={v => setExtracted(x => x && ({ ...x, due_date: v || null }))} type="date" />
                <Field label="Variabilní symbol" value={extracted.variable_symbol ?? ''} onChange={v => setExtracted(x => x && ({ ...x, variable_symbol: v || null }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={status === 'saving'} className="flex-1">
                  {status === 'saving' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ukládám…</> : 'Uložit fakturu'}
                </Button>
                <Button variant="outline" onClick={reset}>Zrušit</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900"
      />
    </div>
  )
}
