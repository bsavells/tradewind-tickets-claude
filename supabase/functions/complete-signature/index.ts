import { createClient } from 'jsr:@supabase/supabase-js@2'
import { wrapEmailHtml, emailDivider, emailNote } from '../_shared/email-template.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY') ?? ''
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM_EMAIL') ?? 'noreply@tradewindcontrols.com'

const BUCKET = 'ticket-signatures'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { token, signer_name, signature_png_base64 } = await req.json() as {
      token: string
      signer_name: string
      signature_png_base64: string
    }

    if (!token || !signer_name || !signature_png_base64) {
      return new Response(
        JSON.stringify({ error: 'token, signer_name, and signature_png_base64 are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    // Validate token
    const { data: tokenRow, error: tokenErr } = await admin
      .from('signature_tokens')
      .select('id, ticket_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (tokenErr) throw tokenErr
    if (
      !tokenRow ||
      tokenRow.used_at ||
      new Date(tokenRow.expires_at) < new Date()
    ) {
      return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ticketId = tokenRow.ticket_id

    // Fetch ticket + company details
    const { data: ticket, error: ticketErr2 } = await admin
      .from('tickets')
      .select('id, ticket_number, company_id, created_by, companies(name)')
      .eq('id', ticketId)
      .single()
    if (ticketErr2 || !ticket) throw ticketErr2 ?? new Error('Ticket not found')

    // Upload signature image
    const imageBytes = Uint8Array.from(atob(signature_png_base64), c => c.charCodeAt(0))
    const path = `${ticket.company_id}/${ticketId}/customer.png`

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(path, imageBytes, { contentType: 'image/png', upsert: true })
    if (uploadErr) throw uploadErr

    // Upsert ticket_signatures row (DB trigger flips tickets.is_signed = true)
    const { error: sigErr } = await admin
      .from('ticket_signatures')
      .upsert(
        {
          ticket_id: ticketId,
          kind: 'customer',
          signer_name,
          signed_at: new Date().toISOString(),
          image_url: path,
        },
        { onConflict: 'ticket_id,kind' }
      )
    if (sigErr) throw sigErr

    // Mark token as used (single-use)
    await admin
      .from('signature_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRow.id)

    // Notify: tech (ticket creator) + all active admins in the company
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, first_name, role')
      .eq('company_id', ticket.company_id)
      .eq('active', true)

    const companyName =
      (ticket as { companies?: { name: string } }).companies?.name ?? 'Tradewind Controls'

    const recipients = (profiles ?? []).filter(
      p => p.role === 'admin' || p.id === ticket.created_by
    )

    // In-app notifications (always) — uses `kind` + `company_id` as required by schema
    if (recipients.length > 0) {
      await admin.from('notifications').insert(
        recipients.map(p => ({
          recipient_id: p.id,
          ticket_id: ticketId,
          company_id: ticket.company_id,
          kind: 'ticket_signed',
          title: `Ticket ${ticket.ticket_number} signed`,
          body: `Signed by ${signer_name}`,
        }))
      )
    }

    // Email notifications (respects on_signed pref)
    if (SENDGRID_API_KEY && recipients.length > 0) {
      await Promise.allSettled(
        recipients.map(async (profile) => {
          const { data: pref } = await admin
            .from('notification_prefs')
            .select('email_frequency')
            .eq('user_id', profile.id)
            .eq('key', 'on_signed')
            .maybeSingle()

          const frequency = pref?.email_frequency ?? 'immediate'
          if (frequency === 'off') return

          if (frequency === 'digest') {
            // notification_digest_queue uses kind/ticket_number/company_id
            await admin.from('notification_digest_queue').insert({
              recipient_id: profile.id,
              company_id: ticket.company_id,
              ticket_number: ticket.ticket_number,
              kind: 'ticket_signed',
              title: `Ticket ${ticket.ticket_number} signed`,
              body: `Signed by ${signer_name}`,
            })
            return
          }

          // immediate
          const html = wrapEmailHtml(
            `<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">Ticket Signed</h2>
             <p style="color:#555;margin:0 0 16px;">
               Hi ${profile.first_name}, ticket <strong>${ticket.ticket_number}</strong>
               has been signed by <strong>${signer_name}</strong>.
             </p>
             ${emailDivider()}
             ${emailNote("You're receiving this because you have notifications enabled in Tradewind Tickets.")}`,
            { preheaderText: `Ticket ${ticket.ticket_number} signed by ${signer_name}` }
          )

          await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SENDGRID_API_KEY}`,
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: profile.email }] }],
              from: { email: SENDGRID_FROM, name: companyName },
              subject: `Ticket ${ticket.ticket_number} has been signed`,
              content: [{ type: 'text/html', value: html }],
            }),
          })
        })
      )
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
