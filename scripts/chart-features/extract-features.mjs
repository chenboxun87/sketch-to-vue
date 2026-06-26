import { parseColor } from '../../templates/shared/colorParse.mjs'

const UNIT_RE = /^(万?t?ce|万?tCO|tco2|tCO₂|tce\/亿元|tco2\/亿元|tCO₂\/亿元|tco2e|tCO₂e|万tce|万tCO₂|%|次|tce\/万元)/i

/**
 * 从 Y 轴刻度 text 反推 max/interval/unit。
 * @param {Array<{content,rect}>} texts 区内（或轴附近）文字
 */
export function extractAxis(texts) {
  const nums = []
  let unit = null
  for (const t of texts) {
    const s = (t.content || '').trim()
    if (/^\d+(\.\d+)?$/.test(s)) nums.push({ v: parseFloat(s), y: t.rect.y })
    else if (UNIT_RE.test(s) && !unit) unit = s
  }
  if (nums.length < 2) return { max: null, interval: null, unit }
  const vals = [...new Set(nums.map((n) => n.v))].sort((a, b) => a - b)
  const max = vals[vals.length - 1]
  const diffs = []
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1])
  diffs.sort((a, b) => a - b)
  const interval = diffs[Math.floor(diffs.length / 2)] // 中位差
  return { max, interval, unit, ticks: vals }
}

/**
 * X 轴类目（按 x 排序，去重）。
 */
export function extractCategories(texts) {
  return texts
    .slice()
    .sort((a, b) => a.rect.x - b.rect.x)
    .map((t) => (t.content || '').trim())
    .filter(Boolean)
}

/**
 * 图例：色块（小矩形）与最近文字配对。
 * @param {Array<{content,rect}>} texts
 * @param {Array<{rect,color}>} swatches 小色块（带已解析或原始 color）
 */
export function extractLegend(texts, swatches) {
  const legend = []
  for (const sw of swatches) {
    const cx = sw.rect.x + sw.rect.w / 2
    const cy = sw.rect.y + sw.rect.h / 2
    let best = null, bestD = Infinity
    for (const t of texts) {
      const tx = t.rect.x
      const ty = t.rect.y + (t.rect.h || 0) / 2
      const d = Math.hypot(tx - cx, ty - cy)
      if (tx >= cx && Math.abs(ty - cy) < 30 && d < bestD) { best = t; bestD = d }
    }
    if (best) legend.push({ name: (best.content || '').trim(), color: parseColor(sw.color) })
  }
  return legend
}
