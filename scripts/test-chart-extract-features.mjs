import { extractAxis, extractCategories, extractLegend } from './chart-features/extract-features.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 轴刻度反推 max/interval
const yTicks = [
  { content: '0', rect: { x: 150, y: 520 } }, { content: '25', rect: { x: 150, y: 470 } },
  { content: '50', rect: { x: 150, y: 420 } }, { content: '150', rect: { x: 150, y: 240 } },
  { content: '万tce', rect: { x: 150, y: 220 } },
]
const axis = extractAxis(yTicks)
assert(axis.max === 150, 'axis max 150')
assert(axis.interval === 25, 'axis interval 25')
assert(axis.unit === '万tce', 'axis unit')

// 类目按 x 排序
const cats = extractCategories([
  { content: '2021年', rect: { x: 320, y: 528 } },
  { content: '2020年', rect: { x: 214, y: 528 } },
])
assert(cats[0] === '2020年' && cats[1] === '2021年', 'categories x-sorted')

// 图例：色块 + 邻近文字
const legend = extractLegend(
  [{ content: '指标总量', rect: { x: 200, y: 250, w: 120, h: 24 } }],
  [{ rect: { x: 180, y: 256, w: 12, h: 12 }, color: '#1DE4FF' }]
)
assert(legend[0].name === '指标总量' && legend[0].color === '#1DE4FF', 'legend name+color')

if (failed) process.exit(1)
console.log('All chart-extract-features tests passed')
