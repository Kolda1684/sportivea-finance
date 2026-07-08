import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { AiChatLauncher } from '@/components/chat/AiChatLauncher'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sportivea OS',
  description: 'Interní systém agentury Sportivea',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Identitu ověřil middleware a předal v hlavičkách — žádné Supabase cally per render.
  const h = headers()
  const role = (h.get('x-user-role') === 'admin' ? 'admin' : 'editor') as 'admin' | 'editor'
  const userName = decodeURIComponent(h.get('x-user-name') ?? '')

  return (
    <html lang="cs">
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <Sidebar role={role} userName={userName} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        {role === 'admin' && <AiChatLauncher />}
      </body>
    </html>
  )
}
