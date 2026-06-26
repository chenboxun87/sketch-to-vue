#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 指向你本机的 MeaXure 导出目录（含 index.html + assets/）；未设置则跳过本集成测试
const SRC = process.env.D2V_FIXTURE_SRC || ''
const HTML = SRC ? path.join(SRC, 'index.html') : ''
const ASSETS = SRC ? path.join(SRC, 'assets') : ''
const OUT = path.join(__dirname, '../docs/fixtures/sceneGraph/_int_out')

if (!HTML || !fs.existsSync(HTML)) { console.warn('SKIP（未设置 D2V_FIXTURE_SRC 或源不存在）:', HTML || '<unset>'); process.exit(0) }
fs.mkdirSync(OUT, { recursive: true })
execSync(`node "${path.join(__dirname, 'extract-all-elements.mjs')}" "${HTML}" "${ASSETS}" "${OUT}"`, { stdio: 'inherit' })

let failed = 0
const must = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) failed++ }
const sg = JSON.parse(fs.readFileSync(path.join(OUT, 'scene-graph.json'), 'utf8'))
const ae = JSON.parse(fs.readFileSync(path.join(OUT, '_all_elements.json'), 'utf8'))
const aeCount = (ae.elements || ae).length

// 节点数 == _all_elements 元素数（无丢节点）
must(sg.nodes.length === aeCount, `场景图节点(${sg.nodes.length}) 应 == _all_elements(${aeCount})`)
// 每个节点都有非空 disposition
must(sg.nodes.every((n) => n.disposition && n.disposition.kind), '所有节点都有 disposition')
// 有 child-of 边（父子树已还原）
must(sg.edges.some((e) => e.type === 'child-of'), '存在 child-of 边')
// audit 文件存在且 ok（或仅 exclude:* 报备类违规，但无 unclassified）
const audit = JSON.parse(fs.readFileSync(path.join(OUT, '_scene_graph_audit.json'), 'utf8'))
must(!audit.violations.some((v) => v.detail === 'unclassified'), '无 unclassified 节点')

if (failed) process.exit(1)
console.log('scene-graph-integration passed.')
