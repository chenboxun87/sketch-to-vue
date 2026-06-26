// 9 级 disposition 判定（spec 4.3）。纯函数，命中第一条即停。chartIndex={members:Set,zones:Set}。
const NUM_RE = /[0-9]/
// 「有可渲染样式」——不仅是填充，还包括描边/阴影/渐变。
// 关键教训：仅有 border（彩色描边/分隔线/直线）的 shape 也是有标注样式的可见元素，
// 必须当 render-vector 消费，绝不能因 fills 为空就判 ghost 丢弃（否则大量分隔线/描边框丢失）。
export function hasRenderableStyle(attrs) {
  if (Array.isArray(attrs.fills) && attrs.fills.length > 0) return true
  if (Array.isArray(attrs.borders) && attrs.borders.length > 0) return true
  if (Array.isArray(attrs.shadows) && attrs.shadows.length > 0) return true
  for (const decl of (attrs.css || [])) {
    const s = String(decl).toLowerCase()
    if (/background-image\s*:/.test(s)) return true
    if (/background\s*:/.test(s) && !s.includes('transparent') && !s.includes('rgba(0,0,0,0)')) return true
    if (/(^|[;\s])border\s*:\s*[\d.]+px/.test(s)) return true // 含宽度的实描边（排除 border-radius）
    if (/linear-gradient|radial-gradient/.test(s)) return true
    if (/box-shadow\s*:/.test(s)) return true
  }
  return false
}
export function classifyDisposition(node, graph, chartIndex = {}) {
  const a = node.attrs || {}
  const zones = chartIndex.zones || new Set()
  const members = chartIndex.members || new Set()
  // 1 图表区锚点（必须先于 container 判断，防止 group 锚点被 isContainer 截断）
  if (zones.has(node.id)) return { kind: 'chart-zone', reason: '图表区锚点', confidence: 'derived' }
  // 2 容器（group/symbol，含视觉填充；fill 信息由 attrs 保留供消费方使用）
  if (a.isContainer) return { kind: 'container', reason: 'group/symbol 容器', confidence: 'native' }
  // 3 图表成员
  if (members.has(node.id)) return { kind: 'chart-series-member', reason: '图表子树成员', confidence: 'derived' }
  // 4/5 切片
  if (Array.isArray(a.exports) && a.exports.length) {
    return a._sliceOnDisk
      ? { kind: 'render-slice', reason: 'exportable 切片在盘', confidence: 'native' }
      : { kind: 'exclude:missing-slice', reason: 'exportable 声明但文件缺失', confidence: 'native' }
  }
  // 6 文本
  if (node.type === 'text') {
    const dyn = NUM_RE.test(String(a.content || ''))
    return dyn
      ? { kind: 'live-text-dynamic', reason: `数值内容「${a.content}」`, confidence: 'derived' }
      : { kind: 'live-text-static', reason: '静态文本', confidence: 'native' }
  }
  // 7 矢量（fill / border / shadow / gradient 任一可渲染样式）
  if (node.type === 'shape' && hasRenderableStyle(a)) return { kind: 'render-vector', reason: 'shape 有可渲染样式(fill/border/shadow/gradient)', confidence: 'native' }
  // 8 ghost（无任何可渲染样式：图片填充未导出 / 纯 transform·opacity 占位）
  if (node.type === 'shape') return { kind: 'exclude:ghost', reason: '无可渲染样式（图片填充未导出，仅 transform/opacity 占位）', confidence: 'derived' }
  // 9 兜底（闸门会因此 fail）
  return { kind: 'exclude:unclassified', reason: '未命中任何判据', confidence: 'uncertain' }
}
