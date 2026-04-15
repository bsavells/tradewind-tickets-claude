import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { token } = await req.json() as { token: string }

    if (!token) {
      return new Response(JSON.stringify({ valid: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    })

    const { data: tokenRow, error } = await admin
      .from('signature_tokens')
      .select('id, ticket_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle()

    if (error) throw error

    if (!tokenRow) {
      return new Response(JSON.stringify({ valid: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (tokenRow.used_at) {
      return new Response(JSON.stringify({ valid: false, reason: 'used' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ valid: false, reason: 'expired' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch ticket summary to display on signing page
    const { data: ticket, error: ticketErr } = await admin
      .from('tickets')
      .select('ticket_number, work_date, work_description, companies(name)')
      .eq('id', tokenRow.ticket_id)
      .single()

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ valid: false, reason: 'not_found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        valid: true,
        ticket: {
          ticket_number: ticket.ticket_number,
          work_date: ticket.work_date,
          work_description: ticket.work_description,
          company_name:
            (ticket as { companies?: { name: string } }).companies?.name ??
            'Tradewind Controls',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
