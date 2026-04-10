import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { formatTime } from '@/lib/timeUtils'
import type { ExportTicketData } from '@/lib/exportTicketPdf'

export function exportTicketXlsx(t: ExportTicketData): void {
  const rows: (string | number | null)[][] = []

  const gap = () => rows.push([])

  // ── Header info ───────────────────────────────────────────────────────────
  rows.push(['Tradewind Controls — Field Service Ticket'])
  gap()

  let workDateStr = '—'
  try { workDateStr = format(new Date(t.work_date), 'MMMM d, yyyy') } catch { /* ignore */ }

  const statusDisplay = t.status.charAt(0).toUpperCase() + t.status.slice(1)

  rows.push(['Ticket #', t.ticket_number, '', 'Date', workDateStr])
  rows.push(['Customer', t.customers.name, '', 'Status', statusDisplay])
  rows.push(['Requestor', t.requestor, '', 'Ticket Type', t.ticket_type ?? ''])
  rows.push(['Job #', t.job_number ?? '', '', 'Location', t.job_location ?? ''])
  gap()

  // ── Problem / description ─────────────────────────────────────────────────
  if (t.job_problem?.trim()) {
    rows.push(['PROBLEM / DESCRIPTION'])
    rows.push([t.job_problem])
    gap()
  }

  if (t.work_description?.trim()) {
    rows.push(['WORK PERFORMED'])
    rows.push([t.work_description])
    gap()
  }

  // ── Materials ─────────────────────────────────────────────────────────────
  if (t.ticket_materials.length > 0) {
    rows.push(['MATERIALS'])
    rows.push(['Qty', 'Part #', 'Description', 'Price Each', 'Total'])
    for (const m of t.ticket_materials) {
      rows.push([
        m.qty,
        m.part_number ?? '',
        m.description ?? '',
        m.price_each ?? '',
        m.price_each != null ? m.qty * m.price_each : '',
      ])
    }
    gap()
  }

  // ── Labor ─────────────────────────────────────────────────────────────────
  if (t.ticket_labor.length > 0) {
    const hasOT = t.ticket_labor.some(l => (l.ot_hours ?? 0) > 0)
    rows.push(['LABOR'])
    const laborHead: string[] = ['Name', 'Classification', 'Start', 'End', 'Total Hrs', 'Reg Hrs', 'Reg Rate', 'Reg $']
    if (hasOT) laborHead.push('OT Hrs', 'OT Rate', 'OT $')
    laborHead.push('Row Total')
    rows.push(laborHead)

    for (const l of t.ticket_labor) {
      const reg = (l.reg_rate ?? 0) * (l.reg_hours ?? 0)
      const ot  = (l.ot_rate  ?? 0) * (l.ot_hours  ?? 0)
      const row: (string | number | null)[] = [
        `${l.first_name} ${l.last_name}`,
        l.classification_snapshot ?? '',
        formatTime(l.start_time),
        formatTime(l.end_time),
        l.hours ?? 0,
        l.reg_hours ?? 0,
        l.reg_rate ?? 0,
        reg,
      ]
      if (hasOT) row.push(l.ot_hours ?? 0, l.ot_rate ?? 0, ot)
      row.push(reg + ot)
      rows.push(row)
    }
    gap()
  }

  // ── Equipment ─────────────────────────────────────────────────────────────
  if (t.equipment_enabled && t.ticket_equipment.length > 0) {
    rows.push(['EQUIPMENT'])
    rows.push(['Equip #', 'Hours', 'Rate', 'Total'])
    for (const e of t.ticket_equipment) {
      rows.push([
        e.equip_number ?? '',
        e.hours ?? 0,
        e.rate ?? 0,
        e.rate != null && e.hours != null ? e.rate * e.hours : '',
      ])
    }
    gap()
  }

  // ── Vehicles / Mileage ────────────────────────────────────────────────────
  if (t.ticket_vehicles.length > 0) {
    rows.push(['VEHICLES / MILEAGE'])
    rows.push(['Vehicle', 'Start Mi', 'End Mi', 'Total Miles', 'Rate / mi', 'Total'])
    for (const v of t.ticket_vehicles) {
      const miles = (v.mileage_end ?? 0) - (v.mileage_start ?? 0)
      rows.push([
        v.vehicle_label ?? '',
        v.mileage_start ?? '',
        v.mileage_end ?? '',
        miles,
        v.rate ?? '',
        v.rate != null ? miles * v.rate : '',
      ])
    }
    gap()
  }

  // ── Grand total ───────────────────────────────────────────────────────────
  rows.push(['', '', '', '', 'GRAND TOTAL', t.grand_total])
  gap()

  // ── Signatures ────────────────────────────────────────────────────────────
  const sigs = t.ticket_signatures ?? []
  const customerSig = sigs.find(s => s.kind === 'customer')
  const supervisorSig = sigs.find(s => s.kind === 'supervisor')

  if (customerSig || supervisorSig) {
    rows.push(['SIGNATURES'])
    if (customerSig) {
      let sigDateStr = '—'
      try { sigDateStr = format(new Date(customerSig.signed_at), 'MMM d, yyyy h:mm a') } catch { /* ignore */ }
      rows.push(['Customer', customerSig.signer_name ?? '', 'Date Signed', sigDateStr])
    }
    if (supervisorSig) {
      let sigDateStr = '—'
      try { sigDateStr = format(new Date(supervisorSig.signed_at), 'MMM d, yyyy h:mm a') } catch { /* ignore */ }
      rows.push(['Supervisor', supervisorSig.signer_name ?? '', 'Date Signed', sigDateStr])
    }
  }

  // ── Build workbook ────────────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(rows)

  ws['!cols'] = [
    { wch: 18 },  // A
    { wch: 28 },  // B
    { wch: 12 },  // C
    { wch: 20 },  // D
    { wch: 22 },  // E
    { wch: 14 },  // F
    { wch: 12 },  // G
    { wch: 12 },  // H
    { wch: 12 },  // I
    { wch: 12 },  // J
    { wch: 12 },  // K
    { wch: 14 },  // L
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ticket')
  XLSX.writeFile(wb, `${t.ticket_number}.xlsx`)
}
