#!/usr/bin/env bash
# apply-templates.sh
# Applies all branded email templates to your Supabase project via the Management API.
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN="sbp_xxxxxxxxxxxx"
#   bash apply-templates.sh
#
# Get your personal access token at:
#   https://supabase.com/dashboard/account/tokens

set -e

PROJECT_REF="rvczzujbzfsbljbajjgp"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

if [[ -z "$SUPABASE_ACCESS_TOKEN" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set."
  echo "Export it first:  export SUPABASE_ACCESS_TOKEN=\"sbp_your_token_here\""
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

read_file() {
  # Reads a file and escapes it for embedding in JSON
  python3 -c "import json,sys; print(json.dumps(open(sys.argv[1]).read()))" "$1"
}

CONFIRM_CONTENT=$(read_file "$DIR/confirm-signup.html")
INVITE_CONTENT=$(read_file "$DIR/invite-user.html")
MAGIC_CONTENT=$(read_file "$DIR/magic-link.html")
CHANGE_CONTENT=$(read_file "$DIR/change-email.html")
RECOVERY_CONTENT=$(read_file "$DIR/reset-password.html")

echo "Applying email templates to project ${PROJECT_REF}..."

curl -s -X PATCH "$API" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"mailer_templates_confirmation_subject\": \"Confirm your Tradewind Tickets account\",
    \"mailer_templates_confirmation_content\": ${CONFIRM_CONTENT},
    \"mailer_templates_invite_subject\": \"You've been invited to Tradewind Tickets\",
    \"mailer_templates_invite_content\": ${INVITE_CONTENT},
    \"mailer_templates_magic_link_subject\": \"Your Tradewind Tickets sign-in link\",
    \"mailer_templates_magic_link_content\": ${MAGIC_CONTENT},
    \"mailer_templates_email_change_subject\": \"Confirm your new email – Tradewind Tickets\",
    \"mailer_templates_email_change_content\": ${CHANGE_CONTENT},
    \"mailer_templates_recovery_subject\": \"Reset your Tradewind Tickets password\",
    \"mailer_templates_recovery_content\": ${RECOVERY_CONTENT}
  }" | python3 -m json.tool

echo ""
echo "Done! Check the Supabase dashboard under Authentication > Email Templates to verify."
