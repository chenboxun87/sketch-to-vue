import { buildOption } from '../templates/echarts/index.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const barZone = {
  chartType: 'dualAxisBar',
  categories: ['2020', '2021'],
  axis: { yLeft: { max: 150, unit: '万tce' }, yRight: { max: 150, unit: '万tCO₂' } },
  legend: [{ name: '指标A', color: '#1DE4FF' }, { name: '指标B', color: '#0BFFB6' }],
  series: [
    { name: '指标A', color: '#1DE4FF', yAxisIndex: 0, data: [98, 112] },
    { name: '指标B', color: '#0BFFB6', yAxisIndex: 1, data: [76, 84] },
  ],
}
const bar = buildOption(barZone)
assert(bar.series.length === 2, 'bar 2 series')
assert(bar.series[0].type === 'bar', 'series type bar')
assert(bar.xAxis.data.length === 2, 'xAxis categories')
assert(Array.isArray(bar.yAxis) && bar.yAxis.length === 2, 'dual yAxis')

const radar = buildOption({ chartType: 'radar', radar: { indicators: [{ name: '电', max: 100 }] }, series: [{ data: [80] }] })
assert(radar.radar && radar.radar.indicator.length === 1, 'radar indicator')
assert(radar.series[0].type === 'radar', 'radar series type')

const sankey = buildOption({ chartType: 'sankey', sankey: { nodes: [{ name: 'A' }, { name: 'B' }], links: [{ source: 'A', target: 'B', value: 5 }] } })
assert(sankey.series[0].type === 'sankey', 'sankey type')
assert(sankey.series[0].data.length === 2, 'sankey nodes')

assert(buildOption({ chartType: 'unknownXYZ' }) === null, 'unknown type null')

if (failed) process.exit(1)
console.log('All echarts-template tests passed')
