/**
 * Rozhodne, jestli se přijatá faktura dá zapsat rovnou, nebo se má Jan zeptat.
 *
 * Vzniklo z toho, že Jan nechce odklikávat každou fakturu — u Facebooku, který
 * chodí několikrát týdně, je potvrzování jen zdržení. Ptát se má smysl jen tam,
 * kde je co zkazit.
 *
 * Kontrola duplicit stojí na dvojici (dodavatel, číslo dokladu). Na 300
 * reálných fakturách je číslo dokladu vyplněné u všech a kolize nula — kdežto
 * IČO je vyplněné u nuly z nich a variabilní symbol chybí u třetiny, takže
 * původní klíč (IČO + VS + částka + datum) se u 97 faktur vůbec nespustil.
 *
 * Naopak samotná dvojice částka + datum jako klíč nestačí: Meta účtuje několik
 * stejných malých částek za jediný den (43, 43, 46, 58 Kč), takže by to
 * pravidelně hlásilo duplicitu u nejčastějšího dodavatele.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ReviewReason =
  | { kind: 'duplicate'; invoiceId: string; supplier: string | null; date: string | null; number: string | null }
  | { kind: 'ocr_warning'; detail: string }
  | { kind: 'new_supplier'; supplier: string | null }
  | { kind: 'unusual_amount'; amount: number; usual: number }

export interface ReviewVerdict {
  /** true = zapsat rovnou, false = zeptat se Jana */
  clear: boolean
  reasons: ReviewReason[]
}

/** Bez diakritiky, interpunkce a právních přípon — „KPMG Česká republika, s.r.o." a „KPMG - Čr" se mají potkat. */
export function normalizeSupplier(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\s*r\s*o|spol|a\s*s|as|ltd|limited|inc|llc|gmbh|pte|plc|ag|bv)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Číslo dokladu bez oddělovačů a vodicích nul, ať „2026-0014" a „20260014" sedí. */
export function normalizeDocNumber(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, '')
}

export interface DraftLike {
  id?: string
  supplier_name: string | null
  /** Číslo dokladu od dodavatele; v expense_invoices je uložené ve sloupci note. */
  invoice_number: string | null
  amount: number | null
  warnings?: unknown[]
}

/**
 * Posoudí draft proti tomu, co už v systému je.
 *
 * `expense_invoices` se denně plní z Fakturoidu, takže hledání v ní pokrývá
 * i faktury založené přímo tam — s tím, že čerstvost je na úrovni posledního
 * synchronizačního běhu.
 */
export async function reviewDraft(supabase: SupabaseClient, draft: DraftLike): Promise<ReviewVerdict> {
  const reasons: ReviewReason[] = []

  if (Array.isArray(draft.warnings) && draft.warnings.length > 0) {
    for (const w of draft.warnings.slice(0, 3)) {
      reasons.push({ kind: 'ocr_warning', detail: typeof w === 'string' ? w : JSON.stringify(w) })
    }
  }

  const supplierKey = normalizeSupplier(draft.supplier_name)
  const docKey = normalizeDocNumber(draft.invoice_number)

  // Načteme jen faktury téhož dodavatele — porovnání jde přes normalizaci,
  // takže se nedá udělat rovnou v dotazu.
  const { data: existing } = await supabase
    .from('expense_invoices')
    .select('id, supplier_name, note, amount, date')
    .limit(1000)

  const rows = existing ?? []
  const sameSupplier = rows.filter(
    r => r.id !== draft.id && normalizeSupplier(r.supplier_name) === supplierKey && supplierKey !== ''
  )

  if (docKey) {
    const dup = sameSupplier.find(r => normalizeDocNumber(r.note) === docKey)
    if (dup) {
      reasons.push({
        kind: 'duplicate',
        invoiceId: dup.id,
        supplier: dup.supplier_name,
        date: dup.date,
        number: dup.note,
      })
    }
  }

  if (sameSupplier.length === 0) {
    reasons.push({ kind: 'new_supplier', supplier: draft.supplier_name })
  } else if (draft.amount != null && draft.amount > 0 && sameSupplier.length >= 3) {
    // Proti dosud nejvyšší faktuře, ne proti mediánu. U Mety chodí od 43 Kč do
    // 3 000 Kč, takže medián × 5 se trefil i do úplně běžné faktury a ptal se
    // zbytečně. Zajímavá je až částka, která vybočuje ze všeho dosavadního.
    const amounts = sameSupplier.map(r => Math.abs(Number(r.amount) || 0)).filter(a => a > 0)
    const max = amounts.length ? Math.max(...amounts) : 0
    if (max > 0 && draft.amount > max * 3) {
      reasons.push({ kind: 'unusual_amount', amount: draft.amount, usual: max })
    }
  }

  return { clear: reasons.length === 0, reasons }
}

/** Věta do chatu — proč se ptám. */
export function explainReasons(reasons: ReviewReason[]): string {
  return reasons
    .map(r => {
      switch (r.kind) {
        case 'duplicate':
          return `už ji máš zapsanou (${r.supplier ?? 'dodavatel'}, doklad ${r.number ?? '?'}, ${r.date ?? '?'})`
        case 'ocr_warning':
          return `čtení faktury hlásí: ${r.detail}`
        case 'new_supplier':
          return `tenhle dodavatel tu ještě nebyl (${r.supplier ?? '?'})`
        case 'unusual_amount':
          return `částka ${r.amount} výrazně přesahuje dosud nejvyšší fakturu od tohoto dodavatele (${Math.round(r.usual)})`
      }
    })
    .join('; ')
}
