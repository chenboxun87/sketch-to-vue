#!/usr/bin/env node
// 处置级完整性闸门（spec 4.5）。CLI: node audit-scene-graph.mjs <scene-graph.json>
import fs from 'node:fs'
const VALID = new Set([
  'container','render-slice','render-vector','live-text-static','live-text-dynamic',
  'chart-series-member','chart-zone',
])
const isExclude = (k) => typeof k === 'string' && k.startsWith('exclude:')
function hasFill(attrs) {
  const css = (attrs && attrs.css || []).join(' ')
  return css.includes('background-image:') ||
    (css.includes('background:') && !css.includes('transparent')) ||
    (attrs && Array.isArray(attrs.fills) && attrs.fills.length > 0)
}
export function auditSceneGraph(graph) {
  const violations = []
  const childOf = graph.edges.filter((e) => e.type === 'child-of')
  const composes = graph.edges.filter((e) => e.type === 'composes-chart')
  const childSet = new Set(childOf.map((e) => e.from))
  const composeSet = new Set(composes.map((e) => e.from))
  // 根节点（无 child-of 出边）允许无父
  for (const n of graph.nodes) {
    const k = n.disposition && n.disposition.kind
    // 处置完整
    if (!k || (!VALID.has(k) && !isExclude(k))) {
      violations.push({ rule: 'disposition-complete', id: n.id, name: n.name, detail: `非法/空 disposition: ${k}` })
    }
    if (k === 'exclude:unclassified') {
      violations.push({ rule: 'disposition-complete', id: n.id, name: n.name, detail: 'unclassified' })
    }
    // 可见性核对：有 fill 的 shape 不得 unclassified
    if (n.type === 'shape' && hasFill(n.attrs) && (k === 'exclude:unclassified' || !k)) {
      violations.push({ rule: 'visibility-check', id: n.id, name: n.name, detail: '有 fill/css 却未分类' })
    }
    // chart 成员须有 composes-chart 边
    if (k === 'chart-series-member' && !composeSet.has(n.id)) {
      violations.push({ rule: 'edge-complete', id: n.id, name: n.name, detail: 'chart-series-member 缺 composes-chart 边' })
    }
  }
  // 图表区闭合：每个 chart-zone 至少 1 个成员
  const zoneIds = graph.nodes.filter((n) => n.disposition && n.disposition.kind === 'chart-zone').map((n) => n.id)
  const memberTargets = new Set(composes.map((e) => e.to))
  for (const z of zoneIds) {
    if (!memberTargets.has(z)) violations.push({ rule: 'chart-zone-closed', id: z, detail: 'chart-zone 无成员' })
  }
  return { ok: violations.length === 0, violations, counts: { nodes: graph.nodes.length, violations: violations.length } }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const graph = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const r = auditSceneGraph(graph)
  fs.writeFileSync(process.argv[2].replace(/scene-graph\.json$/, '_scene_graph_audit.json'), JSON.stringify(r, null, 2))
  if (r.ok) { console.log('✅ 处置级完整性闸门通过', r.counts) }
  else { console.error('❌ 完整性闸门失败：', JSON.stringify(r.violations.slice(0, 30), null, 2)); process.exit(3) }
}
