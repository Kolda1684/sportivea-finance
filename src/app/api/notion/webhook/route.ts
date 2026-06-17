import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { retrievePage } from '@/lib/notion'
import { syncCompanyPage, syncTaskPage, getTeamMemberForDb, getCompaniesDbId } from '@/lib/notion-mapping'

// Notion webhook receiver.
//
// 1. Verification handshake — Notion první zavolá s `{ verification_token: "..." }`.
//    Endpoint MUSÍ vrátit 200 (s nebo bez echa). Notion ti pak token ukáže v UI
//    a ty ho uložíš jako NOTION_WEBHOOK_SECRET.
// 2. Další eventy mají hlavičku X-Notion-Signature s HMAC-SHA256(NOTION_WEBHOOK_SECRET, body).
// 3. Eventy: page.created, page.updated, page.deleted, database.content_updated …

function verifySignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  // Notion posílá hash jako "sha256=hex"
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

interface NotionWebhookBody {
  verification_token?: string
  id?: string
  type?: string
  entity?: { id: string; type: string }
  data?: { parent?: { id: string; type: string } }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  let body: NotionWebhookBody
  try {
    body = JSON.parse(rawBody) as NotionWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 1) Verification handshake — uložíme token do logu, uživatel ho zkopíruje do Vercel env
  if (body.verification_token) {
    console.log('[Notion webhook] Verification token received:', body.verification_token)
    console.log('[Notion webhook] Ulož toto jako NOTION_WEBHOOK_SECRET ve Vercel env vars.')
    return NextResponse.json({ ok: true })
  }

  // 2) Signature check (povinné u všech ostatních eventů)
  const secret = process.env.NOTION_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'NOTION_WEBHOOK_SECRET není nastavený' }, { status: 500 })
  }
  if (!verifySignature(secret, rawBody, req.headers.get('x-notion-signature'))) {
    return NextResponse.json({ error: 'Neplatný podpis' }, { status: 401 })
  }

  if (!body.id || !body.type) {
    return NextResponse.json({ ok: true }) // neznámý event — ignoruj tiše
  }

  // 3) Dedup — Notion občas posílá events 2× nebo s retries
  const supabase = createAdminSupabaseClient()
  const { data: existing } = await supabase
    .from('notion_webhook_events')
    .select('id')
    .eq('id', body.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true })
  }
  await supabase.from('notion_webhook_events').insert({
    id: body.id,
    event_type: body.type,
    entity_id: body.entity?.id ?? null,
  })

  // 4) Zpracuj event — rychle vrátit 200, ať Notion nedělá retry
  // Pro page.created / page.updated: zjisti, do které DB stránka patří, a spusť sync
  const entityType = body.entity?.type
  const entityId = body.entity?.id
  const parentDbId = body.data?.parent?.id

  if (!entityId) {
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'page.deleted') {
    await supabase.from('tasks').delete().eq('notion_page_id', entityId)
    await supabase.from('companies').delete().eq('notion_page_id', entityId)
    return NextResponse.json({ ok: true, action: 'deleted' })
  }

  if (entityType === 'page' && (body.type === 'page.created' || body.type === 'page.updated' || body.type === 'page.properties_updated' || body.type === 'page.content_updated')) {
    const page = await retrievePage(entityId)
    if (!page) {
      return NextResponse.json({ ok: true, action: 'skipped' })
    }

    const companiesDb = getCompaniesDbId()?.replace(/-/g, '')
    const pageParentDb = (parentDbId ?? (page.parent.type === 'database_id' ? page.parent.database_id : null))?.replace(/-/g, '')

    if (pageParentDb === companiesDb) {
      await syncCompanyPage(page)
      return NextResponse.json({ ok: true, action: 'company_synced' })
    }
    // Tasks: rozhodneme podle toho, jestli parent DB patří některému zaměstnanci
    if (pageParentDb) {
      const teamMember = await getTeamMemberForDb(pageParentDb)
      if (teamMember) {
        await syncTaskPage(page, teamMember)
        return NextResponse.json({ ok: true, action: 'task_synced', team_member: teamMember })
      }
    }
  }

  return NextResponse.json({ ok: true, action: 'unhandled', type: body.type })
}
