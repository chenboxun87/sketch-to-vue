#!/usr/bin/env node
import { auditSceneGraph } from './audit-scene-graph.mjs'

let failed = 0
const must = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) failed++ }

// 全部有 disposition + 边完整 → ok
const good = {
  nodes: [
    { id:'g', type:'group', rect:{x:0,y:0,w:10,h:10}, attrs:{}, disposition:{ kind:'container' } },
    { id:'b1', type:'shape', rect:{x:0,y:0,w:2,h:8}, attrs:{ fills:[{}] }, disposition:{ kind:'chart-series-member' } },
    { id:'z', type:'group', rect:{x:0,y:0,w:10,h:10}, attrs:{}, disposition:{ kind:'chart-zone' } },
  ],
  edges: [
    { type:'child-of', from:'b1', to:'g' },
    { type:'composes-chart', from:'b1', to:'z' },
  ],
}
must(auditSceneGraph(good).ok === true, '完整图应 ok')

// 有 unclassified → 不 ok，且点名
const bad = {
  nodes: [
    { id:'x', type:'shape', rect:{x:0,y:0,w:50,h:50}, attrs:{ css:['background:#fff;'] }, disposition:{ kind:'exclude:unclassified' } },
  ],
  edges: [],
}
const r = auditSceneGraph(bad)
must(r.ok === false, 'unclassified 应不 ok')
must(r.violations.some((v) => v.rule === 'disposition-complete' && v.id === 'x'), '应点名 x')

// 有 fill 的 shape 却 unclassified → 触发 visibility-check
must(r.violations.some((v) => v.rule === 'visibility-check' && v.id === 'x'), '应触发 visibility-check')

if (failed) process.exit(1)
console.log('audit-scene-graph fixtures passed.')
