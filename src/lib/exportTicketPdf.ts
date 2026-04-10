import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { formatTime } from '@/lib/timeUtils'
import logoUrl from '@/assets/tc_horizontal_with_cerebus.png'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ExportTicketData {
  id: string
  ticket_number: string
  status: string
  work_date: string
  ticket_type: string | null
  requestor: string
  job_number: string | null
  job_location: string | null
  job_problem: string | null
  work_description: string | null
  equipment_enabled: boolean
  grand_total: number
  customers: { name: string }
  ticket_materials: {
    id: string
    qty: number
    part_number: string | null
    description: string | null
    price_each: number | null
  }[]
  ticket_labor: {
    id: string
    first_name: string
    last_name: string
    classification_snapshot: string | null
    start_time: string | null
    end_time: string | null
    hours: number | null
    reg_hours: number | null
    ot_hours: number | null
    reg_rate: number | null
    ot_rate: number | null
  }[]
  ticket_vehicles: {
    id: string
    vehicle_label: string | null
    mileage_start: number | null
    mileage_end: number | null
    rate: number | null
  }[]
  ticket_equipment: {
    id: string
    equip_number: string | null
    hours: number | null
    rate: number | null
  }[]
  ticket_signatures?: {
    kind: string
    signer_name: string | null
    signed_at: string
  }[]
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_MARGIN = 14
const SECTION_GAP = 5
const TITLE_COLOR: [number, number, number] = [29, 78, 216]
const ACCENT: [number, number, number] = [29, 78, 216]
const HEADER_H = 22   // header height in mm

// ── Helpers ───────────────────────────────────────────────────────────────────
function getY(doc: jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable?.finalY ?? PAGE_MARGIN
}

function checkPageBreak(doc: jsPDF, y: number, needed = 30): number {
  const pageH = doc.internal.pageSize.getHeight()
  if (y + needed > pageH - PAGE_MARGIN) {
    doc.addPage()
    return PAGE_MARGIN
  }
  return y
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  y = checkPageBreak(doc, y, 15)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...TITLE_COLOR)
  doc.text(title.toUpperCase(), PAGE_MARGIN, y)
  doc.setDrawColor(...TITLE_COLOR)
  doc.setLineWidth(0.3)
  doc.line(PAGE_MARGIN, y + 1.2, 216 - PAGE_MARGIN - 0.5, y + 1.2)
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  return y + 5
}

function fmt$(n: number | null): string {
  return n != null ? `$${n.toFixed(2)}` : '—'
}

