import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://tradewind-tickets-claude.vercel.app'

const SIGNATURE_TOKEN_EXPIRY_HOURS = 48

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    // Verify caller is authenticated
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })

    const { ticket_id, customer_email } = await req.json() as {
      ticket_id: string
      customer_email: string
    }

    if (!ticket_id || !customer_email) {
      return new Response(
        JSON.stringify({ error: 'ticket_id and customer_email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch ticket + company name
    const { data: ticket, error: ticketErr } = await admin
      .from('tickets')
      .select('id, ticket_number, work_date, status, company_id, companies(name)')
      .eq('id', ticket_id)
      .single()

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (ticket.status === 'draft') {
      return new Response(
        JSON.stringify({ error: 'Cannot request signature on a draft ticket' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Invalidate any existing token for this ticket
    await admin.from('signature_tokens').delete().eq('ticket_id', ticket_id)

    // Create new token
    const expiresAt = new Date(
      Date.now() + SIGNATURE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString()

    const { data: tokenRow, error: tokenErr } = await admin
      .from('signature_tokens')
      .insert({ ticket_id, requested_by: user.id, expires_at: expiresAt })
      .select('token')
      .single()

    if (tokenErr || !tokenRow) throw tokenErr ?? new Error('Failed to create token')

    const signingUrl = `${APP_URL}/sign/${tokenRow.token}`
    const companyName = (ticket as { companies?: { name: string } }).companies?.name ?? 'Tradewind Controls'
    const workDate = new Date(ticket.work_date).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })

    if (!SENDGRID_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email not configured on this server' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:24px;">
    <span style="font-size:18px;font-weight:bold;color:#1d4ed8;">Tradewind Work Tickets</span>
  </div>
  <h2 style="margin:0 0 8px;">Signature Required</h2>
  <p style="color:#555;margin:0 0 16px;">
    ${companyName} has requested your signature for a completed field service ticket.
  </p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
    <tr>
      <td style="padding:5px 0;color:#888;width:100px;">Ticket</td>
      <td style="padding:5px 0;font-weight:bold;">${ticket.ticket_number}</td>
    </tr>
    <tr>
      <td style="padding:5px 0;color:#888;">Date</td>
      <td style="padding:5px 0;">${workDate}</td>
    </tr>
  </table>
  <div style="text-align:center;margin:28px 0;">
    <a href="${signingUrl}"
       style="background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 36px;
              border-radius:6px;font-weight:bold;font-size:15px;display:inline-block;">
      Sign Now
    </a>
  </div>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;margin:0;">
    This link expires in ${SIGNATURE_TOKEN_EXPIRY_HOURS} hours and can only be used once.
    If you did not expect this request, please contact ${companyName} directly.
  </p>
</body>
</html>`

    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: customer_email }] }],
        from: { email: SENDGRID_FROM, name: companyName },
        subject: `Please sign your service ticket ${ticket.ticket_number}`,
        content: [{ type: 'text/html', value: html }],
      }),
    })

    if (!sgRes.ok) {
      const body = await sgRes.text()
      console.error('SendGrid error:', body)
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
