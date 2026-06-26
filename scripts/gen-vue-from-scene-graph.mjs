// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// 确定性 codegen（spec 4.6）。遍历场景图按 disposition 出 Vue。host: fullscreen|basic-layout。
import fs from 'node:fs'
import path from 'node:path'

function styleStr(node) {
  const r = node.rect
  const base = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:${node.z};`
  const css = (node.attrs.css || []).join('')
  return base + css
}
function esc(s) { return String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;') }

export function genVueFromSceneGraph(graph, opts = {}) {
  const host = opts.host || 'fullscreen'
  const zones = opts.chartZones || []
  const nodes = [...graph.nodes].sort((a, b) => a.z - b.z)
  const parts = []
  for (const n of nodes) {
    const k = n.disposition && n.disposition.kind
    if (k === 'container' || k === 'chart-series-member' || (k && k.startsWith('exclude:'))) {
      if (k && k.startsWith('exclude:')) parts.push(`    <!-- ${k} ${esc(n.name)} (${n.id}) 报备设计师 -->`)
      continue
    }
    if (k === 'chart-zone') {
      parts.push(`    <v-chart :option="chartOptions['${n.id}']" :style="zoneStyle('${n.id}')" autoresize />`)
      continue
    }
    if (k === 'render-slice') {
      parts.push(`    <img :src="asset('${n.id}')" style="${styleStr(n)}" />`)
      continue
    }
    if (k === 'render-vector') {
      parts.push(`    <div style="${styleStr(n)}"></div>`)
      continue
    }
    if (k === 'live-text-static' || k === 'live-text-dynamic') {
      parts.push(`    <div style="${styleStr(n)}">${esc(n.attrs.content)}</div>`)
      continue
    }
  }
  const board = graph.meta.board
  const shellOpen = host === 'fullscreen'
    ? `<div class="sg-shell" :style="stageStyle">`
    : `<div class="sg-shell-embedded">`
  const vue = `<template>
  ${shellOpen}
${parts.join('\n')}
  </div>
</template>

<script>
import { chartOptions } from './chartOptions.js'
import assetMap from './assetMap.js'
export default {
  name: 'SceneGraphPage',
  data() { return { chartOptions, board: ${JSON.stringify(board)} } },
  computed: {
    stageStyle() { return { position:'fixed', inset:0, width:this.board.w+'px', height:this.board.h+'px', transformOrigin:'top left' } },
  },
  methods: {
    asset(id) { return assetMap[id] || '' },
    zoneStyle(id) { const z = (${JSON.stringify(zones)}).find(z => z.anchorId === id) || {}; const r = z.rect||{x:0,y:0,w:0,h:0}; return { position:'absolute', left:r.x+'px', top:r.y+'px', width:r.w+'px', height:r.h+'px' } },
  },
}
</script>
`
  const chartOptionsSrc = `// 自动生成：每个 chart-zone 一个 ECharts option（可被高阶模型覆盖精修）
export const chartOptions = {
${zones.map((z) => `  '${z.anchorId}': { xAxis:{type:'category',data:${JSON.stringify(z.series.map((_, i) => i + 1))}}, yAxis:{type:'value'}, series:[{type:'${z.chartType}',data:${JSON.stringify(z.series)}}] },`).join('\n')}
}
`
  // assetMap.js：render-slice 节点 id → 静态资源路径（可被消费方覆盖精修路径）
  const assetMapSrc = `// 自动生成：render-slice 节点 id → 静态图片路径（路径前缀请按项目实际调整）
const assetMap = {
${graph.nodes
  .filter((n) => n.disposition?.kind === 'render-slice')
  .map((n) => {
    const p = n.attrs?.exports?.[0]?.path || n.id + '.png'
    return `  '${n.id}': '/static/assets/${p}', // ${n.name}`
  })
  .join('\n')}
}
export default assetMap
`
  // chartPlaceholderHints：ECharts zone 的 TODO 说明，告知低阶模型如何替换占位数据
  const chartPlaceholderHints = zones.map((z) => ({
    chartZone: z.anchorId,
    chartType: z.chartType,
    TODO: [
      `将 series[0].data 替换为真实 API 数据（当前为归一化高度占位值）`,
      `将 xAxis.data 替换为时间/分类标签（当前为序号占位值）`,
      `参考 _render_gaps_report.json > chartSectionTitles 推断图表语义`,
    ],
    placeholderSeries: z.series,
  }))

  return { vue, chartOptions: chartOptionsSrc, assetMap: assetMapSrc, chartPlaceholderHints }
}

// CLI: node gen-vue-from-scene-graph.mjs <scene-graph.json> <_chart_zones_sg.json> <outDir> [--host fullscreen|basic-layout]
if (process.argv[2]) {
  const graph = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const zones = process.argv[3] && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).zones : []
  const outDir = process.argv[4] || '.'
  const host = process.argv.includes('--host') ? process.argv[process.argv.indexOf('--host') + 1] : 'fullscreen'
  const out = genVueFromSceneGraph(graph, { host, chartZones: zones })
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'Index.generated.vue'), out.vue)
  fs.writeFileSync(path.join(outDir, 'chartOptions.js'), out.chartOptions)
  fs.writeFileSync(path.join(outDir, 'assetMap.js'), out.assetMap)
  if (out.chartPlaceholderHints.length) {
    fs.writeFileSync(path.join(outDir, '_chart_placeholder_hints.json'), JSON.stringify(out.chartPlaceholderHints, null, 2))
    console.log(`⚠️  ${out.chartPlaceholderHints.length} 个图表 zone 含占位数据，请查阅 _chart_placeholder_hints.json`)
  }
  console.log('✅ 出码完成:', outDir)
}
