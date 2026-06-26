#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSceneGraph } from './scene-graph.mjs'
import { deriveEdges } from './scene-graph-edges.mjs'
import { detectChartSubtrees } from './detect-chart-subtrees.mjs'
import { classifyDisposition } from './disposition.mjs'
import { genVueFromSceneGraph } from './gen-vue-from-scene-graph.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/fixtures/sceneGraph/tiny-tree.json'), 'utf8'))
const g = buildSceneGraph(fx.layers, fx.board)
g.edges.push(...deriveEdges(g))
const chart = detectChartSubtrees(g, {})
const idx = { members: chart.members, zones: new Set(chart.zones.map((z) => z.anchorId)) }
for (const z of chart.zones) for (const m of z.memberIds) g.edges.push({ type:'composes-chart', from:m, to:z.anchorId })
for (const n of g.nodes) n.disposition = classifyDisposition(n, g, idx)
const out = genVueFromSceneGraph(g, { host: 'fullscreen', chartZones: chart.zones })

let failed = 0
const must = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) failed++ }
must(/<template>/.test(out.vue) && /<\/template>/.test(out.vue), '含 template')
// 5 个柱不出现为 div（被 ECharts 接管）
must(!out.vue.includes('id="b1"'), '柱成员不单独渲染')
// 有 ECharts 容器
must(/v-chart|ECharts|echarts/i.test(out.vue), '含 ECharts 容器')
// 文本静态渲染
must(out.vue.includes('趋势分析'), '含静态文本')
// chartOptions 导出 1 个 zone
must(/export const chartOptions/.test(out.chartOptions) && out.chartOptions.includes('g1'), 'chartOptions 含 g1')

if (failed) process.exit(1)
console.log('gen-vue-from-scene-graph fixtures passed.')
