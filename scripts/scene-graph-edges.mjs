// 派生语义边（spec 4.1/4.2）。confidence: native(shares-style) / derived(same-asset,occluded-by) / uncertain(masks)。
function centerIn(inner, outer) {
  const cx = inner.x + inner.w / 2, cy = inner.y + inner.h / 2
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h
}
function firstExportPath(attrs) {
  const ex = attrs && attrs.exports
  return Array.isArray(ex) && ex.length ? ex[0].path : null
}
export function deriveEdges(graph) {
  const out = []
  const ns = graph.nodes
  // shares-style（同 styleName，无向取一条）
  const byStyle = new Map()
  for (const n of ns) {
    const s = n.attrs && n.attrs.styleName
    if (!s) continue
    if (!byStyle.has(s)) byStyle.set(s, [])
    byStyle.get(s).push(n.id)
  }
  for (const [, ids] of byStyle) {
    for (let i = 0; i + 1 < ids.length; i++) out.push({ type: 'shares-style', from: ids[i], to: ids[i + 1], confidence: 'native' })
  }
  // same-asset（同 export path，无向取一条）
  const byAsset = new Map()
  for (const n of ns) {
    const p = firstExportPath(n.attrs)
    if (!p) continue
    if (!byAsset.has(p)) byAsset.set(p, [])
    byAsset.get(p).push(n.id)
  }
  for (const [, ids] of byAsset) {
    for (let i = 0; i + 1 < ids.length; i++) out.push({ type: 'same-asset', from: ids[i], to: ids[i + 1], confidence: 'derived' })
  }
  // occluded-by（中心落在更大切片内，且非自身/同一资源）
  const slices = ns.filter((n) => firstExportPath(n.attrs))
  for (const n of ns) {
    for (const sl of slices) {
      if (sl.id === n.id) continue
      const aN = sl.rect.w * sl.rect.h, an = n.rect.w * n.rect.h
      if (aN > an && centerIn(n.rect, sl.rect)) { out.push({ type: 'occluded-by', from: n.id, to: sl.id, confidence: 'derived' }); break }
    }
  }
  // masks（名叫"蒙版"→ 推断裁剪其同级；导出已丢 clip 标志 → uncertain）
  const childOf = graph.edges.filter((e) => e.type === 'child-of')
  for (const n of ns) {
    if ((n.name || '').trim() !== '蒙版') continue
    const parent = childOf.find((e) => e.from === n.id)
    const siblings = parent ? childOf.filter((e) => e.to === parent.to && e.from !== n.id).map((e) => e.from) : []
    for (const sib of siblings) out.push({ type: 'masks', from: n.id, to: sib, confidence: 'uncertain' })
  }
  return out
}
