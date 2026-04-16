import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESET_REDIRECT = 'https://tradewind-tickets-claude.vercel.app/reset-password'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the caller using their JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: callerUser }, error: authError } = await callerClient.auth.getUser()
    if (authError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check caller is a non-readonly admin
    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role, is_readonly_admin, company_id')
      .eq('id', callerUser.id)
      .single()
    if (profileError || !callerProfile || callerProfile.role !== 'admin' || callerProfile.is_readonly_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json()
    const { action } = body

    // --- Create user ---
    if (action === 'create') {
      const { email, first_name, last_name, role, is_readonly_admin, classification_id, default_vehicle_id } = body

      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { first_name, last_name },
        redirectTo: RESET_REDIRECT,
      })
      if (inviteError) throw inviteError

      const { error: profileUpdateError } = await adminClient
        .from('profiles')
        .update({
          first_name,
          last_name,
          role,
          is_readonly_admin: role === 'admin' ? (is_readonly_admin ?? false) : false,
          classification_id: classification_id || null,
          default_vehicle_id: default_vehicle_id || null,
          company_id: callerProfile.company_id,
        })
        .eq('id', inviteData.user.id)
      if (profileUpdateError) throw profileUpdateError

      return new Response(JSON.stringify({ user: inviteData.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Deactivate user (sets active = false, preserves all data) ---
    if (action === 'delete') {
      const { user_id } = body

      const { error: deactivateError } = await adminClient
        .from('profiles')
        .update({ active: false })
        .eq('id', user_id)
      if (deactivateError) throw deactivateError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Reactivate user (sets active = true) ---
    if (action === 'reactivate') {
      const { user_id } = body

      const { error: reactivateError } = await adminClient
        .from('profiles')
        .update({ active: true })
        .eq('id', user_id)
      if (reactivateError) throw reactivateError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Permanently delete user (removes auth user + profile, nullifies ticket FKs) ---
    if (action === 'permanent_delete') {
      const { user_id } = body

      // Ensure the target user belongs to the same company
      const { data: target, error: targetErr } = await adminClient
        .from('profiles')
        .select('company_id')
        .eq('id', user_id)
        .single()
      if (targetErr || !target) throw new Error('User not found')
      if (target.company_id !== callerProfile.company_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Nullify ticket references so tickets are preserved
      await adminClient
        .from('tickets')
        .update({ created_by: null })
        .eq('created_by', user_id)

      // Nullify ticket_labor user_id references
      await adminClient
        .from('ticket_labor')
        .update({ user_id: null })
        .eq('user_id', user_id)

      // Remove notification prefs + notifications for this user
      await adminClient.from('notification_prefs').delete().eq('user_id', user_id)
      await adminClient.from('notifications').delete().eq('recipient_id', user_id)
      await adminClient.from('notification_digest_queue').delete().eq('recipient_id', user_id)

      // Delete the profile row
      const { error: profileDeleteErr } = await adminClient
        .from('profiles')
        .delete()
        .eq('id', user_id)
      if (profileDeleteErr) throw profileDeleteErr

      // Delete the auth user
      const { error: authDeleteErr } = await adminClient.auth.admin.deleteUser(user_id)
      if (authDeleteErr) throw authDeleteErr

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Send password reset ---
    if (action === 'send_reset') {
      const { email } = body
      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: RESET_REDIRECT,
      })
      if (resetError) throw resetError
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
