'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, Printer, Trash2, ChevronDown, Send, Sparkles, FileText, CheckCheck, BookOpen, X, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────
type Person = 'martin' | 'jan'
type Tab = 'editor' | 'ai'
type AiSubTab = 'chat' | 'context'

interface QuoteItem {
  id: string
  description: string
  hours: string
  price: number
}

interface QuoteSection {
  id: string
  title: string
  items: QuoteItem[]
}

interface PendingImage {
  dataUrl: string
  name: string
  fileType?: 'image' | 'pdf'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sections?: QuoteSection[]
  images?: PendingImage[]
}

interface ContextDoc {
  id: string
  name: string
  content: string
  file_type?: string
  created_at: string
}

// ── Constants ──────────────────────────────────────────────────────────────
const PERSONS = {
  martin: { name: 'MARTIN REMEŠ', phone: '722 015 345', email: 'martin.remes@sportivea.cz', web: 'www.sportivea.cz' },
  jan:    { name: 'JAN KOLÁŘ',    phone: '728 732 029', email: 'jan.kolar@sportivea.cz',    web: 'www.sportivea.cz' },
}

const COMPANY = {
  name: 'Sportivea, s.r.o.',
  address1: 'Slezská 949/32, 120 00',
  address2: 'Vinohrady, Praha 2',
  ico: 'IČO: 19558571',
  dic: 'DIČ: CZ19558571',
}

const RATE_PRESETS = [
  { label: 'Hodinová sazba', price: 1750, perHour: true },
  { label: 'Natáčení / h',   price: 1000, perHour: true },
  { label: 'Reels',          price: 3500, perHour: false },
  { label: 'Dlouhý formát',  price: 8000, perHour: false },
]

