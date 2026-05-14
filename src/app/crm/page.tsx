'use client'

import { useState, useEffect } from 'react'
import { Plus, X, Loader2, Building2, User, Phone, Mail, Globe } from 'lucide-react'
import type { Company, Contact } from '@/types'

type Tab = 'companies' | 'contacts'

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>('companies')
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [companyForm, setCompanyForm] = useState({ name: '', ico: '', website: '', note: '' })
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', company_id: '', note: '' })

  useEffect(() => {
    Promise.all([
      fetch('/api/crm/companies').then(r => r.json()),
      fetch('/api/crm/contacts').then(r => r.json()),
    ]).then(([c, ct]) => {
      setCompanies(c)
      setContacts(ct)
      setLoading(false)
    })
  }, [])

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/crm/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyForm),
    })
    if (res.ok) {
      const newCompany = await res.json()
      setCompanies(prev => [...prev, newCompany].sort((a, b) => a.name.localeCompare(b.name)))
      setCompanyForm({ name: '', ico: '', website: '', note: '' })
      setShowModal(false)
    }
    setSaving(false)
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/crm/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactForm),
    })
    if (res.ok) {
      const newContact = await res.json()
      setContacts(prev => [...prev, newContact].sort((a, b) => a.name.localeCompare(b.name)))
      setContactForm({ name: '', email: '', phone: '', company_id: '', note: '' })
      setShowModal(false)
    }
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Klienti & Kontakty</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {tab === 'companies' ? 'Nová firma' : 'Nový kontakt'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {(['companies', 'contacts'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'companies' ? `Firmy (${companies.length})` : `Kontakty (${contacts.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : tab === 'companies' ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          {companies.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Žádné firmy</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Firma</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">IČO</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Web</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Poznámka</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {companies.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.ico ?? '—'}</td>
                    <td className="px-4 py-3">
                      {c.website ? (
                        <a href={c.website} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1">
                          <Globe className="h-3.5 w-3.5" />
                          {c.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          {contacts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Žádné kontakty</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Jméno</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Firma</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Telefon</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contacts.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.company?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />{c.email}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                          <Phone className="h-3.5 w-3.5" />{c.phone}
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modaly */}
      {showModal && tab === 'companies' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">Nová firma</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreateCompany} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Název *</label>
                <input required value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">IČO</label>
                  <input value={companyForm.ico} onChange={e => setCompanyForm(f => ({ ...f, ico: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Web</label>
                  <input value={companyForm.website} onChange={e => setCompanyForm(f => ({ ...f, website: e.target.value }))}
                    placeholder="https://"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Poznámka</label>
                <textarea value={companyForm.note} onChange={e => setCompanyForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Zrušit</button>
                <button type="submit" disabled={saving} className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}Uložit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal && tab === 'contacts' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">Nový kontakt</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreateContact} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Jméno *</label>
                <input required value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Firma</label>
                <select value={contactForm.company_id} onChange={e => setContactForm(f => ({ ...f, company_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— bez firmy —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Email</label>
                  <input type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Telefon</label>
                  <input value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Poznámka</label>
                <textarea value={contactForm.note} onChange={e => setContactForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Zrušit</button>
                <button type="submit" disabled={saving} className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}Uložit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
