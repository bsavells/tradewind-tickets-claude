-- Allow signatures to be collected at any ticket status (including draft).
-- Previously restricted to non-draft; techs need to be able to sign in the
-- field before submitting the ticket.

drop policy if exists "ticket_signatures write" on ticket_signatures;

create policy "ticket_signatures write" on ticket_signatures
  for all using (
    exists (
      select 1 from tickets t
      where t.id = ticket_id
        and (
          t.created_by = auth.uid()
          or (is_writable_admin() and t.company_id = auth_company_id())
        )
    )
  );
