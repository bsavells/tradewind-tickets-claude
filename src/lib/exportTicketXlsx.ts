// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – xlsx-js-style ships its own types inside /types
import XLSXStyle from 'xlsx-js-style'
import { format } from 'date-fns'
import { formatTime } from '@/lib/timeUtils'
import type { ExportTicketData } from '@/lib/exportTicketPdf'

// ── Column layout (53 cols, A=1.77, B-BA=8.77, matching original) ─────────
// We map logical zones to column indices (1-based):
//   [A]   col 1  – narrow left margin / index
//   [B-F] cols 2-6  – Qty / small left data
//   [G-O] cols 7-15 – Part# / Last Name
//   [P-AM] cols 16-39 – Description / main text
//   [AN-AT] cols 40-46 – Price Each / Rate / OT stuff
//   [AU-BA] cols 47-53 – Total $

const NUM_COLS = 53

// Column letter from 1-based index (1=A, 27=AA, etc.)
function col(n: number): string {
  let s = ''
  while (n > 0) {
    n--
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26)
  }
  return s
}

function ref(c: number, r: number) { return `${col(c)}${r}` }

// ── Style helpers ─────────────────────────────────────────────────────────────
const BLUE  = '0070C0'
const RED   = 'FF0000'
const YELLOW = 'FFFF00'
const BLACK  = '000000'
const WHITE  = 'FFFFFF'

type CellStyle = {
  font?: Record<string, unknown>
  fill?: Record<string, unknown>
  alignment?: Record<string, unknown>
  border?: Record<string, unknown>
  numFmt?: string
}

function thinBorder(color = '000000') {
  const side = { style: 'thin', color: { rgb: color } }
  return { top: side, bottom: side, left: side, right: side }
}

function outerBorder() { return thinBorder(BLACK) }

function s(font: Record<string,unknown> = {}, fill: Record<string,unknown> = {}, alignment: Record<string,unknown> = {}, border?: Record<string,unknown>): CellStyle {
  return {
    font: { name: 'Calibri', sz: 9, ...font },
    fill: Object.keys(fill).length ? { patternType: 'solid', ...fill } : { patternType: 'none' },
    alignment: { vertical: 'center', ...alignment },
    ...(border ? { border } : {}),
  }
}

const STYLE = {
  title: s({ bold: true, sz: 10, color: { rgb: WHITE } }, { fgColor: { rgb: '1F3864' } }, { horizontal: 'center', vertical: 'center' }),
  headerVal: s({ sz: 9, color: { rgb: BLUE } }, {}, { horizontal: 'center' }),
  headerLbl: s({ sz: 7, color: { rgb: BLACK } }, {}, { horizontal: 'center' }),
  sectionHdr: s({ bold: true, sz: 9, color: { rgb: BLACK } }, { fgColor: { rgb: 'D9E1F2' } }, { horizontal: 'center' }, outerBorder()),
  colHdr: s({ sz: 9, color: { rgb: BLACK } }, {}, { horizontal: 'center' }, outerBorder()),
  colHdrYellow: s({ sz: 9, color: { rgb: BLACK } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'center' }, outerBorder()),
  dataBlue: s({ sz: 9, color: { rgb: BLUE } }, {}, { horizontal: 'left' }, outerBorder()),
  dataBlueC: s({ sz: 9, color: { rgb: BLUE } }, {}, { horizontal: 'center' }, outerBorder()),
  dataBlueR: s({ sz: 9, color: { rgb: BLUE } }, {}, { horizontal: 'right' }, outerBorder()),
  calcRed: s({ sz: 9, color: { rgb: RED } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'center' }, outerBorder()),
  calcRedR: s({ sz: 9, color: { rgb: RED } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'right' }, outerBorder()),
  labelSmall: s({ sz: 8, color: { rgb: BLACK } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'right' }, outerBorder()),
  labelSmallC: s({ sz: 8, color: { rgb: BLACK } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'center' }, outerBorder()),
  atSign: s({ sz: 8, color: { rgb: BLACK } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'center' }, outerBorder()),
  descBlue: s({ sz: 8, color: { rgb: BLUE } }, {}, { horizontal: 'left', wrapText: true, vertical: 'top' }, outerBorder()),
  dateLbl: s({ sz: 9, color: { rgb: BLACK } }, {}, { horizontal: 'left' }),
  dateVal: s({ sz: 9, color: { rgb: BLUE } }, {}, { horizontal: 'center' }, outerBorder()),
  sigLbl: s({ sz: 8, color: { rgb: BLACK } }, {}, { horizontal: 'center' }),
  sigVal: s({ bold: true, sz: 14, color: { rgb: BLACK } }, {}, { horizontal: 'center' }),
  grandLbl: s({ sz: 9, color: { rgb: BLACK } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'center' }, outerBorder()),
  grandVal: s({ sz: 9, color: { rgb: RED } }, { fgColor: { rgb: YELLOW } }, { horizontal: 'center' }, outerBorder()),
  empty: s({}, {}, {}, outerBorder()),
  emptyYellow: s({}, { fgColor: { rgb: YELLOW } }, {}, outerBorder()),
}

