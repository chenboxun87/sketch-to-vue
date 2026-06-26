#!/usr/bin/env node
import { deriveEdges } from './scene-graph-edges.mjs'

let failed = 0
const must = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) failed++ }

const graph = {
  nodes: [
    { id:'bg', type:'shape', name:'BG', rect:{x:0,y:0,w:400,h:300}, attrs:{ exports:[{path:'bg.png'}] } },
    { id:'s1', type:'shape', name:'装饰', rect:{x:10,y:10,w:50,h:50}, attrs:{ css:['background:#fff;'] } },
    { id:'tA', type:'text', name:'a', rect:{x:0,y:0,w:10,h:10}, attrs:{ styleName:'图例文字' } },
    { id:'tB', type:'text', name:'b', rect:{x:20,y:0,w:10,h:10}, attrs:{ styleName:'图例文字' } },
    { id:'p1', type:'shape', name:'位图', rect:{x:5,y:5,w:30,h:30}, attrs:{ exports:[{path:'bg.png'}] } },
    { id:'m1', type:'shape', name:'蒙版', rect:{x:0,y:0,w:60,h:60}, attrs:{} },
  ],
  edges: [],
}
const edges = deriveEdges(graph)
const has = (t) => edges.filter((e) => e.type === t)

// shares-style: tA<->tB 同 styleName → 1 条（无向取一条）
must(has('shares-style').length === 1, `shares-style 应 1 条，实为 ${has('shares-style').length}`)
// same-asset: bg 与 p1 同 path → 1 条
must(has('same-asset').length === 1, `same-asset 应 1 条，实为 ${has('same-asset').length}`)
// occluded-by: s1 中心落在 bg(全屏切片) 内 → s1 occluded-by bg
must(has('occluded-by').some((e) => e.from === 's1' && e.to === 'bg'), 's1 occluded-by bg')
// masks: 蒙版 m1 → uncertain
must(has('masks').every((e) => e.confidence === 'uncertain'), 'masks 必须 uncertain')

if (failed) process.exit(1)
console.log('scene-graph-edges fixtures passed.')
