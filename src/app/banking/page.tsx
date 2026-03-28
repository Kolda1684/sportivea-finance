import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, FileText, Link2Off } from 'lucide-react'

export default function BankingPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bankovní centrum</h1>
        <p className="text-sm text-gray-500 mt-1">Fio banka · Fakturoid · Párování transakcí</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-dashed">
          <CardContent className="p-6 text-center space-y-3">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Fio transakce</p>
            <p className="text-sm text-muted-foreground">Synchronizovat pohyby z Fio banky</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-6 text-center space-y-3">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Fakturoid faktury</p>
            <p className="text-sm text-muted-foreground">Načíst faktury z Fakturoidu</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-6 text-center space-y-3">
            <Link2Off className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Párování</p>
            <p className="text-sm text-muted-foreground">Spárovat platby s fakturami</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border bg-yellow-50 border-yellow-200 p-6 text-center">
        <p className="text-yellow-800 font-medium">Tato sekce bude implementována ve Fázi 3 a 4.</p>
        <p className="text-yellow-700 text-sm mt-1">
          Nejdříve nastavte API klíče na stránce Nastavení.
        </p>
      </div>
    </div>
  )
}
