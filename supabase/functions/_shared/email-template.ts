// ── Shared branded email template for Tradewind Tickets ─────────────────────
//
// Design tokens derived from https://www.tradewind.groupm7.io/
//
// Usage:
//   import { wrapEmailHtml, emailButton, emailDivider } from '../_shared/email-template.ts'
//   const html = wrapEmailHtml(`<h2>Title</h2><p>Body</p>`)

const BLUE = '#1d90ff'
const NAVY = '#0a1e3d'
const CYAN = '#00d4ff'
const DARK = '#222222'
const BODY_TEXT = '#555555'
const MUTED = '#9ca3af'
const BG = '#edeff3'
const DIVIDER = '#e5e7eb'
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// ── Main wrapper ────────────────────────────────────────────────────────────
export function wrapEmailHtml(content: string, options?: {
  preheaderText?: string
}): string {
  const preheader = options?.preheaderText
    ? `<span style="display:none;font-size:1px;color:${BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${options.preheaderText}</span>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Tradewind Tickets</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  ${preheader}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

          <!-- Gradient accent bar -->
          <tr>
            <td style="height:4px;background:${BLUE};background:linear-gradient(to right,${NAVY},${CYAN},${BLUE});border-radius:8px 8px 0 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="background:#ffffff;padding:28px 36px 20px;text-align:center;">
              <span style="font-size:20px;font-weight:800;letter-spacing:1.5px;color:${NAVY};text-transform:uppercase;">TRADEWIND</span>
              <span style="font-size:20px;font-weight:300;letter-spacing:1.5px;color:${BLUE};text-transform:uppercase;margin-left:4px;">TICKETS</span>
            </td>
          </tr>

          <!-- Card body -->
          <tr>
            <td style="background:#ffffff;padding:0 36px 36px;color:${DARK};font-size:15px;line-height:1.6;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${BODY_TEXT};">Tradewind Controls</p>
              <p style="margin:0 0 12px;font-size:12px;color:${MUTED};">Automation, Measurement, &amp; SCADA</p>
              <p style="margin:0;font-size:11px;color:${MUTED};">&copy; ${new Date().getFullYear()} Tradewind Controls. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── CTA button (with VML fallback for Outlook) ──────────────────────────────
export function emailButton(label: string, href: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td align="center" style="padding:28px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}"
        style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" strokecolor="${BLUE}" fillcolor="${BLUE}">
        <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}"
         style="display:inline-block;background:${BLUE};color:#ffffff;font-size:15px;
                font-weight:600;text-decoration:none;padding:13px 36px;
                border-radius:8px;letter-spacing:0.2px;">
        ${label}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`
}

// ── Info table (label/value pairs like Ticket, Date) ────────────────────────
export function emailInfoTable(rows: Array<{ label: string; value: string }>): string {
  const rowsHtml = rows.map(r =>
    `<tr>
      <td style="padding:6px 0;color:${MUTED};width:100px;font-size:14px;">${r.label}</td>
      <td style="padding:6px 0;font-weight:600;color:${DARK};font-size:14px;">${r.value}</td>
    </tr>`
  ).join('')

  return `<table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
  ${rowsHtml}
</table>`
}

// ── Digest section (grouped ticket list) ────────────────────────────────────
export function emailDigestSection(label: string, count: number, rowsHtml: string): string {
  return `<div style="margin:20px 0 0;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td style="padding:8px 12px;background:#eef5ff;border-radius:6px;font-size:13px;
                 font-weight:700;color:${BLUE};text-transform:uppercase;letter-spacing:0.05em;">
        ${label} (${count})
      </td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
    ${rowsHtml}
  </table>
</div>`
}

// ── Horizontal divider ──────────────────────────────────────────────────────
export function emailDivider(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td style="border-top:1px solid ${DIVIDER};padding-top:20px;"></td></tr>
</table>`
}

// ── Muted note (small gray text below divider) ──────────────────────────────
export function emailNote(text: string): string {
  return `<p style="margin:0;font-size:12px;color:${MUTED};line-height:1.5;">${text}</p>`
}
