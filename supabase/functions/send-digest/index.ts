import { createClient } from 'jsr:@supabase/supabase-js@2'
import { wrapEmailHtml, emailDigestSection, emailDivider, emailNote } from '../_shared/email-template.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Get current hour in Central Time (handles DST automatically) ─────────────────
function getCTHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    hour12: false,
  })
  const val = formatter.format(new Date())
  // Intl returns '24' for midnight in some environments; normalise to 0
  return parseInt(val) % 24
}

// ── Email sender ──────────────────────────────────────────────────────────────────
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

// ── Build digest email HTML ───────────────────────────────────────────────────────
type DigestItem = {
  id: string
  ticket_number: string
  kind: string
  title: string
  body: string | null
  created_at: string
}

const KIND_LABELS: Record<string, string> = {
  ticket_submitted: 'New Submissions',
  ticket_return_requested: 'Return Requests',
  ticket_returned: 'Tickets Returned',
  ticket_finalized: 'Tickets Finalized',
  ticket_deleted: 'Tickets Deleted',
}

function buildDigestHtml(firstName: string, items: DigestItem[]): string {
  // Group by kind
  const groups = new Map<string, DigestItem[]>()
  for (const item of items) {
    const list = groups.get(item.kind) ?? []
    list.push(item)
    groups.set(item.kind, list)
  }

  const sections = Array.from(groups.entries()).map(([kind, kindItems]) => {
    const label = KIND_LABELS[kind] ?? kind
    const rows = kindItems.map(i =>
      `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#222;">
          <strong>${i.ticket_number}</strong>
          ${i.body ? ` &mdash; ${i.body}` : ''}
        </td>
      </tr>`
    ).join('')
    return emailDigestSection(label, kindItems.length, rows)
  }).join('')

  return wrapEmailHtml(
    `<h2 style="margin:0 0 4px;font-size:20px;font-weight:700;">Daily Digest</h2>
     <p style="color:#6b7280;margin:0 0 16px;font-size:14px;">
       Hi ${firstName}, here's a summary of your ticket activity.
     </p>
     ${sections}
     ${emailDivider()}
     ${emailNote("You're receiving this daily digest from Tradewind Tickets. To switch to immediate alerts or turn off email, update your notification preferences in the app.")}`,
    { preheaderText: `${items.length} ticket update${items.length === 1 ? '' : 's'} today` }
  )
}

// ── Main handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Auth: only allow calls with the service role key (from pg_cron or dashboard scheduler)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || authHeader !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    const currentHour = getCTHour()
    console.log(`send-digest running at CT hour ${currentHour}`)

    // Find active users whose digest_hour matches the current CT hour
    const { data: recipients, error: rErr } = await admin
      .from('profiles')
      .select('id, email, first_name, digest_hour')
      .eq('digest_hour', currentHour)
      .eq('active', true)

    if (rErr) {
      console.error('Recipients fetch error:', rErr)
      return new Response('DB error', { status: 500, headers: corsHeaders })
    }

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, hour: currentHour }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let totalSent = 0

    for (const recipient of recipients) {
      // Fetch pending digest items for this recipient
      const { data: items, error: iErr } = await admin
        .from('notification_digest_queue')
        .select('*')
        .eq('recipient_id', recipient.id)
        .order('created_at', { ascending: true })

      if (iErr) {
        console.error(`Digest queue fetch error for ${recipient.id}:`, iErr)
        continue
      }

      if (!items || items.length === 0) continue

      // Build and send digest email
      const subject = items.length === 1
        ? `Daily Digest: ${items[0].title}`
        : `Daily Digest: ${items.length} ticket updates`

      await sendEmail(recipient.email, subject, buildDigestHtml(recipient.first_name, items as DigestItem[]))
      totalSent++

      // Remove sent items from queue
      const ids = items.map((i) => i.id)
      const { error: dErr } = await admin
        .from('notification_digest_queue')
        .delete()
        .in('id', ids)
      if (dErr) console.error(`Digest queue cleanup error for ${recipient.id}:`, dErr)
    }

    return new Response(
      JSON.stringify({ sent: totalSent, recipients: recipients.length, hour: currentHour }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-digest unhandled error:', err)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})