// ── Helpers ────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9) }
function fmtCZK(n: number) { return n.toLocaleString('cs-CZ') + ' Kč' }
function todayCS() {
  return new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })
}
function secTotal(s: QuoteSection) { return s.items.reduce((sum, i) => sum + (i.price || 0), 0) }
function secHours(s: QuoteSection) {
  return s.items.reduce((sum, i) => { const h = parseFloat(i.hours); return sum + (isNaN(h) ? 0 : h) }, 0)
}
function makeItem(): QuoteItem { return { id: uid(), description: '', hours: '', price: 0 } }
function makeSection(title = 'Nová sekce'): QuoteSection { return { id: uid(), title, items: [makeItem()] } }
function withIds(sections: { title: string; items: { description: string; hours: string; price: number }[] }[]): QuoteSection[] {
  return sections.map(s => ({ ...s, id: uid(), items: s.items.map(i => ({ ...i, id: uid() })) }))
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CenotvorbPage() {
  const [tab, setTab]             = useState<Tab>('editor')
  const [aiSubTab, setAiSubTab]   = useState<AiSubTab>('chat')
  const [person, setPerson]       = useState<Person>('jan')
  const [docTitle, setDocTitle]   = useState('Kalkulace')
  const [clientName, setClientName] = useState('')
  const [sections, setSections]   = useState<QuoteSection[]>([makeSection('Sekce 1')])
  const [openPreset, setOpenPreset] = useState<string | null>(null)

  // AI chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput]       = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [isDragging, setIsDragging]       = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const fileRef       = useRef<HTMLInputElement>(null)

  // Context/memory
  const [contextDocs, setContextDocs]   = useState<ContextDoc[]>([])
  const [ctxName, setCtxName]           = useState('')
  const [ctxText, setCtxText]           = useState('')
  const [ctxSaving, setCtxSaving]       = useState(false)
  const ctxFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/cenotvorba/context')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setContextDocs(data) })
      .catch(() => {})
  }, [])

  const grandTotal = sections.reduce((sum, s) => sum + secTotal(s), 0)

  // ── section ops ──
  const addSection    = () => setSections(p => [...p, makeSection()])
  const removeSection = (sid: string) => setSections(p => p.filter(s => s.id !== sid))
  const updateTitle   = (sid: string, v: string) =>
    setSections(p => p.map(s => s.id === sid ? { ...s, title: v } : s))

  // ── item ops ──
  const addItem    = (sid: string) =>
    setSections(p => p.map(s => s.id === sid ? { ...s, items: [...s.items, makeItem()] } : s))
  const removeItem = (sid: string, iid: string) =>
    setSections(p => p.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s))
  const updateItem = useCallback((sid: string, iid: string, field: keyof QuoteItem, value: string | number) =>
    setSections(p => p.map(s =>
      s.id === sid ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, [field]: value } : i) } : s
    )), [])

  const applyPreset = (sid: string, iid: string, preset: typeof RATE_PRESETS[0], hours: string) => {
    const h = parseFloat(hours)
    const price = preset.perHour && !isNaN(h) && h > 0 ? preset.price * h : preset.price
    updateItem(sid, iid, 'price', price)
    setOpenPreset(null)
  }

  // ── AI ops ──
  const sendMessage = async (text: string) => {
    if ((!text.trim() && pendingImages.length === 0) || aiLoading) return
    const images = pendingImages.length > 0 ? [...pendingImages] : undefined
    const userMsg: ChatMessage = { role: 'user', content: text, images }
    const history = [...chatMessages, userMsg]
    setChatMessages(history)
    setChatInput('')
    setPendingImages([])
    setAiLoading(true)

    try {
      const res = await fetch('/api/cenotvorba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          contextDocs: contextDocs.map(d => ({ name: d.name, content: d.content })),
          images: images,
        }),
      })
      const data = await res.json()
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: data.message,
        sections: data.sections ? withIds(data.sections) : undefined,
      }
      setChatMessages(prev => [...prev, aiMsg])
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Chyba při komunikaci s AI. Zkus to znovu.' }])
    } finally {
      setAiLoading(false)
    }
  }

  const applyAiSections = (newSections: QuoteSection[]) => {
    setSections(newSections)
    setTab('editor')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    files.forEach(file => {
      const reader = new FileReader()
      if (file.type.startsWith('image/')) {
        reader.onload = ev => {
          const dataUrl = ev.target?.result as string
          setPendingImages(prev => [...prev, { dataUrl, name: file.name, fileType: 'image' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type === 'application/pdf') {
        reader.onload = ev => {
          const dataUrl = ev.target?.result as string
          setPendingImages(prev => [...prev, { dataUrl, name: file.name, fileType: 'pdf' }])
        }
        reader.readAsDataURL(file)
      } else {
        reader.onload = ev => {
          const text = ev.target?.result as string
          setChatInput(prev => prev + (prev ? '\n\n' : '') + `Brief ze souboru "${file.name}":\n${text}`)
        }
        reader.readAsText(file)
      }
    })
    e.target.value = ''
  }

  const processDroppedFiles = (files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader()
      if (file.type.startsWith('image/')) {
        reader.onload = ev => {
          const dataUrl = ev.target?.result as string
          setPendingImages(prev => [...prev, { dataUrl, name: file.name, fileType: 'image' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type === 'application/pdf') {
        reader.onload = ev => {
          const dataUrl = ev.target?.result as string
          setPendingImages(prev => [...prev, { dataUrl, name: file.name, fileType: 'pdf' }])
        }
        reader.readAsDataURL(file)
      } else if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        reader.onload = ev => {
          const text = ev.target?.result as string
          setChatInput(prev => prev + (prev ? '\n\n' : '') + `Brief ze souboru "${file.name}":\n${text}`)
        }
        reader.readAsText(file)
      }
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) processDroppedFiles(files)
  }

  // ── Context ops ──
  const addContextDoc = async () => {
    if (!ctxText.trim() || ctxSaving) return
    const name = ctxName.trim() || `Dokument ${new Date().toLocaleDateString('cs-CZ')}`
    setCtxSaving(true)
    try {
      const res = await fetch('/api/cenotvorba/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: ctxText.trim(), file_type: 'text' }),
      })
      const doc = await res.json()
      if (doc.id) {
        setContextDocs(prev => [doc, ...prev])
        setCtxName('')
        setCtxText('')
      }
    } finally {
      setCtxSaving(false)
    }
  }

  const removeContextDoc = async (id: string) => {
    setContextDocs(prev => prev.filter(d => d.id !== id))
    await fetch('/api/cenotvorba/context', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  const handleCtxFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setCtxText(ev.target?.result as string)
      if (!ctxName) setCtxName(file.name.replace(/\.[^.]+$/, ''))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden">

        {/* ── LEFT PANEL ── */}
        <div className="no-print w-[580px] flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden">

          {/* Header + tabs */}
          <div className="bg-white border-b border-gray-200">
            <div className="px-5 pt-4 pb-0">
              <h1 className="text-base font-semibold text-gray-900 mb-3">Cenotvorba</h1>
              <div className="flex gap-1">
                {(['editor', 'ai'] as Tab[]).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                      tab === t ? 'border-gray-900 text-gray-900 bg-white' : 'border-transparent text-gray-400 hover:text-gray-600'
                    )}
                  >
                    {t === 'ai' && <Sparkles className="h-3.5 w-3.5" />}
                    {t === 'editor' ? 'Editor' : 'AI asistent'}
                    {t === 'ai' && contextDocs.length > 0 && (
                      <span className="ml-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {contextDocs.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── EDITOR TAB ── */}
          {tab === 'editor' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Odesílatel</label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                    {(['jan', 'martin'] as Person[]).map(p => (
                      <button key={p} onClick={() => setPerson(p)}
                        className={cn('flex-1 py-2 transition-colors',
                          person === p ? 'bg-gray-900 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {p === 'jan' ? 'Jan Kolář' : 'Martin Remeš'}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 text-xs text-gray-400">{PERSONS[person].phone} · {PERSONS[person].email}</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Název dokumentu</label>
                  <input value={docTitle} onChange={e => setDocTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    placeholder="Kalkulace…"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Klient (volitelné)</label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    placeholder="Jméno klienta…"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sekce</label>
                  <div className="space-y-4">
                    {sections.map(section => (
                      <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-900">
                          <input value={section.title} onChange={e => updateTitle(section.id, e.target.value)}
                            className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none placeholder-gray-400"
                            placeholder="Název sekce…"
                          />
                          {sections.length > 1 && (
                            <button onClick={() => removeSection(section.id)} className="text-gray-400 hover:text-red-400 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="divide-y divide-gray-100">
                          {section.items.map(item => (
                            <div key={item.id} className="px-3 py-2.5 space-y-1.5">
                              <input value={item.description} onChange={e => updateItem(section.id, item.id, 'description', e.target.value)}
                                className="w-full text-sm focus:outline-none placeholder-gray-300 text-gray-800"
                                placeholder="Popis položky…"
                              />
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <div className="text-[10px] text-gray-400 mb-0.5">Hodiny</div>
                                  <input value={item.hours} onChange={e => updateItem(section.id, item.id, 'hours', e.target.value)}
                                    className="w-full rounded border border-gray-100 bg-gray-50 px-2 py-1 text-sm focus:outline-none focus:border-gray-300 text-center"
                                    placeholder="–"
                                  />
                                </div>
                                <div className="flex-[2] relative">
                                  <div className="text-[10px] text-gray-400 mb-0.5">Cena (Kč)</div>
                                  <div className="flex items-center gap-1">
                                    <input type="number" value={item.price || ''} onChange={e => updateItem(section.id, item.id, 'price', Number(e.target.value))}
                                      className="w-full rounded border border-gray-100 bg-gray-50 px-2 py-1 text-sm focus:outline-none focus:border-gray-300"
                                      placeholder="0"
                                    />
                                    <div className="relative">
                                      <button onClick={() => setOpenPreset(openPreset === item.id ? null : item.id)}
                                        className="p-1.5 rounded border border-gray-200 bg-white text-gray-400 hover:text-gray-700 transition-colors"
                                        title="Vybrat sazbu"
                                      >
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                      {openPreset === item.id && (
                                        <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[200px]">
                                          {RATE_PRESETS.map(preset => (
                                            <button key={preset.label} onClick={() => applyPreset(section.id, item.id, preset, item.hours)}
                                              className="flex items-center justify-between w-full px-3 py-2 text-xs hover:bg-gray-50 text-left"
                                            >
                                              <span className="text-gray-700 font-medium">{preset.label}</span>
                                              <span className="text-gray-400 ml-3">{preset.price.toLocaleString('cs-CZ')} Kč{preset.perHour ? '/h' : ''}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <button onClick={() => removeItem(section.id, item.id)} className="mt-4 p-1 text-gray-300 hover:text-red-400 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <button onClick={() => addItem(section.id)}
                          className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100"
                        >
                          <Plus className="h-3 w-3" /> Přidat položku
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={addSection}
                    className="mt-3 flex items-center gap-1.5 w-full justify-center rounded-xl border-2 border-dashed border-gray-200 py-2.5 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Přidat sekci
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 border-t border-gray-200 bg-white">
                <button onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 w-full bg-gray-900 hover:bg-gray-700 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                  <Printer className="h-4 w-4" /> Tisknout / Export PDF
                </button>
              </div>
            </div>
          )}

          {/* ── AI TAB ── */}
          {tab === 'ai' && (
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* AI sub-tabs */}
              <div className="flex border-b border-gray-200 bg-white px-4">
                {(['chat', 'context'] as AiSubTab[]).map(st => (
                  <button key={st} onClick={() => setAiSubTab(st)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                      aiSubTab === st ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
                    )}
                  >
                    {st === 'chat' ? <><Send className="h-3 w-3" /> Chat</> : <><BookOpen className="h-3 w-3" /> Paměť ({contextDocs.length})</>}
                  </button>
                ))}
              </div>

              {/* ── CHAT ── */}
              {aiSubTab === 'chat' && (
                <div
                  className="flex-1 flex flex-col overflow-hidden relative"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {contextDocs.length > 0 && (
                    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                      <BookOpen className="h-3 w-3 text-blue-500 flex-shrink-0" />
                      <span className="text-xs text-blue-700">
                        AI má přístup k {contextDocs.length} {contextDocs.length === 1 ? 'dokumentu' : contextDocs.length < 5 ? 'dokumentům' : 'dokumentům'} v paměti
                      </span>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 gap-3">
                        <Sparkles className="h-8 w-8 text-gray-300" />
                        <div>
                          <p className="text-sm font-medium text-gray-500">AI asistent pro kalkulace</p>
                          <p className="text-xs mt-1 leading-5">
                            Vlož brief projektu nebo se zeptej.<br />
                            AI navrhne sekce a ceny, které pak jedním<br />klikem aplikuješ do kalkulace.
                          </p>
                        </div>
                      </div>
                    )}

                    {chatMessages.map((msg, i) => (
                      <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-gray-900 text-white rounded-br-sm'
                            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                        )}>
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex gap-2 mb-2 flex-wrap">
                              {msg.images.map((file, j) => (
                                file.fileType === 'pdf' ? (
                                  <div key={j} className="h-16 w-16 rounded-lg border border-red-300 bg-red-50 flex flex-col items-center justify-center gap-1 px-1">
                                    <FileText className="h-5 w-5 text-red-500 flex-shrink-0" />
                                    <span className="text-[8px] text-red-600 truncate w-full text-center">{file.name}</span>
                                  </div>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={j} src={file.dataUrl} alt={file.name} className="h-20 w-20 object-cover rounded-lg" />
                                )
                              ))}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                          {msg.sections && msg.sections.length > 0 && (
                            <button onClick={() => applyAiSections(msg.sections!)}
                              className="mt-3 flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors w-full justify-center"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              Aplikovat do kalkulace ({msg.sections.length} {msg.sections.length === 1 ? 'sekce' : 'sekcí'})
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {aiLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                          <div className="flex gap-1.5 items-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  <div className="border-t border-gray-200 bg-white px-4 py-3">
                    {pendingImages.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {pendingImages.map((file, i) => (
                          <div key={i} className="relative group">
                            {file.fileType === 'pdf' ? (
                              <div className="h-16 w-16 rounded-lg border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-1 px-1">
                                <FileText className="h-6 w-6 text-red-500 flex-shrink-0" />
                                <span className="text-[8px] text-red-600 truncate w-full text-center leading-tight">{file.name}</span>
                              </div>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={file.dataUrl} alt={file.name} className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                            )}
                            <button
                              onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <input ref={fileRef} type="file" accept=".txt,.md,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple className="hidden" onChange={handleFileUpload} />
                      <button onClick={() => fileRef.current?.click()}
                        className="flex-shrink-0 p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors mb-0.5"
                        title="Nahrát obrázek nebo brief (.txt)"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <textarea
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput) } }}
                        className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 max-h-32"
                        rows={3}
                        placeholder="Vlož brief nebo se zeptej… (Enter = odeslat)"
                      />
                      <button onClick={() => sendMessage(chatInput)} disabled={(!chatInput.trim() && pendingImages.length === 0) || aiLoading}
                        className="flex-shrink-0 p-2.5 rounded-xl bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-0.5"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {isDragging && (
                    <div className="absolute inset-0 z-20 bg-blue-50/90 border-2 border-dashed border-blue-400 rounded-lg flex flex-col items-center justify-center gap-2 pointer-events-none">
                      <Upload className="h-8 w-8 text-blue-500" />
                      <p className="text-sm font-medium text-blue-700">Pusť soubor sem</p>
                      <p className="text-xs text-blue-500">PDF, obrázek nebo .txt brief</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── CONTEXT / MEMORY ── */}
              {aiSubTab === 'context' && (
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                  {/* Saved docs */}
                  {contextDocs.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <BookOpen className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">Žádné dokumenty v paměti</p>
                      <p className="text-xs mt-1">Přidej minulé kalkulace, ceníky nebo poznámky.<br />AI je bude používat při každém dotazu.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Uložené dokumenty</p>
                      <div className="space-y-2">
                        {contextDocs.map(doc => (
                          <div key={doc.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                            <FileText className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">{doc.name}</div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {new Date(doc.created_at).toLocaleDateString('cs-CZ')} · {doc.content.length} znaků
                              </div>
                            </div>
                            <button onClick={() => removeContextDoc(doc.id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add new doc */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Přidat dokument</p>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Název</label>
                      <input value={ctxName} onChange={e => setCtxName(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                        placeholder="např. Kalkulace Adidas 2025, Vlastní ceník…"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-gray-500">Obsah</label>
                        <div>
                          <input ref={ctxFileRef} type="file" accept=".txt,.md" className="hidden" onChange={handleCtxFileUpload} />
                          <button onClick={() => ctxFileRef.current?.click()}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            <Upload className="h-3 w-3" /> Nahrát soubor
                          </button>
                        </div>
                      </div>
                      <textarea value={ctxText} onChange={e => setCtxText(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
                        rows={6}
                        placeholder="Sem vlož nebo nahrej text kalkulace, ceníku, nebo libovolných poznámek…"
                      />
                    </div>

                    <button onClick={addContextDoc} disabled={!ctxText.trim() || ctxSaving}
                      className="flex items-center justify-center gap-2 w-full bg-gray-900 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium transition-colors"
                    >
                      <BookOpen className="h-4 w-4" /> {ctxSaving ? 'Ukládám…' : 'Uložit do paměti AI'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL – preview ── */}
        <div className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 px-6">
          <div className="bg-white w-full max-w-2xl shadow-sm print-doc" style={{ padding: '40px 48px', minHeight: '297mm' }}>

            <div className="flex items-start justify-between mb-6">
              <span className="text-2xl font-black tracking-tight">SPORTIVE<span className="text-red-600">A</span></span>
              <span className="text-sm font-medium text-gray-700">{todayCS()}</span>
            </div>

            <div className="text-xl font-bold text-gray-900 mb-6 pb-1 border-b border-gray-200">
              {docTitle || <span className="text-gray-300">Název dokumentu…</span>}
            </div>

            <div className="flex justify-between mb-8">
              <div className="text-sm leading-6">
                {clientName && <div className="font-bold text-gray-900 mb-1">{clientName}</div>}
                <div className="font-bold">{PERSONS[person].name}</div>
                <div className="text-gray-600">{PERSONS[person].phone}</div>
                <div className="text-gray-600">{PERSONS[person].email}</div>
                <div className="text-gray-600">{PERSONS[person].web}</div>
              </div>
              <div className="text-sm text-right leading-6">
                <div className="font-bold">{COMPANY.name}</div>
                <div className="text-gray-600">{COMPANY.address1}</div>
                <div className="text-gray-600">{COMPANY.address2}</div>
                <div className="text-gray-600">{COMPANY.ico}</div>
                <div className="text-gray-600">{COMPANY.dic}</div>
              </div>
            </div>

            <div className="space-y-6">
              {sections.map(section => {
                const total = secTotal(section)
                const hours = secHours(section)
                return (
                  <div key={section.id}>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-900 text-white">
                          <th className="text-left px-4 py-2.5 font-semibold" style={{ width: '55%' }}>{section.title || 'Sekce'}</th>
                          <th className="text-center px-4 py-2.5 font-semibold" style={{ width: '20%' }}>Odhad hodin</th>
                          <th className="text-right px-4 py-2.5 font-semibold" style={{ width: '25%' }}>Cena</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map((item, idx) => (
                          <tr key={item.id} className={cn('border-b border-gray-100', idx % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                            <td className="px-4 py-2 text-gray-800">{item.description || <span className="text-gray-300 italic">Položka…</span>}</td>
                            <td className="px-4 py-2 text-center text-gray-700">{item.hours || '–'}</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-900">{item.price ? fmtCZK(item.price) : '–'}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                          <td className="px-4 py-2.5 text-xs uppercase tracking-wide text-gray-700">CELKEM</td>
                          <td className="px-4 py-2.5 text-center text-gray-700">{hours > 0 ? hours : ''}</td>
                          <td className="px-4 py-2.5 text-right text-gray-900 text-base">{fmtCZK(total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between bg-red-600 text-white rounded-sm px-5 py-3.5">
                <span className="font-bold text-sm tracking-wide">
                  Odhadovaná suma za {sections.length}{' '}
                  {sections.length === 1 ? 'sekci' : sections.length < 5 ? 'sekce' : 'sekcí'}
                </span>
                <span className="font-black text-lg">{fmtCZK(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          aside, .no-print { display: none !important; }
          * { overflow: visible !important; height: auto !important; }
          body, html { width: 100%; margin: 0; }
          .print-doc {
            box-shadow: none !important;
            padding: 15mm 20mm !important;
            width: 100% !important;
            max-width: 100% !important;
          }
        }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>
    </>
  )
}
