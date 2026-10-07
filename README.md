# nco-dwg-reader

DWG ფაილის წაკითხვა ბრაუზერში — [ai.nco.ge](https://ai.nco.ge/import)-ის გეგმის იმპორტისთვის (N Construction).
DWG → (GNU LibreDWG, WebAssembly, Web Worker) → ASCII DXF ტექსტი → საიტის DXF იმპორტი (ოთახები, კარები, ფანჯრები).

Reads AutoCAD DWG files (R2000–2018) in the browser and converts the drawing database into a minimal ASCII DXF
that the ai.nco.ge DXF importer understands. Everything runs locally in the user's browser; files are not uploaded.

## ფაილები / Files

| ფაილი | რას აკეთებს |
|---|---|
| `src/dwg.worker.ts` | Web Worker: იტვირთავს LibreDWG WASM-ს, კითხულობს DWG-ს, აბრუნებს DXF-ს UTF-8 ბაიტებად (transferable ArrayBuffer) |
| `src/dwgToDxf.ts` | `dwgDbToDxf(db)` — LibreDWG-ის `DwgDatabase` → ASCII DXF (LINE, LWPOLYLINE, POLYLINE2D/3D, ARC, CIRCLE, ELLIPSE, SPLINE, SOLID, TEXT, MTEXT, INSERT/ATTRIB, ბლოკები; რადიანი→გრადუსი, OCS სარკე) |
| `src/dwgRead.ts` | `readDwg(buf)` → `{ dxf: ArrayBuffer, stats, version, ms }` — worker-ის გაშვება/დასრულება, დროის ლიმიტი, შეცდომები ქართულად |

ai.nco.ge-ის დანარჩენი კოდი (DXF პარსერი, ოთახების ამოცნობა, UI) ცალკე პროგრამაა და ამ worker-ს მხოლოდ
`postMessage`-ით (DWG ბაიტები → DXF ბაიტები) უკავშირდება; DXF-ის ანალიზი საიტის ცალკე worker-შია.

## მესამე მხარის კომპონენტი / Third-party component (GPL-3.0)

- **@mlightcad/libredwg-web 0.7.15** (npm) — https://github.com/mlightcad/libredwg-web — JavaScript/WebAssembly bindings for
- **GNU LibreDWG** — https://www.gnu.org/software/libredwg/ — Copyright © Free Software Foundation, Inc.

ai.nco.ge იყენებს npm პაკეტის **უცვლელ** ვერსიას 0.7.15 (`wasm/libredwg-web.wasm`, `wasm/libredwg-web.js`, `dist/`).
შესაბამისი წყარო (Corresponding Source): ამ პაკეტის წყარო — https://github.com/mlightcad/libredwg-web (ვერსია 0.7.15),
LibreDWG — https://git.savannah.gnu.org/git/libredwg.git. ასლი ასევე ხელმისაწვდომია ამ ანგარიშის fork-ში (თუ არსებობს).

## აწყობა / Build

```bash
npm install
# Vite-ში: new Worker(new URL('./dwg.worker.ts', import.meta.url), { type: 'module' }), vite.config: worker.format = 'es'
```

## ლიცენზია / License

GPL-3.0-or-later — იხ. [LICENSE](LICENSE). Copyright © 2026 Giorgi Datuashvili (N Construction).
This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY.
