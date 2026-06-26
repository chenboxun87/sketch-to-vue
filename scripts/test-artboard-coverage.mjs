import { measureCoverage } from './measure-artboard-coverage.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 超宽画板 fixture（算法测试，非某项目尺寸）
const ULTRA_W = 4800
const ULTRA_H = 1200
const CENTER_X = 1200
const CENTER_W = 2400

const layers1 = [
  { id: 'bg', rect: { x: CENTER_X, y: 0, w: CENTER_W, h: ULTRA_H } },
  { id: 'd1', rect: { x: CENTER_X + 200, y: 200, w: 100, h: 100 } },
  { id: 'd2', rect: { x: CENTER_X + 800, y: 300, w: 80, h: 80 } },
]
const r1 = measureCoverage(layers1, { boardW: ULTRA_W, boardH: ULTRA_H })
assert(r1.centerCoverage > 0.8, 'center-only → high centerCoverage')
assert(r1.hasFullBg === true, 'has full bg')
assert(r1.totalLayers === 3, 'totalLayers count')

// 仅左右面板，中心空
const layers2 = [
  { id: 'lp1', rect: { x: 0, y: 100, w: 400, h: 200 } },
  { id: 'lp2', rect: { x: 100, y: 400, w: 300, h: 150 } },
  { id: 'rp1', rect: { x: ULTRA_W - 400, y: 100, w: 300, h: 200 } },
  { id: 'rp2', rect: { x: ULTRA_W - 650, y: 400, w: 250, h: 150 } },
]
const r2 = measureCoverage(layers2, { boardW: ULTRA_W, boardH: ULTRA_H })
assert(r2.centerCoverage < 0.1, 'panel-only → low centerCoverage')
assert(r2.hasFullBg === false, 'no full bg')

// 空 layers → 安全不崩
const r3 = measureCoverage([], { boardW: 1920, boardH: 1080 })
assert(r3.centerCoverage === 0, 'empty layers → 0')
assert(r3.totalLayers === 0, 'empty totalLayers')

if (failed) process.exit(1)
console.log('All artboard-coverage tests passed')
