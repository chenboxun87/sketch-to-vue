// 交付前消费审计：校验结果，不限实现方式（地板非天花板）。

/**
 * @param {Object} p
 * @param {Array} p.layers          layer_stack
 * @param {{zones:Array}} p.zones   _chart_zones.json
 * @param {Object} p.gaps           _render_gaps_report.json（含 degenerateBorderPaths/blendHints）
 * @param {string[]} p.consumedIds  Index.vue 实际渲染的图层 id
 * @param {string[]} p.appliedBlendIds 实际加了 mix-blend-mode 的图层 id
 * @returns {{ok:boolean, issues:Array}}
 */
export function auditConsumption(p) {
  const issues = []
  const excluded = new Set()
  for (const z of p.zones?.zones || []) {
    for (const id of z.excludeLayerIds || []) excluded.add(id)
  }
  const consumed = new Set(p.consumedIds || [])
  const degenerate = new Set((p.gaps?.degenerateBorderPaths || []).map((d) => d.id))

  // 每层：已渲染 / 已排除（图表区）/ 退化跳过 —— 三选一
  for (const l of p.layers || []) {
    if (consumed.has(l.id) || excluded.has(l.id) || degenerate.has(l.id)) continue
    issues.push({ type: 'unconsumed-layer', id: l.id })
  }
  // 退化路径不应被渲染
  for (const id of degenerate) {
    if (consumed.has(id)) issues.push({ type: 'degenerate-rendered', id })
  }
  // high zone 必须已接 ECharts（rendered:true）
  for (const z of p.zones?.zones || []) {
    if (z.confidence === 'high' && !z.rendered) issues.push({ type: 'chart-zone-no-echarts', id: z.id })
    if (z.needsConfirm) issues.push({ type: 'zone-needs-confirm', id: z.id })
  }
  // blend 提示必须已应用
  const appliedBlend = new Set(p.appliedBlendIds || [])
  for (const b of p.gaps?.blendHints || []) {
    if (!appliedBlend.has(b.id)) issues.push({ type: 'missing-blend', id: b.id, blendMode: b.blendMode })
  }
  return { ok: issues.length === 0, issues }
}
