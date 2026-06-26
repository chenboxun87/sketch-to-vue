import { deriveBarData, deriveLineData } from './chart-features/derive-data.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 柱高反推：baseline y=500, max=150 对应 100px 高
// 一根 h=100 的柱 → 值≈150；h=50 → 75
const bars = [
  { rect: { x: 200, y: 400, w: 12, h: 100 } },
  { rect: { x: 240, y: 450, w: 12, h: 50 } },
]
const d = deriveBarData(bars, { baselineY: 500, pxPerUnit: 100 / 150 })
assert(Math.round(d[0]) === 150, 'bar0 ≈ 150')
assert(Math.round(d[1]) === 75, 'bar1 ≈ 75')

// 折线点反推
const pts = [
  { x: 200, y: 400 }, { x: 300, y: 450 },
]
const ld = deriveLineData(pts, { baselineY: 500, pxPerUnit: 100 / 150 })
assert(Math.round(ld[0]) === 150 && Math.round(ld[1]) === 75, 'line points derived')

if (failed) process.exit(1)
console.log('All derive-data tests passed')
