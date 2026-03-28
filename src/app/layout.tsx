import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { AiChat } from '@/components/chat/AiChat'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Finanční Dashboard',
  description: 'Finanční přehled marketingové firmy',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
        <AiChat />
      </body>
    </html>
  )
}
