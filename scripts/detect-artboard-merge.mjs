// 多画板覆盖检测：识别"互补拆分"（一板有背景、一板有面板）。

import fs from 'fs'
import path from 'path'

/**
 * @param {Array<{index,coverage,centerCoverage,hasFullBg}>} coverages
 * @returns {Object} _artboard_merge_plan.json 内容
 */
export function planArtboardMerge(coverages) {
  if (!Array.isArray(coverages) || coverages.length <= 1) {
    return { multiArtboard: false, strategy: 'single', base: coverages?.[0]?.index ?? 0, overlays: [] }
  }
  // 找背景最全的板为底
  const base = [...coverages].sort((a, b) => (b.centerCoverage || 0) - (a.centerCoverage || 0))[0]
  // 其余板若中心覆盖低（缺背景）但整体有内容 → 作为面板 overlay
  const overlays = coverages
    .filter((c) => c.index !== base.index && (c.centerCoverage || 0) < (base.centerCoverage || 0) - 0.3)
    .map((c) => ({ from: c.index, filter: 'panels', zOffset: 2000 }))
  if (overlays.length === 0) {
    return { multiArtboard: true, strategy: 'pick-best', base: base.index, overlays: [] }
  }
  return {
    multiArtboard: true,
    strategy: 'complementary-merge',
    base: base.index,
    overlays,
    reason: `artboard${base.index} 中心背景最全；其余板缺中心背景但含面板内容`,
  }
}

// CLI: detect-artboard-merge.mjs <dataDir>
// Reads _artboard_coverage.json from dataDir, outputs _artboard_merge_plan.json
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const dataDir = process.argv[2]
  if (!dataDir) {
    console.error('usage: detect-artboard-merge.mjs <dataDir>')
    process.exit(1)
  }
  const covFile = path.join(dataDir, '_artboard_coverage.json')
  if (!fs.existsSync(covFile)) {
    console.error('_artboard_coverage.json not found. Run measure-artboard-coverage.mjs first.')
    process.exit(1)
  }
  const coverages = JSON.parse(fs.readFileSync(covFile, 'utf8'))
  const plan = planArtboardMerge(coverages)
  const outFile = path.join(dataDir, '_artboard_merge_plan.json')
  fs.writeFileSync(outFile, JSON.stringify(plan, null, 2))
  console.log('merge plan:', plan.strategy, '→', outFile)
}