// ── Worksheet helpers ─────────────────────────────────────────────────────────
type WS = Record<string, unknown>

function setCell(ws: WS, c: number, r: number, value: unknown, style: CellStyle) {
  const cellRef = ref(c, r)
  const t = typeof value === 'number' ? 'n' : 's'
  ws[cellRef] = { v: value ?? '', t, s: style }
}

function setMerge(ws: WS, c1: number, r1: number, c2: number, r2: number) {
  if (!ws['!merges']) ws['!merges'] = []
  ;(ws['!merges'] as unknown[]).push({
    s: { c: c1 - 1, r: r1 - 1 },
    e: { c: c2 - 1, r: r2 - 1 },
  })
}

function setRowHeight(ws: WS, r: number, h: number) {
  if (!ws['!rows']) ws['!rows'] = []
  ;(ws['!rows'] as unknown[])[r - 1] = { hpt: h }
}

// Fill a merged range with a border on every cell (so borders show on all sides)
function fillRange(ws: WS, c1: number, r1: number, c2: number, r2: number, style: CellStyle, value?: unknown) {
  for (let c = c1; c <= c2; c++) {
    for (let r = r1; r <= r2; r++) {
      const v = (c === c1 && r === r1) ? (value ?? '') : ''
      setCell(ws, c, r, v, style)
    }
  }
  if (c1 !== c2 || r1 !== r2) setMerge(ws, c1, r1, c2, r2)
}

