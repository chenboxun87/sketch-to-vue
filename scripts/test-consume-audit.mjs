import { auditConsumption } from './consume-audit.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const layers = [
  { id: 'a', rect: { x: 0, y: 0, w: 10, h: 10 } },
  { id: 'b', rect: { x: 0, y: 0, w: 10, h: 10 } }, // 在图表区
]
const zones = { zones: [{ id: 'bar', confidence: 'high', chartType: 'bar', excludeLayerIds: ['b'], rendered: true }] }
const gaps = { degenerateBorderPaths: [], blendHints: [{ id: 'a', blendMode: 'screen' }] }
const consumedIds = ['a'] // a 已渲染，b 被图表区排除
const r1 = auditConsumption({ layers, zones, gaps, consumedIds, appliedBlendIds: ['a'] })
assert(r1.ok === true, 'all consumed → ok')

// 漏渲染一层 → 不 ok
const r2 = auditConsumption({ layers, zones, gaps, consumedIds: [], appliedBlendIds: ['a'] })
assert(r2.ok === false, 'missing layer → not ok')
assert(r2.issues.some((i) => i.type === 'unconsumed-layer'), 'reports unconsumed')

// blend 未加 → 不 ok
const r3 = auditConsumption({ layers, zones, gaps, consumedIds: ['a'], appliedBlendIds: [] })
assert(r3.ok === false && r3.issues.some((i) => i.type === 'missing-blend'), 'missing blend reported')

// high zone 未渲染 → 不 ok
const zones2 = { zones: [{ id: 'bar', confidence: 'high', excludeLayerIds: ['b'], rendered: false }] }
const r4 = auditConsumption({ layers, zones: zones2, gaps, consumedIds: ['a'], appliedBlendIds: ['a'] })
assert(r4.ok === false && r4.issues.some((i) => i.type === 'chart-zone-no-echarts'), 'zone without echarts reported')

if (failed) process.exit(1)
console.log('All consume-audit tests passed')
