import { buildChartZones } from './extract-chart-features.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const elements = [
  { id: 't', type: 'text', content: '趋势分析', rect: { x: 181, y: 184, w: 148, h: 44 } },
  { id: 'y1', type: 'text', content: '0', rect: { x: 150, y: 380, w: 20, h: 20 } },
  { id: 'y2', type: 'text', content: '150', rect: { x: 150, y: 240, w: 20, h: 20 } },
  { id: 'c1', type: 'text', content: '2020年', rect: { x: 214, y: 528, w: 60, h: 24 } },
  { id: 'c2', type: 'text', content: '2021年', rect: { x: 320, y: 528, w: 60, h: 24 } },
]
const zones = buildChartZones(elements, [], { panels: [{ titles: ['趋势分析'], left: 138, width: 1263 }] })
assert(zones.zones.length === 1, 'one zone')
assert(zones.zones[0].categories.length === 2, 'categories extracted')
assert(zones.zones[0].axis !== undefined, 'axis present')
assert(zones.zones[0].confidence === 'high', 'high confidence')

if (failed) process.exit(1)
console.log('All extract-chart-features tests passed')
