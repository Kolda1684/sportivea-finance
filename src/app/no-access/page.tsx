import { CreditCard } from 'lucide-react'

// Přistávací stránka pro přihlášené uživatele bez admin role.
// Aplikace je čistě finanční dashboard — přístup mají jen admini.
export default function NoAccessPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900">
          <CreditCard className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Finanční dashboard</h1>
        <p className="mt-2 text-sm text-gray-500">
          Tvůj účet nemá přístup do finanční sekce. Pokud ho potřebuješ, kontaktuj Jana.
        </p>
      </div>
    </div>
  )
}
