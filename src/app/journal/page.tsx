import { BookOpen } from 'lucide-react'

export default function JournalPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Finanční deník</h1>
        <p className="text-sm text-gray-500 mt-1">Export pro účetní</p>
      </div>
      <div className="rounded-xl border bg-yellow-50 border-yellow-200 p-8 text-center">
        <BookOpen className="h-12 w-12 mx-auto text-yellow-500 mb-3" />
        <p className="text-yellow-800 font-medium">Finanční deník bude implementován ve Fázi 6.</p>
        <p className="text-yellow-700 text-sm mt-1">
          Exportuje spárované transakce ↔ faktury jako XLSX/CSV pro účetní.
        </p>
      </div>
    </div>
  )
}
