// 自动计算 artboard 的覆盖率指标，供 detect-artboard-merge 使用。
// 免去人工估算 centerCoverage，让多画板合并决策完全自动化。

import fs from 'fs'
import path from 'path'

/**
 * 计算单个 artboard 的覆盖率指标。
 *
 * @param {Array<{rect:{x,y,w,h}}>} layers  _layer_stack.json 数组
 * @param {{boardW:number, boardH:number, centerZone?:[number,number]}} opts
 *   centerZone: [leftFrac, rightFrac]，默认 [0.2, 0.8]（画板宽度的 20%~80% 为中心区）
 * @returns {{
 *   totalLayers: number,
 *   coverage: number,       // 有矩形的图层占比（0-1）
 *   centerCoverage: number, // 中心区图层占比（0-1）
 *   hasFullBg: boolean,     // 是否存在大背景图层（w > 60% boardW 且 h > 60% boardH）
 * }}
 */
export function measureCoverage(layers, opts) {
  const boardW = opts.boardW || 1920
  const boardH = opts.boardH || 1080
  const [cLeft, cRight] = opts.centerZone || [0.2, 0.8]
  const centerXMin = boardW * cLeft
  const centerXMax = boardW * cRight

  const withRect = layers.filter((l) => l.rect && l.rect.w > 0 && l.rect.h > 0)
  const total = withRect.length
  if (total === 0) return { totalLayers: 0, coverage: 0, centerCoverage: 0, hasFullBg: false }

  // 中心区：图层中心点 x 落在 [centerXMin, centerXMax]
  const centerLayers = withRect.filter((l) => {
    const cx = l.rect.x + l.rect.w / 2
    return cx >= centerXMin && cx <= centerXMax
  })

  // 大背景：任一图层 w > 50% boardW 且 h > 50% boardH
  const hasFullBg = withRect.some(
    (l) => l.rect.w >= boardW * 0.5 && l.rect.h >= boardH * 0.5
  )

  return {
    totalLayers: total,
    coverage: total / (layers.length || 1),
    centerCoverage: centerLayers.length / total,
    hasFullBg,
  }
}

// CLI: measure-artboard-coverage.mjs <dataDir> [boardW] [boardH]
// dataDir 下应有 artboard0/, artboard1/, ... 子目录，各含 _layer_stack.json
// 或 dataDir 本身含 _layer_stack.json（单画板模式）
// 产出 dataDir/_artboard_coverage.json
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const dataDir = process.argv[2]
  if (!dataDir) {
    console.error('usage: measure-artboard-coverage.mjs <dataDir> [boardW] [boardH]')
    process.exit(1)
  }
  const boardW = parseInt(process.argv[3] || '1920', 10)
  const boardH = parseInt(process.argv[4] || '1080', 10)

  // 探测模式：单画板 或 多画板子目录
  const singleFile = path.join(dataDir, '_layer_stack.json')
  const coverages = []

  if (fs.existsSync(singleFile)) {
    // 单画板
    const raw = JSON.parse(fs.readFileSync(singleFile, 'utf8'))
    const layers = Array.isArray(raw) ? raw : (raw.layers || [])
    const cov = measureCoverage(layers, { boardW, boardH })
    coverages.push({ index: 0, ...cov })
  } else {
    // 多画板子目录 artboard0/, artboard1/, ...
    let i = 0
    while (true) {
      const sub = path.join(dataDir, `artboard${i}`, '_layer_stack.json')
      if (!fs.existsSync(sub)) break
      const raw = JSON.parse(fs.readFileSync(sub, 'utf8'))
      const layers = Array.isArray(raw) ? raw : (raw.layers || [])
      const cov = measureCoverage(layers, { boardW, boardH })
      coverages.push({ index: i, ...cov })
      i++
    }
    if (coverages.length === 0) {
      console.error('no _layer_stack.json found in', dataDir, 'or artboard0/ subdirectory')
      process.exit(1)
    }
  }

  const outFile = path.join(dataDir, '_artboard_coverage.json')
  fs.writeFileSync(outFile, JSON.stringify(coverages, null, 2))
  console.log('coverage results:')
  coverages.forEach((c) =>
    console.log(`  artboard${c.index}: total=${c.totalLayers} coverage=${c.coverage.toFixed(2)} center=${c.centerCoverage.toFixed(2)} hasFullBg=${c.hasFullBg}`)
  )
  console.log('→', outFile)
}
