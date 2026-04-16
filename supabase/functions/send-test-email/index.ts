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

    const html = wrapEmailHtml(
      `<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">Test Notification</h2>
       <p style="color:#555;margin:0 0 16px;">
         Hi ${recipient_name}, this is a test email confirming your notification settings are working correctly.
       </p>
       <p style="color:#555;margin:0 0 16px;">
         If you received this, email delivery is configured and active for your account.
       </p>
       ${emailDivider()}
       ${emailNote('Sent from Tradewind Tickets notification settings.')}`,
      { preheaderText: 'Test email — your notifications are working.' }
    )

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
