'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, Trash2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCurrentMonth } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STORAGE_KEY = 'sportivea_chat_messages'

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/income': 'Příjmy & Projekty',
  '/costs': 'Náklady – přehled',
  '/costs/variable': 'Variabilní náklady',
  '/costs/fixed': 'Fixní náklady',
  '/costs/extra': 'Extra náklady',
  '/invoices': 'Vydané faktury',
  '/invoices/expense': 'Přijaté faktury',
  '/cashflow': 'Cashflow',
  '/banking': 'Bankovní výpisy',
}

const SUGGESTIONS = [
  'Jaký je aktuální zisk?',
  'Kdo z týmu vydělává nejvíc?',
  'Co bych měl zlepšit?',
  'Kolik mám nezaplacených faktur?',
]

export function AiChat({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const [open, setOpen] = useState(initialOpen)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pathname = usePathname()

  // Načti zprávy z sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [])

  // Ulož zprávy do sessionStorage při každé změně
  useEffect(() => {
    if (messages.length > 0) {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch {}
    }
  }, [messages])

  // Uvítací zpráva při prvním otevření
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'Ahoj! Jsem tvůj asistent pro Sportivea. Zeptej se mě na cokoliv — finance, cenotvorbu, klienty, tým nebo strategická rozhodnutí.',
      }])
    }
  }, [open, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus()
  }, [open, minimized])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          month: getCurrentMonth(),
          currentPage: PAGE_LABELS[pathname] ?? pathname,
        }),
      })
      const data = await res.json()
      if (data.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Omlouvám se, něco se pokazilo. Zkus to znovu.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function clearChat() {
    setMessages([])
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  }

  const currentPageLabel = PAGE_LABELS[pathname]

  return (
    <>
      {/* Plovoucí tlačítko */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimized(false) }}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary-900 text-white shadow-xl hover:bg-primary-800 transition-all flex items-center justify-center group"
          title="AI asistent"
        >
          <MessageCircle className="h-6 w-6" />
          {messages.length > 1 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium">
              {messages.filter(m => m.role === 'assistant').length}
            </span>
          )}
        </button>
      )}

      {/* Chat okno */}
      {open && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl border bg-white shadow-2xl overflow-hidden transition-all duration-200',
          minimized ? 'w-[280px] h-auto' : 'w-[400px] h-[600px]'
        )}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary-900 text-white flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">AI asistent</p>
              {currentPageLabel && !minimized && (
                <p className="text-xs text-white/60 truncate">na stránce: {currentPageLabel}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 1 && (
                <button
                  onClick={clearChat}
                  className="text-white/60 hover:text-white transition-colors p-1 rounded"
                  title="Smazat chat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setMinimized(m => !m)}
                className="text-white/60 hover:text-white transition-colors p-1 rounded"
                title={minimized ? 'Rozbalit' : 'Minimalizovat'}
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', minimized && 'rotate-180')} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-white/60 hover:text-white transition-colors p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Zprávy */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-primary-900 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                            li: ({ children }) => <li>{children}</li>,
                            h3: ({ children }) => <p className="font-semibold mt-2 mb-0.5">{children}</p>,
                            h2: ({ children }) => <p className="font-semibold mt-2 mb-0.5">{children}</p>,
                            code: ({ children }) => <code className="bg-gray-200 rounded px-1 text-xs">{children}</code>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Přemýšlím…</span>
                    </div>
                  </div>
                )}

                {messages.length === 1 && !loading && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); inputRef.current?.focus() }}
                        className="text-xs bg-white border rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="border-t p-3 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Napiš otázku… (Enter = odeslat)"
                    rows={1}
                    className="flex-1 resize-none rounded-xl border bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-900 focus:bg-white transition-colors max-h-28 overflow-y-auto"
                    style={{ lineHeight: '1.5' }}
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() || loading}
                    className="h-9 w-9 rounded-xl bg-primary-900 text-white flex items-center justify-center disabled:opacity-40 hover:bg-primary-800 transition-colors flex-shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