// ── Main export ───────────────────────────────────────────────────────────────
export function exportTicketXlsx(t: ExportTicketData): void {
  const ws: WS = {}

  // Column widths: A=1.77, B-BA=8.77
  ws['!cols'] = Array.from({ length: NUM_COLS }, (_, i) =>
    ({ wch: i === 0 ? 1.78 : 8.78 })
  )

  let row = 1

  // ── Row 1: Title ────────────────────────────────────────────────────────────
  setRowHeight(ws, row, 20.55)
  fillRange(ws, 1, row, NUM_COLS, row, STYLE.title, 'Tradewind Controls | Work Ticket')
  row++

  // ── Rows 2-3: Header fields ─────────────────────────────────────────────────
  setRowHeight(ws, row, 14.55)
  // Customer
  fillRange(ws, 1, row,  9, row, STYLE.headerVal, t.customers.name)
  // Requestor
  fillRange(ws, 11, row, 19, row, STYLE.headerVal, t.requestor)
  // Job #
  fillRange(ws, 21, row, 29, row, STYLE.headerVal, t.job_number ?? '')
  // Job Location
  fillRange(ws, 31, row, 40, row, STYLE.headerVal, t.job_location ?? '')
  // Job Problem
  fillRange(ws, 42, row, NUM_COLS, row, STYLE.headerVal, t.job_problem ?? '')
  row++

  // Labels row
  setRowHeight(ws, row, 9.6)
  fillRange(ws, 1, row,  9, row, STYLE.headerLbl, 'Customer')
  fillRange(ws, 11, row, 19, row, STYLE.headerLbl, 'Requestor')
  fillRange(ws, 21, row, 29, row, STYLE.headerLbl, 'Job #')
  fillRange(ws, 31, row, 40, row, STYLE.headerLbl, 'Job Location')
  fillRange(ws, 42, row, NUM_COLS, row, STYLE.headerLbl, 'Job Problem/Description')
  row++

  // ── Row 4: Date + description label ─────────────────────────────────────────
  setRowHeight(ws, row, 17.1)
  setCell(ws, 1, row, 'Date', STYLE.dateLbl)
  let workDateStr = ''
  try { workDateStr = format(new Date(t.work_date), 'MM/dd/yyyy') } catch { /* ignore */ }
  fillRange(ws, 4, row, 14, row, STYLE.dateVal, workDateStr)
  fillRange(ws, 16, row, NUM_COLS, row, STYLE.dateLbl, 'Description of work performed:')
  row++

  // ── Rows 5-9: Work description ───────────────────────────────────────────────
  const descStartRow = row
  const descEndRow = row + 4
  for (let r = descStartRow; r <= descEndRow; r++) setRowHeight(ws, r, 13.5)
  fillRange(ws, 1, descStartRow, NUM_COLS, descEndRow, STYLE.descBlue, t.work_description ?? '')
  row = descEndRow + 1

  // ── Spacer ──────────────────────────────────────────────────────────────────
  setRowHeight(ws, row, 5.55); row++
  setRowHeight(ws, row, 5.55); row++

  // ── MATERIAL section ─────────────────────────────────────────────────────────
  fillRange(ws, 1, row, NUM_COLS, row, STYLE.sectionHdr, 'MATERIAL')
  row++

  // Column headers
  fillRange(ws, 1,  row, 6,  row, STYLE.colHdr, 'Qty')
  fillRange(ws, 7,  row, 15, row, STYLE.colHdr, 'Part Number')
  fillRange(ws, 16, row, 39, row, STYLE.colHdr, 'Description')
  fillRange(ws, 40, row, 46, row, STYLE.colHdrYellow, 'Price Each $')
  fillRange(ws, 47, row, NUM_COLS, row, STYLE.colHdrYellow, 'Total $')
  row++

  // Material rows (up to 16 slots like the original, dynamic fill)
  const matRows = t.ticket_materials.length || 0
  const MAT_SLOTS = Math.max(matRows, 4) // minimum 4 blank rows
  for (let i = 0; i < MAT_SLOTS; i++) {
    const m = t.ticket_materials[i]
    setRowHeight(ws, row, 13.2)
    fillRange(ws, 1,  row, 6,  row, STYLE.dataBlueC, m ? m.qty : null)
    fillRange(ws, 7,  row, 15, row, STYLE.dataBlue, m ? (m.part_number ?? '') : '')
    fillRange(ws, 16, row, 39, row, STYLE.dataBlue, m ? (m.description ?? '') : '')
    fillRange(ws, 40, row, 46, row, STYLE.calcRed, m?.price_each ?? null)
    fillRange(ws, 47, row, NUM_COLS, row, STYLE.calcRed,
      (m?.price_each != null) ? m.qty * m.price_each : null)
    row++
  }

  // Material subtotal row
  const matTotal = t.ticket_materials.reduce((s, m) =>
    s + (m.price_each != null ? m.qty * m.price_each : 0), 0)
  fillRange(ws, 1,  row, 46, row, STYLE.emptyYellow, '')
  fillRange(ws, 47, row, NUM_COLS, row, STYLE.calcRed, matTotal || null)
  row++

  // ── Spacer ──────────────────────────────────────────────────────────────────
  setRowHeight(ws, row, 5.55); row++
  setRowHeight(ws, row, 5.55); row++

  // ── LABOR section ────────────────────────────────────────────────────────────
  // Column headers
  fillRange(ws, 1,  row, 11, row, STYLE.colHdr, 'First Name')
  fillRange(ws, 12, row, 22, row, STYLE.colHdr, 'Last Name')
  fillRange(ws, 23, row, 29, row, STYLE.colHdr, 'Classification')
  fillRange(ws, 31, row, 41, row, STYLE.colHdr, 'Start Time')
  fillRange(ws, 43, row, NUM_COLS, row, STYLE.colHdr, 'End Time')
  row++

  for (const l of t.ticket_labor) {
    // Name row
    setRowHeight(ws, row, 13.35)
    fillRange(ws, 1,  row, 11, row, STYLE.dataBlue, l.first_name)
    fillRange(ws, 12, row, 22, row, STYLE.dataBlueC, l.last_name)
    fillRange(ws, 23, row, 29, row, STYLE.dataBlueC, l.classification_snapshot ?? '')
    // Start time
    fillRange(ws, 31, row, 36, row, STYLE.dataBlueC, formatTime(l.start_time))
    setCell(ws, 37, row, 'am', STYLE.colHdr)
    setCell(ws, 38, row, 'pm', STYLE.colHdr)
    // End time
    fillRange(ws, 43, row, 48, row, STYLE.dataBlueC, formatTime(l.end_time))
    setCell(ws, 49, row, 'am', STYLE.colHdr)
    setCell(ws, 50, row, 'pm', STYLE.colHdr)
    row++

    // Rate row
    setRowHeight(ws, row, 13.2)
    const reg = (l.reg_rate ?? 0) * (l.reg_hours ?? 0)
    const ot  = (l.ot_rate  ?? 0) * (l.ot_hours  ?? 0)
    const total = reg + ot

    // Reg Hrs section
    fillRange(ws, 1,  row, 5,  row, STYLE.labelSmall, 'Reg Hrs')
    fillRange(ws, 6,  row, 9,  row, STYLE.calcRed, l.reg_hours ?? 0)
    setCell(ws, 10, row, '@', STYLE.atSign)
    fillRange(ws, 11, row, 14, row, STYLE.calcRed, l.reg_rate ?? 0)
    setCell(ws, 15, row, '=', STYLE.atSign)
    fillRange(ws, 16, row, 21, row, STYLE.calcRed, reg)

    // OT Hrs section
    fillRange(ws, 22, row, 27, row, STYLE.labelSmall, 'OT Hrs')
    fillRange(ws, 28, row, 31, row, STYLE.calcRed, l.ot_hours ?? 0)
    setCell(ws, 32, row, '@', STYLE.atSign)
    fillRange(ws, 33, row, 36, row, STYLE.calcRed, l.ot_rate ?? 0)
    setCell(ws, 37, row, '=', STYLE.atSign)
    fillRange(ws, 38, row, 43, row, STYLE.calcRed, ot)

    // Total
    fillRange(ws, 44, row, 46, row, STYLE.labelSmallC, 'Total $')
    fillRange(ws, 47, row, NUM_COLS, row, STYLE.calcRed, total)
    row++
  }

  // If no labor rows, add a blank row
  if (t.ticket_labor.length === 0) {
    fillRange(ws, 1, row, NUM_COLS, row, STYLE.empty, '')
    row++
  }

  // ── Spacer ──────────────────────────────────────────────────────────────────
  setRowHeight(ws, row, 5.55); row++
  setRowHeight(ws, row, 5.55); row++

  // ── EQUIPMENT section ────────────────────────────────────────────────────────
  if (t.equipment_enabled) {
    // Two equipment pairs side-by-side (matching original layout)
    // Left: Equip# | Hrs | Rate$ | Total$
    // Right: Equip# | Hrs | Rate$ | Total$
    fillRange(ws, 1,  row, 7,  row, STYLE.colHdr, 'Equip #')
    fillRange(ws, 9,  row, 13, row, STYLE.colHdr, 'Hrs')
    fillRange(ws, 14, row, 18, row, STYLE.colHdrYellow, 'Rate $')
    fillRange(ws, 20, row, 25, row, STYLE.colHdrYellow, 'Total $')
    fillRange(ws, 29, row, 35, row, STYLE.colHdr, 'Equip #')
    fillRange(ws, 37, row, 40, row, STYLE.colHdr, 'Hrs')
    fillRange(ws, 42, row, 46, row, STYLE.colHdrYellow, 'Rate $')
    fillRange(ws, 48, row, NUM_COLS, row, STYLE.colHdrYellow, 'Total $')
    row++

    // Equipment slots: (1)&(2) on row 1, (3)&(4) on row 2
    const equip = t.ticket_equipment
    for (let pair = 0; pair < 2; pair++) {
      setRowHeight(ws, row, 13.2)
      const e1 = equip[pair * 2]
      const e2 = equip[pair * 2 + 1]
      const lbl1 = `(${pair * 2 + 1})`
      const lbl2 = `(${pair * 2 + 2})`

      fillRange(ws, 1,  row, 2,  row, STYLE.dataBlueC, lbl1)
      fillRange(ws, 3,  row, 7,  row, STYLE.dataBlue, e1?.equip_number ?? '')
      fillRange(ws, 9,  row, 13, row, STYLE.dataBlueC, e1?.hours ?? '')
      fillRange(ws, 14, row, 18, row, STYLE.calcRed, e1?.rate ?? '')
      fillRange(ws, 20, row, 25, row, STYLE.calcRed,
        e1?.rate != null && e1?.hours != null ? e1.rate * e1.hours : '')

      fillRange(ws, 29, row, 30, row, STYLE.dataBlueC, lbl2)
      fillRange(ws, 31, row, 35, row, STYLE.dataBlue, e2?.equip_number ?? '')
      fillRange(ws, 37, row, 40, row, STYLE.dataBlueC, e2?.hours ?? '')
      fillRange(ws, 42, row, 46, row, STYLE.calcRed, e2?.rate ?? '')
      fillRange(ws, 48, row, NUM_COLS, row, STYLE.calcRed,
        e2?.rate != null && e2?.hours != null ? e2.rate * e2.hours : '')
      row++
    }

    // Spacer
    setRowHeight(ws, row, 5.55); row++
    setRowHeight(ws, row, 5.55); row++
  }

  // ── VEHICLE / MILEAGE section ────────────────────────────────────────────────
  fillRange(ws, 1,  row, 15, row, STYLE.colHdr, 'Vehicle Type')
  fillRange(ws, 16, row, 24, row, STYLE.colHdr, 'Mileage Start')
  fillRange(ws, 25, row, 32, row, STYLE.colHdr, 'Mileage End')
  fillRange(ws, 34, row, 40, row, STYLE.colHdrYellow, 'Total Miles')
  fillRange(ws, 42, row, 46, row, STYLE.colHdrYellow, 'Rate $')
  fillRange(ws, 47, row, NUM_COLS, row, STYLE.colHdrYellow, 'Total Mlg $')
  row++

  const VEH_SLOTS = Math.max(t.ticket_vehicles.length, 2)
  for (let i = 0; i < VEH_SLOTS; i++) {
    const v = t.ticket_vehicles[i]
    setRowHeight(ws, row, 13.2)
    const idx = `(${i + 1})`
    fillRange(ws, 1,  row, 2,  row, STYLE.dataBlueC, idx)
    fillRange(ws, 3,  row, 15, row, STYLE.dataBlue, v?.vehicle_label ?? '')
    fillRange(ws, 16, row, 24, row, STYLE.dataBlueR, v?.mileage_start ?? '')
    fillRange(ws, 25, row, 32, row, STYLE.dataBlueR, v?.mileage_end ?? '')
    const miles = v ? ((v.mileage_end ?? 0) - (v.mileage_start ?? 0)) : ''
    fillRange(ws, 34, row, 40, row, STYLE.calcRedR, miles !== '' ? miles : '')
    fillRange(ws, 42, row, 46, row, STYLE.calcRedR, v?.rate ?? '')
    const mlgTotal = v?.rate != null && typeof miles === 'number' ? miles * v.rate : ''
    fillRange(ws, 47, row, NUM_COLS, row, STYLE.calcRedR, mlgTotal)
    row++
  }

  // ── Spacer ──────────────────────────────────────────────────────────────────
  setRowHeight(ws, row, 5.55); row++
  setRowHeight(ws, row, 5.55); row++

  // ── Grand Total ──────────────────────────────────────────────────────────────
  fillRange(ws, 1, row, 40, row, STYLE.empty, '')
  fillRange(ws, 41, row, 46, row, STYLE.grandLbl, 'Grand Total $')
  fillRange(ws, 47, row, NUM_COLS, row, STYLE.grandVal, t.grand_total)
  row++

  // ── Spacer ──────────────────────────────────────────────────────────────────
  setRowHeight(ws, row, 5.55); row++
  setRowHeight(ws, row, 5.55); row++

  // ── Signature area ───────────────────────────────────────────────────────────
  const sigs = t.ticket_signatures ?? []
  const custSig = sigs.find(s => s.kind === 'customer')
  const supSig  = sigs.find(s => s.kind === 'supervisor')

  // Signature value row
  setRowHeight(ws, row, 17.55)
  fillRange(ws, 1,  row, 14, row, STYLE.sigVal, custSig?.signer_name ?? '')
  fillRange(ws, 16, row, 21, row, STYLE.sigLbl, 'Date')
  let custDate = ''
  try { if (custSig) custDate = format(new Date(custSig.signed_at), 'MM/dd/yyyy') } catch { /* ignore */ }
  fillRange(ws, 22, row, 32, row, STYLE.dateVal, custDate)
  fillRange(ws, 24, row, 38, row, STYLE.sigVal, supSig?.signer_name ?? '')
  let supDate = ''
  try { if (supSig) supDate = format(new Date(supSig.signed_at), 'MM/dd/yyyy') } catch { /* ignore */ }
  fillRange(ws, 39, row, 46, row, STYLE.dateVal, supDate)
  row++

  // Signature label row
  setRowHeight(ws, row, 13.2)
  fillRange(ws, 1,  row, 14, row, STYLE.sigLbl, 'Customer Signature')
  fillRange(ws, 16, row, 21, row, STYLE.sigLbl, 'Date')
  fillRange(ws, 24, row, 38, row, STYLE.sigLbl, 'Supervisor Signature')
  fillRange(ws, 39, row, 46, row, STYLE.sigLbl, 'Date')
  row++

  // ── Worksheet range ──────────────────────────────────────────────────────────
  ws['!ref'] = `A1:${col(NUM_COLS)}${row - 1}`

  // ── Build and save ───────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb = (XLSXStyle as any).utils.book_new()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(XLSXStyle as any).utils.book_append_sheet(wb, ws, 'Work Ticket')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(XLSXStyle as any).writeFile(wb, `${t.ticket_number}.xlsx`)
}
