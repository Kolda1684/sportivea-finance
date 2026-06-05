'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { MessageCircle } from 'lucide-react'

const AiChat = dynamic(() => import('./AiChat').then(m => ({ default: m.AiChat })), {
  ssr: false,
  loading: () => null,
})

export function AiChatLauncher() {
  const [activated, setActivated] = useState(false)

  if (activated) return <AiChat initialOpen />

  return (
    <button
      onClick={() => setActivated(true)}
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary-900 text-white shadow-xl hover:bg-primary-800 transition-all flex items-center justify-center"
      title="AI asistent"
      aria-label="Otevřít AI asistenta"
    >
      <MessageCircle className="h-6 w-6" />
    </button>
  )
}
