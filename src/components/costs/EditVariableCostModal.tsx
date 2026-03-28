'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VariableCost } from '@/types'

const TEAM_MEMBERS = ['Adam Onderka', 'Anna Švaralová', 'Daniel Richtr', 'Filip Telenský', 'Jan Pachota', 'Michal Komárek', 'Ondřej Cetkovský', 'Ondřej Kolář', 'Vojtěch Kepka']
const TASK_TYPES = ['Reels', 'Natáčení', 'Grafika', 'Long-form', 'Story', 'Editing', 'Produkce', 'Jiný']
const CLIENTS = [
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
]

interface Props {
  cost: VariableCost | null
  open: boolean
  onClose: () => void
  onSaved: (updated: VariableCost) => void
}

export function EditVariableCostModal({ cost, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    team_member: '',
    client: '',
    task_name: '',
    task_type: '',
    hours: '',
    price: '',
    date: '',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (cost) {
      setForm({
        team_member: cost.team_member ?? '',
        client: cost.client ?? '',
        task_name: cost.task_name ?? '',
        task_type: cost.task_type ?? '',
        hours: cost.hours?.toString() ?? '',
        price: cost.price?.toString() ?? '',
        date: cost.date ?? '',
      })
    }
  }, [cost])

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cost) return
    setLoading(true)
    try {
      const res = await fetch(`/api/costs/variable/${cost.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_member: form.team_member || null,
          client: form.client || null,
          task_name: form.task_name || null,
          task_type: form.task_type || null,
          hours: form.hours ? parseFloat(form.hours) : null,
          price: form.price ? parseFloat(form.price) : null,
          date: form.date || null,
        }),
      })
      if (!res.ok) throw new Error('Chyba uložení')
      const updated: VariableCost = await res.json()
      onSaved(updated)
      onClose()
    } catch {
      alert('Nepodařilo se uložit.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upravit záznam</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Člen týmu</Label>
              <Select value={form.team_member} onValueChange={v => set('team_member', v)}>
                <SelectTrigger><SelectValue placeholder="Vybrat" /></SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>
                Klient
                {!form.client && <span className="ml-1 text-xs text-red-500">(chybí!)</span>}
              </Label>
              <Select value={form.client} onValueChange={v => set('client', v)}>
                <SelectTrigger className={!form.client ? 'border-red-300 bg-red-50' : ''}>
                  <SelectValue placeholder="Vybrat klienta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="—">— Bez klienta</SelectItem>
                  {CLIENTS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Název tasku</Label>
            <Input value={form.task_name} onChange={e => set('task_name', e.target.value)} placeholder="např. MB - Soutěžní reels" />
          </div>

          <div className="space-y-1">
            <Label>Typ úkonu</Label>
            <Select value={form.task_type} onValueChange={v => set('task_type', v)}>
              <SelectTrigger><SelectValue placeholder="Vybrat" /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Hodiny</Label>
              <Input type="number" step="0.5" value={form.hours} onChange={e => set('hours', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Cena (Kč)</Label>
              <Input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Zrušit</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Ukládám…' : 'Uložit'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
