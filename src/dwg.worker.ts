// SPDX-License-Identifier: GPL-3.0-or-later
// nco-dwg-reader — DWG → DXF ბრაუზერში (ai.nco.ge, N Construction). Copyright (C) 2026 Giorgi Datuashvili.
// იყენებს @mlightcad/libredwg-web (GNU LibreDWG, GPL-3.0). This program comes with ABSOLUTELY NO WARRANTY; see LICENSE.
/**
 * DWG → DXF (UTF-8 ბაიტები, transferable — ასლის გარეშე) ცალკე Web Worker-ში (UI არ იყინება; WASM-ის ავარიის შემთხვევაში worker უბრალოდ იხურება).
 * LibreDWG (libredwg-web 0.7.15, GPL-3.0) — უცვლელი პაკეტი; WASM-ს (~9.5 მბ) Vite თვითონ აგდებს assets-ში (ჰეშიანი სახელით)
 * და იტვირთება მხოლოდ DWG ფაილის ატვირთვისას.
 */
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web'
import { dwgDbToDxf } from './dwgToDxf'

self.onmessage = async (ev: MessageEvent<{ buf: ArrayBuffer }>) => {
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m)
  try {
    const t0 = performance.now()
    post({ stage: 'load' })
    const lib = await LibreDwg.create()
    post({ stage: 'read' })
    const dwg = lib.dwg_read_data(ev.data.buf, Dwg_File_Type.DWG)
    if (!dwg) throw new Error('DWG ვერ წავიკითხე')
    const db = lib.convert(dwg as never)
    try { lib.dwg_free(dwg as never) } catch { /* მეხსიერება worker-თან ერთად თავისუფლდება */ }
    post({ stage: 'convert' })
    const { text, stats } = dwgDbToDxf(db)
    const dxf = new TextEncoder().encode(text).buffer
    ;(self as unknown as Worker).postMessage({ ok: true, dxf, stats, ms: Math.round(performance.now() - t0) }, [dxf])
  } catch (e) {
    post({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}
