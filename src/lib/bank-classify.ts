// Deterministická klasifikace bankovních transakcí, které nikdy nemají fakturu.
// Pravidla vychází z reálných dat: vlastní účty, majitelé, nájem, stát, mzdy.

export interface ClassifiableTx {
  amount: number
  counterparty_account: string | null
  counterparty_name: string | null
  message: string | null
}

export interface ClassifyResult {
  kind: 'internal' | 'no_invoice'
  category: string
}

// Vlastní Fio účty (bez kódu banky) — převody mezi nimi jsou interní
const OWN_ACCOUNTS = ['2302617857', '2503036098']

// Známé protiúčty
const ACC_REMES = '115-1476970277'
const ACC_KOLAR = '2112213376'
const ACC_NAJEM = '17800573'

// Předčíslí účtů finanční správy / státu (daně, DPH, zálohy)
const STATE_PREFIXES = /^(705|7720|7704|21012|1011|2711|7755)-/

function normalizeText(tx: ClassifiableTx): string {
  return `${tx.counterparty_name ?? ''} ${tx.message ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function classifyTransaction(tx: ClassifiableTx): ClassifyResult | null {
  const accBase = (tx.counterparty_account ?? '').trim().split('/')[0]
  const text = normalizeText(tx)
  const income = tx.amount > 0

  // 1) Převody mezi vlastními účty
  if (OWN_ACCOUNTS.includes(accBase)) {
    return { kind: 'internal', category: 'Vlastní převod' }
  }

  // 2) Majitelé — půjčky, vklady, plat
  if (accBase === ACC_REMES || /\bremes\b/.test(text)) {
    if (/pujc/.test(text)) {
      return { kind: 'no_invoice', category: income ? 'Půjčka od majitele — M. Remeš' : 'Vrácení půjčky — M. Remeš' }
    }
    if (/^mz\d+/.test((tx.message ?? '').trim().toLowerCase()) || /mzda|plat/.test(text)) {
      return { kind: 'no_invoice', category: 'Plat majitele — M. Remeš' }
    }
    return { kind: 'no_invoice', category: 'Majitel — M. Remeš' }
  }
  if (accBase === ACC_KOLAR || /kolar jan|jan kolar/.test(text)) {
    if (/pujc/.test(text)) {
      return { kind: 'no_invoice', category: income ? 'Půjčka od majitele — J. Kolář' : 'Vrácení půjčky — J. Kolář' }
    }
    return { kind: 'no_invoice', category: income ? 'Vklad majitele — J. Kolář' : 'Majitel — J. Kolář' }
  }

  // 3) Nájem
  if (accBase === ACC_NAJEM || /\bnajem/.test(text)) {
    return { kind: 'no_invoice', category: 'Nájem' }
  }

  // 4) Stát — daně, DPH, sociální, zdravotní
  if (STATE_PREFIXES.test(accBase) || /financni urad|\bdph\b|cssz|socialni pojist|zdravotni pojist|\bvzp\b|\bozp\b|\bcpzp\b/.test(text)) {
    return { kind: 'no_invoice', category: 'Stát — daně / pojištění' }
  }

  // 5) Mzdy (výplaty s hromadnou zprávou MZ<rok><měsíc>)
  if (!income && /^mz\d{6}/.test((tx.message ?? '').trim().toLowerCase())) {
    return { kind: 'no_invoice', category: 'Mzda' }
  }

  return null
}

// Karetní platba — obchodník je jen v textu zprávy, VS je fragment karty (šum)
export function isCardTransaction(tx: ClassifiableTx): boolean {
  return /^nákup:|^nakup:/i.test((tx.message ?? '').trim())
}