// ── Main export function ──────────────────────────────────────────────────────
export function exportTicketPdf(t: ExportTicketData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()

  // ── Header: white background, logo left, ticket info right ─────────────────
  // White fill + bottom accent line
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageW, HEADER_H, 'F')
  doc.setDrawColor(...ACCENT)
  doc.setLineWidth(0.6)
  doc.line(0, HEADER_H, pageW, HEADER_H)

  // Logo — use exact aspect ratio, capped at 95mm wide so ticket number has room
  const logoAspect = 598 / 84         // exact pixel ratio from source image (7.12)
  const logoW = 95                    // mm — leaves ~85mm for ticket number area
  const logoH = logoW / logoAspect    // ~13.3 mm tall
  const logoY = (HEADER_H - logoH) / 2  // vertically centered in header
  doc.addImage(logoUrl, 'PNG', PAGE_MARGIN, logoY, logoW, logoH)

  // Ticket number (right-aligned, bold blue)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...ACCENT)
  doc.text(t.ticket_number, pageW - PAGE_MARGIN, HEADER_H / 2 - 1, { align: 'right' })

  // "Field Service Ticket" label below ticket number
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('Field Service Ticket', pageW - PAGE_MARGIN, HEADER_H / 2 + 4, { align: 'right' })

  let y = HEADER_H + 6

  // ── Job info two-column grid ────────────────────────────────────────────────
  let workDateStr = '—'
  try { workDateStr = format(new Date(t.work_date), 'MMMM d, yyyy') } catch { /* ignore */ }

  const statusDisplay = t.status.charAt(0).toUpperCase() + t.status.slice(1)

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    body: [
      ['Date', workDateStr, 'Ticket Type', t.ticket_type ?? '—'],
      ['Customer', t.customers.name, 'Status', statusDisplay],
      ['Requestor', t.requestor, 'Job #', t.job_number ?? '—'],
      ['Location', t.job_location ?? '—', '', ''],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.8, textColor: [0, 0, 0] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22, textColor: [80, 80, 80] },
      1: { cellWidth: 72 },
      2: { fontStyle: 'bold', cellWidth: 22, textColor: [80, 80, 80] },
      3: { cellWidth: 72 },
    },
  })
  y = getY(doc) + SECTION_GAP

  // ── Problem / description ───────────────────────────────────────────────────
  if (t.job_problem?.trim()) {
    y = sectionTitle(doc, 'Problem / Description', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(t.job_problem, pageW - PAGE_MARGIN * 2)
    y = checkPageBreak(doc, y, lines.length * 4.5 + 4)
    doc.text(lines, PAGE_MARGIN, y)
    y += lines.length * 4.5 + SECTION_GAP
  }

  if (t.work_description?.trim()) {
    y = sectionTitle(doc, 'Work Performed', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(t.work_description, pageW - PAGE_MARGIN * 2)
    y = checkPageBreak(doc, y, lines.length * 4.5 + 4)
    doc.text(lines, PAGE_MARGIN, y)
    y += lines.length * 4.5 + SECTION_GAP
  }

  // ── Materials ───────────────────────────────────────────────────────────────
  if (t.ticket_materials.length > 0) {
    y = sectionTitle(doc, 'Materials', y)
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [['Qty', 'Part #', 'Description', 'Price Each', 'Total']],
      body: t.ticket_materials.map(m => [
        m.qty,
        m.part_number ?? '—',
        m.description ?? '—',
        fmt$(m.price_each),
        m.price_each != null ? fmt$(m.qty * m.price_each) : '—',
      ]),
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255] as [number, number, number], fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
      },
    })
    y = getY(doc) + SECTION_GAP
  }

  // ── Labor ───────────────────────────────────────────────────────────────────
  if (t.ticket_labor.length > 0) {
    const hasOT = t.ticket_labor.some(l => (l.ot_hours ?? 0) > 0)
    y = sectionTitle(doc, 'Labor', y)

    const head = hasOT
      ? [['Name', 'Classification', 'Start', 'End', 'Hrs', 'Reg Hrs', 'Reg Rate', 'Reg $', 'OT Hrs', 'OT Rate', 'OT $', 'Total']]
      : [['Name', 'Classification', 'Start', 'End', 'Hrs', 'Reg Hrs', 'Reg Rate', 'Reg $', 'Total']]

    const body = t.ticket_labor.map(l => {
      const reg = ((l.reg_rate ?? 0) * (l.reg_hours ?? 0))
      const ot  = ((l.ot_rate  ?? 0) * (l.ot_hours  ?? 0))
      const total = reg + ot
      const row: (string | number)[] = [
        `${l.first_name} ${l.last_name}`,
        l.classification_snapshot ?? '—',
        formatTime(l.start_time),
        formatTime(l.end_time),
        (l.hours ?? 0).toFixed(2),
        (l.reg_hours ?? 0).toFixed(2),
        fmt$(l.reg_rate),
        fmt$(reg),
      ]
      if (hasOT) row.push(
        (l.ot_hours ?? 0).toFixed(2),
        fmt$(l.ot_rate),
        fmt$(ot),
      )
      row.push(fmt$(total))
      return row
    })

    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head,
      body,
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255] as [number, number, number], fontSize: 7, fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 1.5 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index >= 5) {
          data.cell.styles.halign = 'right'
        }
      },
    })
    y = getY(doc) + SECTION_GAP
  }

  // ── Equipment ───────────────────────────────────────────────────────────────
  if (t.equipment_enabled && t.ticket_equipment.length > 0) {
    y = sectionTitle(doc, 'Equipment', y)
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [['Equip #', 'Hours', 'Rate', 'Total']],
      body: t.ticket_equipment.map(e => [
        e.equip_number ?? '—',
        (e.hours ?? 0).toFixed(2),
        fmt$(e.rate),
        e.rate != null && e.hours != null ? fmt$(e.rate * e.hours) : '—',
      ]),
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255] as [number, number, number], fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    })
    y = getY(doc) + SECTION_GAP
  }

  // ── Vehicles / Mileage ──────────────────────────────────────────────────────
  if (t.ticket_vehicles.length > 0) {
    y = sectionTitle(doc, 'Vehicles / Mileage', y)
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      head: [['Vehicle', 'Start Mi', 'End Mi', 'Total Miles', 'Rate / mi', 'Total']],
      body: t.ticket_vehicles.map(v => {
        const miles = ((v.mileage_end ?? 0) - (v.mileage_start ?? 0))
        return [
          v.vehicle_label ?? '—',
          v.mileage_start ?? '—',
          v.mileage_end ?? '—',
          miles.toFixed(1),
          v.rate != null ? `$${v.rate.toFixed(4)}` : '—',
          v.rate != null ? fmt$(miles * v.rate) : '—',
        ]
      }),
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255] as [number, number, number], fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    })
    y = getY(doc) + SECTION_GAP
  }

  // ── Grand total ─────────────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  const gtValue = fmt$(t.grand_total)
  doc.text('Grand Total:', pageW - PAGE_MARGIN - 50, y + 5)
  doc.text(gtValue, pageW - PAGE_MARGIN, y + 5, { align: 'right' })
  doc.setLineWidth(0.4)
  doc.line(pageW - PAGE_MARGIN - 54, y + 7, pageW - PAGE_MARGIN, y + 7)
  y += 14

  // ── Signatures ──────────────────────────────────────────────────────────────
  const sigs = t.ticket_signatures ?? []
  const customerSig = sigs.find(s => s.kind === 'customer')
  const supervisorSig = sigs.find(s => s.kind === 'supervisor')

  if (customerSig || supervisorSig) {
    y = sectionTitle(doc, 'Signatures', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    if (customerSig) {
      let sigDateStr = '—'
      try { sigDateStr = format(new Date(customerSig.signed_at), 'MMM d, yyyy h:mm a') } catch { /* ignore */ }
      doc.setFont('helvetica', 'bold')
      doc.text('Customer:', PAGE_MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.text(customerSig.signer_name ?? '', PAGE_MARGIN + 22, y)
      doc.text(sigDateStr, pageW - PAGE_MARGIN, y, { align: 'right' })
      y += 6
    }
    if (supervisorSig) {
      let sigDateStr = '—'
      try { sigDateStr = format(new Date(supervisorSig.signed_at), 'MMM d, yyyy h:mm a') } catch { /* ignore */ }
      doc.setFont('helvetica', 'bold')
      doc.text('Supervisor:', PAGE_MARGIN, y)
      doc.setFont('helvetica', 'normal')
      doc.text(supervisorSig.signer_name ?? '', PAGE_MARGIN + 24, y)
      doc.text(sigDateStr, pageW - PAGE_MARGIN, y, { align: 'right' })
    }
  }

  // ── Footer on every page ─────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `${t.ticket_number} · Page ${i} of ${pageCount}`,
      pageW - PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 6,
      { align: 'right' },
    )
  }

  doc.save(`${t.ticket_number}.pdf`)
}
