#!/usr/bin/env node
import { classifyDisposition } from './disposition.mjs'

let failed = 0
const must = (cond, msg) => { console.log(cond ? '✅' : '❌', msg); if (!cond) failed++ }
const mk = (o) => ({ id: o.id, type: o.type, name: o.name || '', rect: o.rect || { x:0,y:0,w:100,h:100 }, attrs: o.attrs || {} })

// 图表区锚点（级别 1，先于 container 判定）→ chart-zone
must(classifyDisposition(mk({ id:'z1', type:'group', attrs:{ isContainer:true } }), {}, { members:new Set(), zones:new Set(['z1']) }).kind === 'chart-zone', 'zone 锚点 group → chart-zone（不被 container 截断）')
// 普通容器（不在 zones 里）→ container
must(classifyDisposition(mk({ id:'g', type:'group', attrs:{ isContainer:true } }), {}, {}).kind === 'container', 'group→container')
// 图表成员（chartIndex 命中）→ chart-series-member
must(classifyDisposition(mk({ id:'b1', type:'shape', attrs:{ fills:[{}] } }), {}, { members:new Set(['b1']), zones:new Set() }).kind === 'chart-series-member', 'bar→chart-series-member')
// 有切片且文件在盘 → render-slice
must(classifyDisposition(mk({ id:'s', type:'shape', attrs:{ exports:[{path:'a.png'}], _sliceOnDisk:true } }), {}, {}).kind === 'render-slice', 'slice→render-slice')
// 切片缺失 → exclude:missing-slice
must(classifyDisposition(mk({ id:'s2', type:'shape', attrs:{ exports:[{path:'b.png'}], _sliceOnDisk:false } }), {}, {}).kind === 'exclude:missing-slice', 'missing→exclude')
// 数值文本 → live-text-dynamic
must(classifyDisposition(mk({ id:'t', type:'text', attrs:{ content:'33224' } }), {}, {}).kind === 'live-text-dynamic', 'number→dynamic')
// 中文文本 → live-text-static
must(classifyDisposition(mk({ id:'t2', type:'text', attrs:{ content:'指标A' } }), {}, {}).kind === 'live-text-static', 'cn→static')
// 有 fill 的 shape → render-vector
must(classifyDisposition(mk({ id:'v', type:'shape', attrs:{ css:['background:#fff;'] } }), {}, {}).kind === 'render-vector', 'shape(bg)→render-vector')
// 仅 border 描边（彩色描边/分隔线/直线）→ render-vector（关键：不得因 fills 空判 ghost）
must(classifyDisposition(mk({ id:'vb', type:'shape', attrs:{ css:['border: 2px solid #0BFFB6;'] } }), {}, {}).kind === 'render-vector', 'shape(border-only)→render-vector')
// border-radius + border → render-vector
must(classifyDisposition(mk({ id:'vbr', type:'shape', attrs:{ css:['border-radius: 5.6px;','border: 2.8px solid #178FE6;'] } }), {}, {}).kind === 'render-vector', 'shape(radius+border)→render-vector')
// attrs.borders 数组 → render-vector
must(classifyDisposition(mk({ id:'vb2', type:'shape', attrs:{ borders:[{}] } }), {}, {}).kind === 'render-vector', 'shape(borders[])→render-vector')
// box-shadow 仅阴影 → render-vector
must(classifyDisposition(mk({ id:'vs', type:'shape', attrs:{ css:['box-shadow: 0 4px 8px 0 #8CECFF;'] } }), {}, {}).kind === 'render-vector', 'shape(shadow)→render-vector')
// 仅 transform/opacity（无可渲染样式）→ exclude:ghost
must(classifyDisposition(mk({ id:'gho', type:'shape', attrs:{ css:['transform: rotate(2deg);','opacity: 0.2;'] } }), {}, {}).kind === 'exclude:ghost', 'shape(transform/opacity-only)→ghost')
// ghost（无 fills 无 css）→ exclude:ghost
must(classifyDisposition(mk({ id:'gh', type:'shape', attrs:{} }), {}, {}).kind === 'exclude:ghost', 'ghost→exclude')

if (failed) process.exit(1)
console.log('disposition fixtures passed.')
