// SPDX-License-Identifier: GPL-3.0-or-later
// nco-dwg-reader — DWG → DXF ბრაუზერში (ai.nco.ge, N Construction). Copyright (C) 2026 Giorgi Datuashvili.
// იყენებს @mlightcad/libredwg-web (GNU LibreDWG, GPL-3.0). This program comes with ABSOLUTELY NO WARRANTY; see LICENSE.
/**
 * LibreDWG-ის (libredwg-web) DwgDatabase → მინიმალური ASCII DXF ტექსტი, რომელსაც `parseDxf` კითხულობს.
 * ასე DWG-ს მთელი იმპორტის კონვეიერი (ფენები, ბლოკები, კარები, ოთახები) უცვლელად ემსახურება.
 * კუთხეები DWG-ში რადიანებშია → DXF-ში გრადუსები. OCS (extrusion z<0, სარკისებური ობიექტები) → WCS.
 * SPLINE/ELLIPSE პოლილაინად იშლება. HATCH/DIMENSION/WIPEOUT/IMAGE გამოტოვებულია (ოთახების ძებნას არ სჭირდება).
 * ტიპები განზრახ „რბილია“ (any) — ფაილი ბიბლიოთეკის ტიპებზე არ არის მიბმული.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Pt = { x: number; y: number }
const DEG = 180 / Math.PI
const fin = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const f = (v: number) => (Math.abs(v) < 1e-12 ? '0' : String(+v.toFixed(6)))
const clean = (s: unknown) => String(s ?? '').replace(/\r?\n/g, '\\P').replace(/\r/g, '')

/** OCS → WCS მხოლოდ ყველაზე ხშირი შემთხვევისთვის: extrusion (0,0,-1) ⇒ x-ის სარკე. */
const mirrored = (e: any) => fin(e?.extrusionDirection?.z, 1) < 0

function bspline(ctrl: Pt[], degree: number, knots: number[], weights?: number[]): Pt[] {
  const n = ctrl.length
  const p = Math.max(1, Math.min(degree | 0, n - 1))
  if (n < 2 || knots.length !== n + p + 1) return ctrl
  const w = weights && weights.length === n ? weights : null
  const t0 = knots[p], t1 = knots[n]
  if (!(t1 > t0)) return ctrl
  const steps = Math.min(400, Math.max(8, n * 6))
  const out: Pt[] = []
  for (let s = 0; s <= steps; s++) {
    const t = s === steps ? t1 - 1e-9 * (t1 - t0) : t0 + ((t1 - t0) * s) / steps
    let k = p
    while (k < n - 1 && t >= knots[k + 1]) k++
    // de Boor (რაციონალურიც — ერთგვაროვან კოორდინატებში)
    const d: { x: number; y: number; w: number }[] = []
    for (let j = 0; j <= p; j++) { const c = ctrl[k - p + j], ww = w ? w[k - p + j] : 1; d.push({ x: c.x * ww, y: c.y * ww, w: ww }) }
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const i = k - p + j, den = knots[i + p - r + 1] - knots[i]
      const a = den === 0 ? 0 : (t - knots[i]) / den
      d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w }
    }
    const q = d[p]
    out.push({ x: q.x / (q.w || 1), y: q.y / (q.w || 1) })
  }
  return out
}

function ellipsePts(e: any): Pt[] {
  const c = e.center ?? { x: 0, y: 0 }, m = e.majorAxisEndPoint ?? { x: 1, y: 0 }
  const r = fin(e.axisRatio, 1)
  let a0 = fin(e.startAngle), a1 = fin(e.endAngle, Math.PI * 2)
  while (a1 <= a0) a1 += Math.PI * 2
  const n = Math.max(8, Math.ceil((a1 - a0) / 0.2))
  const mx = fin(m.x), my = fin(m.y), nx = -my * r, ny = mx * r
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n, cs = Math.cos(t), sn = Math.sin(t); out.push({ x: fin(c.x) + mx * cs + nx * sn, y: fin(c.y) + my * cs + ny * sn }) }
  if (mirrored(e)) for (const p of out) p.x = -p.x
  return out
}

