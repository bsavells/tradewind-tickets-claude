import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Pref defaults (no row in notification_prefs = opted in) ──────────────────
const DEFAULT_ENABLED = true

// ── Email helper ─────────────────────────────────────────────────────────────
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
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:20px;">
    <span style="font-size:18px;font-weight:bold;color:#1d4ed8;">Tradewind Work Tickets</span>
  </div>
  <h2 style="margin:0 0 8px;">${title}</h2>
  ${body ? `<p style="color:#555;margin:0 0 16px;">${body}</p>` : ''}
  <p style="margin:0 0 4px;"><strong>Ticket:</strong> ${ticketNumber}</p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;margin:0;">
    You're receiving this because you have notifications enabled in Tradewind Work Tickets.
  </p>
</body>
</html>`
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    // Service-role client for all DB operations
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    // Verify JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const { ticket_id, event_kind } = await req.json() as {
      ticket_id: string
      event_kind: 'ticket_submitted' | 'ticket_returned' | 'ticket_finalized' | 'ticket_return_requested'
    }

    if (!ticket_id || !event_kind) {
      return new Response('Missing ticket_id or event_kind', { status: 400, headers: corsHeaders })
    }

    // Fetch ticket with customer name
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

    // Collect in-app rows and email jobs
    const inAppRows: {
      company_id: string
      recipient_id: string
      ticket_id: string
      kind: string
      title: string
      body: string
    }[] = []

    const emailJobs: { to: string; subject: string; html: string }[] = []

    // ── ticket_submitted: notify all active admins ───────────────────────────
    if (event_kind === 'ticket_submitted') {
      const { data: admins } = await admin
        .from('profiles')
        .select('id, email')
        .eq('company_id', ticket.company_id)
        .eq('role', 'admin')
        .eq('active', true)

      if (admins && admins.length > 0) {
        const adminIds = admins.map((a) => a.id)

        // Fetch their prefs for 'on_submit'
        const { data: prefs } = await admin
          .from('notification_prefs')
          .select('user_id, email_enabled, in_app_enabled')
          .in('user_id', adminIds)
          .eq('key', 'on_submit')

        const prefMap = new Map(prefs?.map((p) => [p.user_id, p]) ?? [])

        const title = `New ticket submitted: ${ticket.ticket_number}`
        const body = customerName

        for (const adm of admins) {
          const pref = prefMap.get(adm.id)
          const inApp = pref?.in_app_enabled ?? DEFAULT_ENABLED
          const emailEnabled = pref?.email_enabled ?? DEFAULT_ENABLED

          if (inApp) {
            inAppRows.push({
              company_id: ticket.company_id,
              recipient_id: adm.id,
              ticket_id: ticket.id,
              kind: event_kind,
              title,
              body,
            })
          }
          if (emailEnabled) {
            emailJobs.push({
              to: adm.email,
              subject: title,
              html: buildEmailHtml(title, body, ticket.ticket_number),
            })
          }
        }
      }
    }

    // ── ticket_return_requested: notify all active admins ───────────────────────
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
          .select('user_id, email_enabled, in_app_enabled')
          .in('user_id', adminIds)
          .eq('key', 'on_submit')

        const prefMap = new Map(prefs?.map((p) => [p.user_id, p]) ?? [])

        const title = `Return requested for ticket ${ticket.ticket_number}`
        const body = customerName

        for (const adm of admins) {
          const pref = prefMap.get(adm.id)
          const inApp = pref?.in_app_enabled ?? DEFAULT_ENABLED
          const emailEnabled = pref?.email_enabled ?? DEFAULT_ENABLED

          if (inApp) {
            inAppRows.push({
              company_id: ticket.company_id,
              recipient_id: adm.id,
              ticket_id: ticket.id,
              kind: event_kind,
              title,
              body,
            })
          }
          if (emailEnabled) {
            emailJobs.push({
              to: adm.email,
              subject: title,
              html: buildEmailHtml(title, body, ticket.ticket_number),
            })
          }
        }
      }
    }

    // ── ticket_returned / ticket_finalized: notify the ticket creator ─────────
    if (event_kind === 'ticket_returned' || event_kind === 'ticket_finalized') {
      const prefKey = event_kind === 'ticket_returned' ? 'on_return' : 'on_finalize'

      // Don't notify if the caller IS the creator (self-action edge case)
      if (ticket.created_by && ticket.created_by !== user.id) {
        const { data: creator } = await admin
          .from('profiles')
          .select('id, email, active')
          .eq('id', ticket.created_by)
          .single()

        if (creator && creator.active) {
          const { data: pref } = await admin
            .from('notification_prefs')
            .select('email_enabled, in_app_enabled')
            .eq('user_id', creator.id)
            .eq('key', prefKey)
            .maybeSingle()

          const inApp = pref?.in_app_enabled ?? DEFAULT_ENABLED
          const emailEnabled = pref?.email_enabled ?? DEFAULT_ENABLED

          const title = event_kind === 'ticket_returned'
            ? `Ticket ${ticket.ticket_number} returned for revision`
            : `Ticket ${ticket.ticket_number} has been finalized`

          if (inApp) {
            inAppRows.push({
              company_id: ticket.company_id,
              recipient_id: creator.id,
              ticket_id: ticket.id,
              kind: event_kind,
              title,
              body: customerName,
            })
          }
          if (emailEnabled) {
            emailJobs.push({
              to: creator.email,
              subject: title,
              html: buildEmailHtml(title, customerName || null, ticket.ticket_number),
            })
          }
        }
      }
    }

    // ── Write in-app notifications ───────────────────────────────────────────
    if (inAppRows.length > 0) {
      const { error: insErr } = await admin.from('notifications').insert(inAppRows)
      if (insErr) console.error('Notification insert error:', insErr)
    }

    // ── Send emails (fire and forget per recipient) ──────────────────────────
    await Promise.allSettled(
      emailJobs.map((j) => sendEmail(j.to, j.subject, j.html))
    )

    return new Response(
      JSON.stringify({ in_app: inAppRows.length, emails: emailJobs.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('notify-ticket-event unhandled error:', err)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})
