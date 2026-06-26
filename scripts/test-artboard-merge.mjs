import { planArtboardMerge } from './detect-artboard-merge.mjs'
import { mergeLayerStacks } from './merge-artboards.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 互补：board0 仅左右面板（中心空），board1 仅中心大背景
const cov = [
  { index: 0, coverage: 0.55, centerCoverage: 0.10, hasFullBg: false },
  { index: 1, coverage: 0.60, centerCoverage: 0.95, hasFullBg: true },
]
const plan = planArtboardMerge(cov)
assert(plan.multiArtboard === true, 'multiArtboard true')
assert(plan.strategy === 'complementary-merge', 'complementary strategy')
assert(plan.base === 1, 'base = full-bg board')
assert(plan.overlays[0].from === 0, 'overlay from panel board')

// 单画板完整 → 不合并
const single = planArtboardMerge([{ index: 0, coverage: 0.98, centerCoverage: 0.97, hasFullBg: true }])
assert(single.multiArtboard === false, 'single artboard no merge')

// 合并 layer_stack：overlay 层加 zOffset
const base = [{ id: 'b1', z: 0, zIndex: 0, rect: { x: 0, y: 0, w: 100, h: 100 } }]
const ov = [{ id: 'p1', z: 5, zIndex: 5, rect: { x: 0, y: 0, w: 50, h: 50 } }]
const merged = mergeLayerStacks(base, [{ layers: ov, zOffset: 2000 }])
assert(merged.length === 2, 'merged length')
assert(merged.find((l) => l.id === 'p1').zIndex === 2005, 'overlay zOffset applied')

if (failed) process.exit(1)
console.log('All artboard-merge tests passed')
