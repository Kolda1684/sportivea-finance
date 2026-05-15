'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  DollarSign,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  LogOut,
  FileText,
  Sparkles,
  Calculator,
  BookOpen,
  CheckSquare,
  Calendar,
  Users,
  User,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/lib/auth-helpers'

interface SidebarProps {
  role: UserRole
  userName: string
}

const adminNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/income', label: 'Příjmy & Projekty', icon: DollarSign },
  {
    label: 'Náklady',
    icon: TrendingDown,
    children: [
      { href: '/costs', label: 'Přehled' },
      { href: '/costs/variable', label: 'Variabilní' },
      { href: '/costs/fixed', label: 'Fixní' },
      { href: '/costs/extra', label: 'Extra' },
    ],
  },
  {
    label: 'Faktury',
    icon: FileText,
    children: [
      { href: '/invoices', label: 'Vydané (příjmy)' },
      { href: '/invoices/expense', label: 'Přijaté (náklady)' },
    ],
  },
  { href: '/invoices/upload', label: 'AI Upload faktur', icon: Sparkles },
  { href: '/journal', label: 'Finanční deník', icon: BookOpen },
  { href: '/cenotvorba', label: 'Cenotvorba', icon: Calculator },
]

const sharedNavItems = [
  { href: '/tasks', label: 'Tasky', icon: CheckSquare },
  { href: '/calendar', label: 'Kalendář', icon: Calendar },
]

const adminOnlyBottomItems = [
  { href: '/crm', label: 'Klienti & Kontakty', icon: Users },
  { href: '/nastaveni/users', label: 'Správa uživatelů', icon: Settings },
]

const editorNavItems = [
  { href: '/muj-vykaz', label: 'Můj výkaz', icon: User },
]

export function Sidebar({ role, userName }: SidebarProps) {
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

  const isAdmin = role === 'admin'
  const topItems = isAdmin ? adminNavItems : []
  const middleItems = sharedNavItems
  const bottomExtraItems = isAdmin ? adminOnlyBottomItems : editorNavItems

  function renderItem(item: { href?: string; label: string; icon: React.ComponentType<{ className?: string }>; children?: { href: string; label: string }[] }) {
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
              {item.children.map(child => (
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
          pathname === item.href || (item.href !== '/tasks' && pathname.startsWith(item.href!))
            ? 'bg-accent text-primary-900'
            : 'text-primary-100 hover:bg-primary-800 hover:text-white'
        )}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        {item.label}
      </Link>
    )
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-primary-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-primary-800">
        <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-primary-900">S</span>
        </div>
        <div>
          <span className="font-bold text-base tracking-tight block leading-tight">Sportivea OS</span>
          {userName && <span className="text-xs text-primary-300 leading-tight">{userName}</span>}
        </div>
      </div>

      {/* Navigace */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 space-y-0.5">
        {/* Sdílené (tasky + kalendář) vždy nahoře */}
        <div className="mb-2">
          {middleItems.map(renderItem)}
        </div>

        {/* Finanční sekce — jen admin */}
        {isAdmin && topItems.length > 0 && (
          <>
            <div className="px-3 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-400">Finance</span>
            </div>
            <div className="space-y-0.5 mb-2">
              {topItems.map(renderItem)}
            </div>
          </>
        )}

        {/* Spodní položky dle role */}
        {bottomExtraItems.length > 0 && (
          <>
            <div className="px-3 py-1.5 mt-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary-400">
                {isAdmin ? 'Správa' : 'Moje'}
              </span>
            </div>
            <div className="space-y-0.5">
              {bottomExtraItems.map(renderItem)}
            </div>
          </>
        )}
      </nav>

      {/* Odhlášení */}
      <div className="border-t border-primary-800 px-3 py-3">
        <div className="px-3 py-1 mb-1">
          <span className="text-xs text-primary-400">
            {isAdmin ? 'Admin' : 'Editor'}
          </span>
        </div>
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
