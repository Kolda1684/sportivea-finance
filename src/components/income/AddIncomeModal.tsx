'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getCurrentMonth } from '@/lib/utils'
import type { Income } from '@/types'

interface AddIncomeModalProps {
  open: boolean
  onClose: () => void
  onSaved: (income: Income) => void
  editing?: Income | null
}

const KNOWN_CLIENTS = [
  'Flashscore',
  'Slavia',
  'Fortuna liga žen',
  'Ironman',
  'J&T',
  'Daily',
  'Martin Remeš - OB',
  'PBH',
  'STES',
  'More Buckets',
  'Olympijský tým',
  'PeakSip',
  'PRQNO',
  'RTR',
  'Sportegy',
  'Sportivea',
  'Jurco',
  'drinkr',
  'Jonáš Kolomazník',
  'Nikoleta Jíchová',
  'Playbook House',
  'Jiný',
]

export function AddIncomeModal({ open, onClose, onSaved, editing }: AddIncomeModalProps) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    client: '',
    project_name: '',
    amount: '',
    date: '',
    status: 'cekame',
    note: '',
    month: getCurrentMonth(),
  })

  useEffect(() => {
    if (editing) {
      setForm({
        client: editing.client ?? '',
        project_name: editing.project_name ?? '',
        amount: editing.amount != null ? String(editing.amount) : '',
        date: editing.date ? editing.date.slice(0, 10) : '',
        status: editing.status ?? 'cekame',
        note: editing.note ?? '',
        month: editing.month ?? getCurrentMonth(),
      })
    } else {
      setForm({ client: '', project_name: '', amount: '', date: '', status: 'cekame', note: '', month: getCurrentMonth() })
    }
  }, [editing])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const url = editing ? `/api/income/${editing.id}` : '/api/income'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: form.amount ? parseFloat(form.amount) : null,
        }),
      })
      if (!res.ok) throw new Error('Chyba při ukládání')
      const saved: Income = await res.json()
      onSaved(saved)
      onClose()
    } catch {
      alert('Nepodařilo se uložit příjem.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Upravit příjem' : 'Přidat příjem'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Klient *</Label>
            <Select value={form.client} onValueChange={(v) => set('client', v)}>
              <SelectTrigger><SelectValue placeholder="Vybrat klienta" /></SelectTrigger>
              <SelectContent>
                {KNOWN_CLIENTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.client === 'Jiný' && (
              <Input
                placeholder="Název klienta"
                className="mt-1"
                onChange={e => set('client', e.target.value)}
              />
            )}
          </div>

          <div className="space-y-1">
            <Label>Název projektu *</Label>
            <Input
              required
              value={form.project_name}
              onChange={e => set('project_name', e.target.value)}
              placeholder="např. Reels únor"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Částka (Kč)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cekame">Čekáme</SelectItem>
                <SelectItem value="potvrzeno">Potvrzeno</SelectItem>
                <SelectItem value="vystaveno">Vystaveno</SelectItem>
                <SelectItem value="zaplaceno">Zaplaceno</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Poznámka</Label>
            <Textarea
              value={form.note}
              onChange={e => set('note', e.target.value)}
              placeholder="Volitelná poznámka..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Zrušit</Button>
            <Button type="submit" disabled={loading || !form.client || !form.project_name}>
              {loading ? 'Ukládám…' : editing ? 'Uložit změny' : 'Uložit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
