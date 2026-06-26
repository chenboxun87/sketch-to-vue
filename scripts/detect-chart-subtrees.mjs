// 子树图表检测（spec 4.4）。双信号：语义名 OR 几何同构（N 个等宽、x 等距的 rect）。
const NAME_RE = /(柱状图|趋势|占比|环形|饼|雷达|桑基|折线|面积|纵坐标|横坐标)/

function childrenOf(graph, parentId) {
  const ids = graph.edges.filter((e) => e.type === 'child-of' && e.to === parentId).map((e) => e.from)
  return graph.nodes.filter((n) => ids.includes(n.id))
}

// 几何同构：≥minBars 个 shape，宽度近似相等(±widthTolPx)，沿 x 单调递增
function isBarCluster(kids, opts) {
  const bars = kids.filter((n) => n.type === 'shape' && n.rect.w > 0 && n.rect.h > 0)
  if (bars.length < opts.minBars) return null
  const w0 = bars[0].rect.w
  if (!bars.every((b) => Math.abs(b.rect.w - w0) <= opts.widthTolPx)) return null
  const sorted = [...bars].sort((a, b) => a.rect.x - b.rect.x)
  return sorted
}

export function detectChartSubtrees(graph, opts = {}) {
  const o = { minBars: opts.minBars ?? 5, widthTolPx: opts.widthTolPx ?? 2 }
  const zones = []
  const members = new Set()
  const groups = graph.nodes.filter((n) => n.type === 'group' || n.type === 'symbol')
  for (const grp of groups) {
    const kids = childrenOf(graph, grp.id)
    const nameHit = NAME_RE.test(grp.name || '')
    const bars = isBarCluster(kids, o)
    if (!bars && !nameHit) continue
    if (!bars) continue // 名中但无柱簇 → 交给其他图表类型（本期只做 bar），跳过避免误报
    const maxH = Math.max(...bars.map((b) => b.rect.h)) || 1
    const series = bars.map((b) => Math.round((b.rect.h / maxH) * 1000) / 1000)
    const xs = bars.map((b) => b.rect.x), ys = bars.map((b) => b.rect.y)
    const x0 = Math.min(...xs), y0 = Math.min(...ys)
    const x1 = Math.max(...bars.map((b) => b.rect.x + b.rect.w))
    const y1 = Math.max(...bars.map((b) => b.rect.y + b.rect.h))
    const PAD = 20
    zones.push({
      anchorId: grp.id, chartType: 'bar', signal: nameHit ? 'name+geom' : 'geom',
      rect: { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + 2 * PAD, h: y1 - y0 + 2 * PAD },
      series, memberIds: bars.map((b) => b.id),
    })
    for (const b of bars) members.add(b.id)
  }
  return { zones, members }
}
