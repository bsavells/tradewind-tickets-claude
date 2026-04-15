import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    const { recipient_email, recipient_name } = await req.json() as {
      recipient_email: string
      recipient_name: string
    }

    if (!SENDGRID_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Email is not configured on this server.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:20px;">
    <span style="font-size:18px;font-weight:bold;color:#1d4ed8;">Tradewind Work Tickets</span>
  </div>
  <h2 style="margin:0 0 8px;">Test notification</h2>
  <p style="color:#555;margin:0 0 16px;">
    Hi ${recipient_name}, this is a test email confirming your notification settings are working correctly.
  </p>
  <p style="color:#555;margin:0 0 16px;">
    If you received this, email delivery is configured and active for your account.
  </p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
  <p style="color:#9ca3af;font-size:12px;margin:0;">
    Sent from Tradewind Work Tickets notification settings.
  </p>
</body>
</html>`

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipient_email }] }],
        from: { email: SENDGRID_FROM, name: 'Tradewind Work Tickets' },
        subject: 'Test notification from Tradewind Work Tickets',
        content: [{ type: 'text/html', value: html }],
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('SendGrid error:', res.status, body)
      return new Response(
        JSON.stringify({ error: 'Failed to send email. Check SendGrid configuration.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-test-email unhandled error:', err)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})
