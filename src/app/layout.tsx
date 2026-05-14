import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { AiChat } from '@/components/chat/AiChat'
import { getCurrentUserProfile } from '@/lib/auth-helpers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sportivea OS',
  description: 'Interní systém agentury Sportivea',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUserProfile()
  const role = profile?.role ?? 'editor'
  const userName = profile?.name ?? ''

  return (
    <html lang="cs">
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <Sidebar role={role} userName={userName} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        {role === 'admin' && <AiChat />}
      </body>
    </html>
  )
}
