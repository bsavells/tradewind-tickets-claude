import { createClient } from 'jsr:@supabase/supabase-js@2'
import { wrapEmailHtml, emailDivider, emailNote } from '../_shared/email-template.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Pref defaults (no row in notification_prefs = opted in to immediate) ────────
const DEFAULT_ENABLED = true
const DEFAULT_FREQUENCY = 'immediate'

// ── Resolve effective email_frequency from a pref row ───────────────────────────
function resolveFrequency(pref: { email_enabled?: boolean; email_frequency?: string } | undefined): 'off' | 'immediate' | 'digest' {
  if (!pref) return DEFAULT_ENABLED ? DEFAULT_FREQUENCY as 'immediate' : 'off'
  // If email_frequency is explicitly set, use it
  if (pref.email_frequency && ['off', 'immediate', 'digest'].includes(pref.email_frequency)) {
    return pref.email_frequency as 'off' | 'immediate' | 'digest'
  }
  // Fallback for legacy rows without email_frequency
  return pref.email_enabled !== false ? 'immediate' : 'off'
}

// ── Email helper ─────────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not set — skipping email to', to)
    return
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM, name: 'Tradewind Work Tickets' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('SendGrid error:', res.status, body)
  }
}

function buildEmailHtml(title: string, body: string | null, ticketNumber: string): string {
  return wrapEmailHtml(
    `<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">${title}</h2>
     ${body ? `<p style="color:#555;margin:0 0 16px;">${body}</p>` : ''}
     <p style="margin:0 0 4px;font-size:14px;"><strong>Ticket:</strong> ${ticketNumber}</p>
     ${emailDivider()}
     ${emailNote("You're receiving this because you have notifications enabled in Tradewind Tickets.")}`,
    { preheaderText: `${title} — ${ticketNumber}` }
  )
}

