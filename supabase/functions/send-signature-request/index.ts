import { createClient } from 'jsr:@supabase/supabase-js@2'
import { wrapEmailHtml, emailButton, emailInfoTable, emailDivider, emailNote } from '../_shared/email-template.ts'

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

    const html = wrapEmailHtml(
      `<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">Signature Required</h2>
       <p style="color:#555;margin:0 0 20px;">
         ${companyName} has requested your signature for a completed field service ticket.
       </p>
       ${emailInfoTable([
         { label: 'Ticket', value: ticket.ticket_number },
         { label: 'Date', value: workDate },
       ])}
       ${emailButton('Sign Now', signingUrl)}
       ${emailDivider()}
       ${emailNote(`This link expires in ${SIGNATURE_TOKEN_EXPIRY_HOURS} hours and can only be used once. If you did not expect this request, please contact ${companyName} directly.`)}`,
      { preheaderText: `${companyName} is requesting your signature for ticket ${ticket.ticket_number}` }
    )

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
