/**
 * Rozpoznání protistrany u bankovní transakce.
 *
 * Fio u odchozích plateb neposílá jméno protistrany — ověřeno na 447 platbách,
 * vyplněné je u nuly z nich. Identita se proto bere odjinud, a jsou na to dvě
 * různé cesty podle druhu platby:
 *
 *   karta   jméno obchodníka je v textu: "Nákup: UBER *TRIP HELP.UBER.COM, …"
 *   převod  identitu nese číslo protiúčtu (Ondřej Kolář fakturuje pořád ze
 *           stejného)
 *
 * Na reálných datech roku 2026 pokrývají tyhle dvě cesty dohromady všech 368
 * výdajů, takže žádná platba nezůstane bez klíče.
 */

export type AliasKind = 'card' | 'account'

export interface CounterpartyAlias {
  kind: AliasKind
  pattern: string
  label: string
  supplier_name: string | null
}

export interface TransactionLike {
  message: string | null
  counterparty_name: string | null
  counterparty_account: string | null
}

export interface Resolution {
  key: { kind: AliasKind; pattern: string } | null
  label: string | null
  supplierName: string | null
  /** Jak se na to přišlo — pro vysvětlení v UI. */
  via: 'card' | 'account' | 'counterparty_name' | null
}

const CARD_PREFIX = /^\s*n[aá]kup:\s*/i

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Číslo účtu bez předvolby a vodicích nul, aby "000012376232" a "12376232"
 * skončily na stejném klíči.
 */
export function normalizeAccount(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return digits.length >= 4 ? digits : null
}

/**
 * Jméno obchodníka z textu platby kartou.
 *
 * Formát Fia: "Nákup: FACEBK *ABRUA95272, FACEBOOK.COM, IE, dne 5.1."
 * Za hvězdičkou bývá identifikátor konkrétní transakce, který je pokaždé jiný —
 * kdyby zůstal v klíči, každá platba by si založila vlastní alias. Bereme proto
 * jen text před ní.
 */
export function cardMerchant(message: string | null | undefined): string | null {
  const raw = (message ?? '').trim()
  if (!CARD_PREFIX.test(raw)) return null

  const body = raw.replace(CARD_PREFIX, '')
  const firstField = body.split(',')[0] ?? ''
  const beforeStar = firstField.split('*')[0] ?? ''

  // "GOOGLE*WORKSPACE" uřízne na "GOOGLE", což je správně. Ale u
  // "AIRBNB * HMBTMJ39XP" je před hvězdičkou jen "AIRBNB " — pořád dost.
  // Když by ale zbyl zkomolek kratší než tři znaky, je lepší celé první pole.
  const candidate = normalizeText(beforeStar).length >= 3 ? beforeStar : firstField
  const key = normalizeText(candidate)
  return key.length >= 3 ? key : null
}

export function isCardPayment(tx: TransactionLike): boolean {
  return CARD_PREFIX.test((tx.message ?? '').trim())
}

/** Klíč, pod kterým se má transakce hledat ve slovníku. */
export function aliasKey(tx: TransactionLike): { kind: AliasKind; pattern: string } | null {
  const merchant = cardMerchant(tx.message)
  if (merchant) return { kind: 'card', pattern: merchant }

  const account = normalizeAccount(tx.counterparty_account)
  if (account) return { kind: 'account', pattern: account }

  return null
}

/**
 * Přiřadí transakci popisek pro deník a název dodavatele pro výběr faktury.
 *
 * Když slovník klíč nezná, ale banka výjimečně jméno protistrany poslala
 * (u příchozích plateb se to stává), použije se aspoň to.
 */
export function resolveCounterparty(
  tx: TransactionLike,
  aliases: Map<string, CounterpartyAlias>
): Resolution {
  const key = aliasKey(tx)
  if (key) {
    const hit = aliases.get(`${key.kind}:${key.pattern}`)
    if (hit) {
      return {
        key,
        label: hit.label,
        supplierName: hit.supplier_name,
        via: key.kind,
      }
    }
  }

  const fromBank = (tx.counterparty_name ?? '').trim()
  if (fromBank) {
    return { key, label: fromBank, supplierName: fromBank, via: 'counterparty_name' }
  }

  return { key, label: null, supplierName: null, via: null }
}

export function aliasMapKey(kind: AliasKind, pattern: string): string {
  return `${kind}:${pattern}`
}

export function toAliasMap(rows: CounterpartyAlias[]): Map<string, CounterpartyAlias> {
  return new Map(rows.map(r => [aliasMapKey(r.kind, r.pattern), r]))
}
