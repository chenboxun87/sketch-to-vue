#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSceneGraph } from './scene-graph.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/fixtures/sceneGraph/tiny-tree.json'), 'utf8'))
const g = buildSceneGraph(fx.layers, fx.board)
let failed = 0
const must = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) failed++ }

// 节点数 = 1 bg + 1 group + 5 bars + 1 text = 8
must(g.nodes.length === 8, `节点数应为 8，实为 ${g.nodes.length}`)
// 每个非根节点有 child-of 边（bg/g1/t1 是根；b1..b5 child-of g1 = 5 条）
const childOf = g.edges.filter((e) => e.type === 'child-of')
must(childOf.length === 5, `child-of 边应为 5，实为 ${childOf.length}`)
must(childOf.every((e) => e.confidence === 'native'), 'child-of 必须 native')
// b1 attrs 内嵌全字段
const b1 = g.nodes.find((n) => n.id === 'b1')
must(b1 && b1.attrs && Array.isArray(b1.attrs.css), 'b1 attrs.css 应内嵌')
must(b1 && b1.rect.x === 50 && b1.rect.w === 20, 'b1 rect 应保留')
// group 标记
const g1 = g.nodes.find((n) => n.id === 'g1')
must(g1 && g1.type === 'group', 'g1 为 group')

// schemaVersion 必须为 1
must(g.meta && g.meta.schemaVersion === 1, `schemaVersion 应为 1，实为 ${g.meta?.schemaVersion}`)

// 空输入：nodes 和 edges 均为空数组
const empty = buildSceneGraph([], { x: 0, y: 0, w: 400, h: 300 })
must(empty.nodes.length === 0 && empty.edges.length === 0, '空输入应返回空 nodes/edges')

// 前序遍历：父节点 z < 子节点 z
must(g1 && b1 && g1.z < b1.z, `g1.z(${g1?.z}) 应小于 b1.z(${b1?.z})`)

if (failed) process.exit(1)
console.log('scene-graph fixtures passed.')