// ── Main handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const { ticket_id, event_kind } = await req.json() as {
      ticket_id: string
      event_kind: 'ticket_submitted' | 'ticket_returned' | 'ticket_finalized' | 'ticket_return_requested' | 'ticket_deleted'
    }

    if (!ticket_id || !event_kind) {
      return new Response('Missing ticket_id or event_kind', { status: 400, headers: corsHeaders })
    }

    // Fetch ticket with ticket_number for digest queue
    const { data: ticket, error: tErr } = await admin
      .from('tickets')
      .select('id, ticket_number, company_id, created_by, customers(name)')
      .eq('id', ticket_id)
      .single()

    if (tErr || !ticket) {
      console.error('Ticket fetch error:', tErr)
      return new Response('Ticket not found', { status: 404, headers: corsHeaders })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerName: string = (ticket.customers as any)?.name ?? ''

    const inAppRows: {
      company_id: string
      recipient_id: string
      ticket_id: string
      kind: string
      title: string
      body: string
    }[] = []

    const digestRows: {
      company_id: string
      recipient_id: string
      ticket_number: string
      kind: string
      title: string
      body: string | null
    }[] = []

    const emailJobs: { to: string; subject: string; html: string }[] = []

    // ── Helper: process a single recipient ──────────────────────────────────────
    // Note: in_app_enabled is no longer read from prefs — in-app notifications are
    // always on. The selector only controls email (off/immediate/digest).
    function processRecipient(opts: {
      recipientId: string
      email: string
      pref: { email_enabled?: boolean; email_frequency?: string; in_app_enabled?: boolean } | undefined
      inAppDefault: boolean
      title: string
      body: string
      kind: string
      nullifyTicketId?: boolean  // for ticket_deleted (ticket FK about to disappear)
    }) {
      const inApp = true // always on
      const freq = resolveFrequency(opts.pref)

      if (inApp) {
        inAppRows.push({
          company_id: ticket.company_id,
          recipient_id: opts.recipientId,
          ticket_id: (opts.nullifyTicketId ? null : ticket.id) as unknown as string,
          kind: opts.kind,
          title: opts.title,
          body: opts.body,
        })
      }

      if (freq === 'immediate') {
        emailJobs.push({
          to: opts.email,
          subject: opts.title,
          html: buildEmailHtml(opts.title, opts.body || null, ticket.ticket_number),
        })
      } else if (freq === 'digest') {
        digestRows.push({
          company_id: ticket.company_id,
          recipient_id: opts.recipientId,
          ticket_number: ticket.ticket_number,
          kind: opts.kind,
          title: opts.title,
          body: opts.body || null,
        })
      }
    }

    // ── ticket_submitted: notify all active admins ───────────────────────────────
    if (event_kind === 'ticket_submitted') {
      const { data: admins } = await admin
        .from('profiles')
        .select('id, email')
        .eq('company_id', ticket.company_id)
        .eq('role', 'admin')
        .eq('active', true)

      if (admins && admins.length > 0) {
        const adminIds = admins.map((a) => a.id)
        const { data: prefs } = await admin
          .from('notification_prefs')
          .select('user_id, email_enabled, email_frequency, in_app_enabled')
          .in('user_id', adminIds)
          .eq('key', 'on_submit')

        const prefMap = new Map(prefs?.map((p) => [p.user_id, p]) ?? [])
        const title = `New ticket submitted: ${ticket.ticket_number}`

        for (const adm of admins) {
          processRecipient({
            recipientId: adm.id,
            email: adm.email,
            pref: prefMap.get(adm.id),
            inAppDefault: DEFAULT_ENABLED,
            title,
            body: customerName,
            kind: event_kind,
          })
        }
      }
    }

    // ── ticket_return_requested: notify all active admins ────────────────────────
    if (event_kind === 'ticket_return_requested') {
      const { data: admins } = await admin
        .from('profiles')
        .select('id, email')
        .eq('company_id', ticket.company_id)
        .eq('role', 'admin')
        .eq('active', true)

      if (admins && admins.length > 0) {
        const adminIds = admins.map((a) => a.id)
        const { data: prefs } = await admin
          .from('notification_prefs')
          .select('user_id, email_enabled, email_frequency, in_app_enabled')
          .in('user_id', adminIds)
          .eq('key', 'on_return_request')

        const prefMap = new Map(prefs?.map((p) => [p.user_id, p]) ?? [])
        const title = `Return requested for ticket ${ticket.ticket_number}`

        for (const adm of admins) {
          processRecipient({
            recipientId: adm.id,
            email: adm.email,
            pref: prefMap.get(adm.id),
            inAppDefault: DEFAULT_ENABLED,
            title,
            body: customerName,
            kind: event_kind,
          })
        }
      }
    }

    // ── ticket_returned / ticket_finalized: notify ticket creator ────────────────
    if (event_kind === 'ticket_returned' || event_kind === 'ticket_finalized') {
      const prefKey = event_kind === 'ticket_returned' ? 'on_return' : 'on_finalize'

      if (ticket.created_by && ticket.created_by !== user.id) {
        const { data: creator } = await admin
          .from('profiles')
          .select('id, email, active')
          .eq('id', ticket.created_by)
          .single()

        if (creator && creator.active) {
          const { data: pref } = await admin
            .from('notification_prefs')
            .select('email_enabled, email_frequency, in_app_enabled')
            .eq('user_id', creator.id)
            .eq('key', prefKey)
            .maybeSingle()

          const title = event_kind === 'ticket_returned'
            ? `Ticket ${ticket.ticket_number} returned for revision`
            : `Ticket ${ticket.ticket_number} has been finalized`

          processRecipient({
            recipientId: creator.id,
            email: creator.email,
            pref: pref ?? undefined,
            inAppDefault: DEFAULT_ENABLED,
            title,
            body: customerName,
            kind: event_kind,
          })
        }
      }
    }

    // ── ticket_deleted: notify creator (honours on_delete pref) ─────────────────
    if (event_kind === 'ticket_deleted') {
      if (ticket.created_by && ticket.created_by !== user.id) {
        const { data: creator } = await admin
          .from('profiles')
          .select('id, email, active')
          .eq('id', ticket.created_by)
          .single()

        if (creator && creator.active) {
          const { data: pref } = await admin
            .from('notification_prefs')
            .select('email_enabled, email_frequency, in_app_enabled')
            .eq('user_id', creator.id)
            .eq('key', 'on_delete')
            .maybeSingle()

          const title = `Ticket ${ticket.ticket_number} has been deleted`
          processRecipient({
            recipientId: creator.id,
            email: creator.email,
            pref: pref ?? undefined,
            inAppDefault: DEFAULT_ENABLED,
            title,
            body: customerName,
            kind: event_kind,
            nullifyTicketId: true,
          })
        }
      }
    }

    // ── Write in-app notifications ───────────────────────────────────────────────
    if (inAppRows.length > 0) {
      const { error: insErr } = await admin.from('notifications').insert(inAppRows)
      if (insErr) console.error('Notification insert error:', insErr)
    }

    // ── Queue digest items ───────────────────────────────────────────────────────
    if (digestRows.length > 0) {
      const { error: digErr } = await admin.from('notification_digest_queue').insert(digestRows)
      if (digErr) console.error('Digest queue insert error:', digErr)
    }

    // ── Send immediate emails ────────────────────────────────────────────────────
    await Promise.allSettled(
      emailJobs.map((j) => sendEmail(j.to, j.subject, j.html))
    )

    return new Response(
      JSON.stringify({ in_app: inAppRows.length, digest: digestRows.length, emails: emailJobs.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('notify-ticket-event unhandled error:', err)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})
