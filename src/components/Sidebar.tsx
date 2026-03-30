'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  DollarSign,
  CreditCard,
  BookOpen,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  LogOut,
  FileText,
  Waves,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/income',
    label: 'Příjmy & Projekty',
    icon: DollarSign,
  },
  {
    label: 'Náklady',
    icon: TrendingDown,
    children: [
      { href: '/costs',          label: 'Přehled' },
      { href: '/costs/variable', label: 'Variabilní' },
      { href: '/costs/fixed',    label: 'Fixní' },
      { href: '/costs/extra',    label: 'Extra' },
    ],
  },
  {
    label: 'Faktury',
    icon: FileText,
    children: [
      { href: '/invoices',         label: 'Vydané (příjmy)' },
      { href: '/invoices/expense', label: 'Přijaté (náklady)' },
    ],
  },
  {
    href: '/cashflow',
    label: 'Cashflow',
    icon: Waves,
  },
  {
    href: '/journal',
    label: 'Finanční deník',
    icon: BookOpen,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Náklady: pathname.startsWith('/costs'),
    Faktury: pathname.startsWith('/invoices'),
  })

  function toggleGroup(label: string) {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-primary-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-primary-800">
        <CreditCard className="h-6 w-6 text-accent" />
        <span className="font-bold text-lg tracking-tight">Finanční deník</span>
      </div>

      {/* Navigace */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 space-y-1">
        {navItems.map((item) => {
          if (item.children) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    'text-primary-100 hover:bg-primary-800 hover:text-white',
                    openGroups[item.label] && 'bg-primary-800 text-white'
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {openGroups[item.label]
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />
                  }
                </button>
                {openGroups[item.label] && (
                  <div className="ml-7 mt-1 space-y-1">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                          pathname === child.href
                            ? 'bg-accent text-primary-900 font-medium'
                            : 'text-primary-200 hover:bg-primary-800 hover:text-white'
                        )}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === item.href
                  ? 'bg-accent text-primary-900'
                  : 'text-primary-100 hover:bg-primary-800 hover:text-white'
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Spodní část */}
      <div className="border-t border-primary-800 px-3 py-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-primary-200 hover:bg-primary-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Odhlásit se
        </button>
      </div>
    </aside>
  )
}
