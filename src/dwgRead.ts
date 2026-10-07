// SPDX-License-Identifier: GPL-3.0-or-later
// nco-dwg-reader — DWG → DXF ბრაუზერში (ai.nco.ge, N Construction). Copyright (C) 2026 Giorgi Datuashvili.
// იყენებს @mlightcad/libredwg-web (GNU LibreDWG, GPL-3.0). This program comes with ABSOLUTELY NO WARRANTY; see LICENSE.
/**
 * DWG ფაილის წაკითხვა ბრაუზერში (Web Worker + LibreDWG WASM, ~9.5 მბ, იტვირთება მხოლოდ საჭიროებისას).
 * შედეგი — ASCII DXF UTF-8 ბაიტებად (ArrayBuffer, transferable): `decodeDxf` → `parseDxf` (საიტზე — ცალკე worker-ში, `cadClient.ts`).
 */
import { dwgVersion, type DwgToDxfStats } from './dwgToDxf'

export const isDwg = (u8: Uint8Array) => dwgVersion(u8) !== null

export function readDwg(buf: ArrayBuffer, onStage?: (s: 'load' | 'read' | 'convert') => void, timeoutMs = 240000): Promise<{ dxf: ArrayBuffer; stats: DwgToDxfStats; version: string; ms: number }> {
  const version = dwgVersion(new Uint8Array(buf, 0, Math.min(6, buf.byteLength))) ?? '?'
  if (/^R1[34]$/.test(version)) return Promise.reject(new Error(`DWG ვერსია ${version} ძალიან ძველია — AutoCAD-ში შეინახე ახალ ვერსიად ან DXF-ად`))
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./dwg.worker.ts', import.meta.url), { type: 'module' })
    const done = (fn: () => void) => { clearTimeout(t); w.terminate(); fn() }
    const t = setTimeout(() => done(() => reject(new Error('DWG-ის წაკითხვამ ძალიან დიდხანს გასტანა — სცადე DXF-ად შენახვა ან მხოლოდ გეგმის ფენების დატოვება'))), timeoutMs)
    w.onmessage = (ev: MessageEvent<{ stage?: 'load' | 'read' | 'convert'; ok?: boolean; dxf?: ArrayBuffer; stats?: DwgToDxfStats; ms?: number; error?: string }>) => {
      const m = ev.data
      if (m.stage) { onStage?.(m.stage); return }
      if (m.ok && m.dxf) done(() => resolve({ dxf: m.dxf!, stats: m.stats!, version, ms: m.ms ?? 0 }))
      else done(() => reject(new Error(`DWG ვერ წავიკითხე (${m.error || 'უცნობი შეცდომა'}). AutoCAD-ში: Save As → DXF და ატვირთე ის`)))
    }
    w.onerror = (ev) => done(() => reject(new Error(`DWG ვერ წავიკითხე (${ev.message || 'WASM შეცდომა'}). AutoCAD-ში: Save As → DXF და ატვირთე ის`)))
    w.postMessage({ buf }, [buf])
  })
}