export interface DwgToDxfStats { entities: number; blocks: number; skipped: Record<string, number> }

export function dwgDbToDxf(db: any): { text: string; stats: DwgToDxfStats } {
  const L: string[] = []
  const skipped: Record<string, number> = {}
  let count = 0
  const g = (c: number, v: string | number) => { L.push(String(c), typeof v === 'number' ? f(v) : v) }
  const head = (type: string, e: any) => { g(0, type); g(8, String(e?.layer || '0')) }
  const lw = (e: any, pts: { x: number; y: number; b?: number }[], closed: boolean) => {
    if (pts.length < 2) return
    head('LWPOLYLINE', e); g(90, pts.length); g(70, closed ? 1 : 0)
    for (const p of pts) { g(10, p.x); g(20, p.y); if (p.b) g(42, p.b) }
    count++
  }

  const ent = (e: any) => {
    if (!e || typeof e !== 'object' || e.isVisible === false) return
    const mir = mirrored(e)
    const X = (v: unknown) => (mir ? -fin(v) : fin(v))
    switch (e.type) {
      case 'LINE':
        head('LINE', e); g(10, fin(e.startPoint?.x)); g(20, fin(e.startPoint?.y)); g(11, fin(e.endPoint?.x)); g(21, fin(e.endPoint?.y)); count++
        break
      case 'LWPOLYLINE': {
        const vs = (e.vertices ?? []).map((v: any) => ({ x: X(v.x), y: fin(v.y), b: mir ? -fin(v.bulge) : fin(v.bulge) }))
        lw(e, vs, (fin(e.flag) & 1) === 1 || (fin(e.flag) & 512) === 512)
        break
      }
      case 'POLYLINE2D': {
        const fl = fin(e.flag)
        if (fl & (16 | 64)) { skipped[e.type + '(mesh)'] = (skipped[e.type + '(mesh)'] ?? 0) + 1; break }
        const vs = (e.vertices ?? []).filter((v: any) => !(fin(v.flag) & 16)).map((v: any) => ({ x: X(v.x), y: fin(v.y), b: mir ? -fin(v.bulge) : fin(v.bulge) }))
        lw(e, vs, (fl & 1) === 1)
        break
      }
      case 'POLYLINE3D': {
        const fl = fin(e.flag)
        const vs = (e.vertices ?? []).filter((v: any) => !(fin(v.flag) & 16)).map((v: any) => ({ x: fin(v.x), y: fin(v.y) }))
        lw(e, vs, (fl & 1) === 1)
        break
      }
      case 'ARC': {
        let s = fin(e.startAngle), en = fin(e.endAngle)
        if (mir) { const s2 = Math.PI - en, e2 = Math.PI - s; s = s2; en = e2 }
        head('ARC', e); g(10, X(e.center?.x)); g(20, fin(e.center?.y)); g(40, fin(e.radius)); g(50, s * DEG); g(51, en * DEG); count++
        break
      }
      case 'CIRCLE':
        head('CIRCLE', e); g(10, X(e.center?.x)); g(20, fin(e.center?.y)); g(40, fin(e.radius)); count++
        break
      case 'ELLIPSE': lw(e, ellipsePts(e), false); break
      case 'SPLINE': {
        const fit = (e.fitPoints ?? []) as Pt[]
        const ctrl = (e.controlPoints ?? []) as Pt[]
        const pts = ctrl.length >= 2 ? bspline(ctrl.map(p => ({ x: fin(p.x), y: fin(p.y) })), fin(e.degree, 3), (e.knots ?? []).map((k: unknown) => fin(k)), e.weights) : fit.map(p => ({ x: fin(p.x), y: fin(p.y) }))
        lw(e, pts, (fin(e.flag) & 1) === 1)
        break
      }
      case 'SOLID': case 'TRACE': case '3DFACE': {
        const cs = [e.corner1, e.corner2, e.corner3, e.corner4 ?? e.corner3]
        if (cs.some(c => !c)) break
        head(e.type === '3DFACE' ? '3DFACE' : 'SOLID', e)
        cs.forEach((c, i) => { g(10 + i, X(c.x)); g(20 + i, fin(c.y)) })
        count++
        break
      }
      case 'TEXT': case 'ATTRIB': {
        const t = e.type === 'ATTRIB' ? e.text : e
        const txt = t?.text
        if (!txt) break
        const sp = t.startPoint ?? { x: 0, y: 0 }, ep = t.endPoint ?? sp
        const al = fin(t.halign) !== 0 || fin(t.valign) !== 0
        head('TEXT', e); g(10, X(sp.x)); g(20, fin(sp.y)); g(40, fin(t.textHeight, 1)); g(1, clean(txt)); g(50, fin(t.rotation) * DEG)
        if (al) { g(72, fin(t.halign)); g(11, X(ep.x)); g(21, fin(ep.y)); g(73, fin(t.valign)) }
        count++
        break
      }
      case 'MTEXT': {
        if (!e.text) break
        head('MTEXT', e); g(10, fin(e.insertionPoint?.x)); g(20, fin(e.insertionPoint?.y)); g(40, fin(e.textHeight, 1)); g(1, clean(e.text)); count++
        break
      }
      case 'INSERT': {
        if (!e.name) break
        let rot = fin(e.rotation), sx = fin(e.xScale, 1)
        const sy = fin(e.yScale, 1)
        if (mir) { rot = -rot; sx = -sx }
        const cols = Math.max(1, Math.min(50, fin(e.columnCount, 1))), rows = Math.max(1, Math.min(50, fin(e.rowCount, 1)))
        const cs = Math.cos(rot), sn = Math.sin(rot)
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const dx = c * fin(e.columnSpacing), dy = r * fin(e.rowSpacing)
          head('INSERT', e); g(2, String(e.name))
          g(10, X(e.insertionPoint?.x) + dx * cs - dy * sn); g(20, fin(e.insertionPoint?.y) + dx * sn + dy * cs)
          g(41, sx); g(42, sy); g(50, rot * DEG)
          count++
        }
        for (const a of e.attribs ?? []) ent(a)
        break
      }
      default:
        skipped[e.type] = (skipped[e.type] ?? 0) + 1
    }
  }

  // HEADER
  g(0, 'SECTION'); g(2, 'HEADER')
  g(9, '$ACADVER'); g(1, 'AC1027')
  g(9, '$INSUNITS'); g(70, String(fin(db?.header?.INSUNITS) | 0))
  g(0, 'ENDSEC')
  // BLOCKS
  g(0, 'SECTION'); g(2, 'BLOCKS')
  let blocks = 0
  for (const b of db?.tables?.BLOCK_RECORD?.entries ?? []) {
    const name = String(b?.name ?? '')
    if (!name || /^\*(model|paper)_space/i.test(name)) continue
    g(0, 'BLOCK'); g(8, '0'); g(2, name); g(70, '0')
    g(10, fin(b.basePoint?.x)); g(20, fin(b.basePoint?.y)); g(30, '0')
    for (const e of b.entities ?? []) ent(e)
    g(0, 'ENDBLK'); g(8, '0')
    blocks++
  }
  g(0, 'ENDSEC')
  // ENTITIES (მხოლოდ model space)
  g(0, 'SECTION'); g(2, 'ENTITIES')
  for (const e of db?.entities ?? []) if (!e?.isInPaperSpace) ent(e)
  g(0, 'ENDSEC')
  g(0, 'EOF')
  return { text: L.join('\n'), stats: { entities: count, blocks, skipped } }
}

/** DWG ფაილის სათაური (AC10xx) → ვერსიის ადამიანური სახელი. */
export function dwgVersion(u8: Uint8Array): string | null {
  const h = String.fromCharCode(...u8.slice(0, 6))
  if (!/^AC10\d\d$/.test(h)) return null
  const map: Record<string, string> = { AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' }
  return map[h] ?? h
}
