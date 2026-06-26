import { detectChartZones, inferChartType } from './chart-features/detect-zones.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 类型推断：jpg 切片 → radar
assert(inferChartType({ slices: [{ ext: 'jpg' }], texts: ['电', '氢气', '热', '油', '气'], vectors: [] }) === 'radar', 'jpg+dims → radar')
// 等距小柱 → bar
assert(inferChartType({ slices: [], texts: ['2020', '2021'], vectors: Array.from({ length: 8 }, () => ({ w: 12, h: 60 })) }) === 'bar', 'small bars → bar')
// 多色描边路径簇 → sankey
assert(inferChartType({ slices: [], texts: ['供电', '供热', '区域C'], vectors: Array.from({ length: 10 }, (_, i) => ({ w: 6, h: 1, borderPx: 90 })) }) === 'sankey', 'border paths → sankey')

// zone 检测：标题锚定
const els = [
  { type: 'text', content: '趋势分析', rect: { x: 181, y: 184, w: 148, h: 44 } },
  { type: 'text', content: '2020年', rect: { x: 214, y: 528, w: 60, h: 24 } },
]
const zones = detectChartZones(els, { panelTitles: ['趋势分析'], panelWidth: 1263, panelLeft: 138 })
assert(zones.length === 1, 'one zone from title')
assert(zones[0].title === '趋势分析', 'zone title')
assert(zones[0].confidence === 'high', 'title anchored = high')

if (failed) process.exit(1)
console.log('All chart-zones tests passed')
