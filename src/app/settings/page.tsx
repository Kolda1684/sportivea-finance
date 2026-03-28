'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'

interface SecretFieldProps {
  label: string
  settingKey: string
  placeholder?: string
  description?: string
}

function SecretField({ label, settingKey, placeholder, description }: SecretFieldProps) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle')

  async function save() {
    if (!value.trim()) return
    setStatus('saving')
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: value.trim() }),
      })
      setStatus(res.ok ? 'ok' : 'error')
      if (res.ok) setValue('')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 3000)
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder ?? '••••••••••••'}
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button onClick={save} disabled={!value.trim() || status === 'saving'} size="sm">
          {status === 'saving' ? 'Ukládám…' : 'Uložit'}
        </Button>
        {status === 'ok' && <CheckCircle className="h-5 w-5 text-green-600 self-center" />}
        {status === 'error' && <AlertCircle className="h-5 w-5 text-red-500 self-center" />}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nastavení</h1>
        <p className="text-sm text-gray-500 mt-1">API klíče jsou uloženy šifrovaně v databázi</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fio banka</CardTitle>
          <CardDescription>API token pro stahování bankovních transakcí</CardDescription>
        </CardHeader>
        <CardContent>
          <SecretField
            label="Fio API token"
            settingKey="fio_token"
            description="Získáte na: Internetbanking → Nastavení → API"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fakturoid</CardTitle>
          <CardDescription>Přístupové údaje pro synchronizaci faktur</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SecretField label="Email" settingKey="fakturoid_email" placeholder="vas@email.cz" />
          <SecretField
            label="API token"
            settingKey="fakturoid_token"
            description="Fakturoid → Váš účet → API přístupy"
          />
          <SecretField label="Slug účtu" settingKey="fakturoid_slug" placeholder="nazev-firmy" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">OpenAI</CardTitle>
          <CardDescription>API klíč pro AI čtení faktur (GPT-4o Vision)</CardDescription>
        </CardHeader>
        <CardContent>
          <SecretField
            label="OpenAI API key"
            settingKey="openai_api_key"
            description="platform.openai.com → API keys"
          />
        </CardContent>
      </Card>

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
        <strong>Bezpečnost:</strong> API klíče jsou šifrované pomocí AES v PostgreSQL databázi.
        Nikdy nejsou přenášeny v plain textu ani uloženy v kódu.
      </div>
    </div>
  )
}
