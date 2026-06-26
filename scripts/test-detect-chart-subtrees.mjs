#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSceneGraph } from './scene-graph.mjs'
import { detectChartSubtrees } from './detect-chart-subtrees.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/fixtures/sceneGraph/tiny-tree.json'), 'utf8'))
const g = buildSceneGraph(fx.layers, fx.board)
const r = detectChartSubtrees(g, { minBars: 5, widthTolPx: 2 })

let failed = 0
const must = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) failed++ }

// 命中 1 个图表区（g1=柱状图）
must(r.zones.length === 1, `应检出 1 个图表区，实为 ${r.zones.length}`)
must(r.zones[0].anchorId === 'g1', 'zone 锚点应为 g1')
must(r.zones[0].chartType === 'bar', 'chartType 应为 bar')
// 5 个柱成员
must(r.members.size === 5, `应标记 5 个柱成员，实为 ${r.members.size}`)
must(['b1','b2','b3','b4','b5'].every((id) => r.members.has(id)), '成员应含 b1..b5')
// 特征：5 个数值（按高归一）
must(Array.isArray(r.zones[0].series) && r.zones[0].series.length === 5, 'series 应含 5 个值')

if (failed) process.exit(1)
console.log('detect-chart-subtrees fixtures passed.')
