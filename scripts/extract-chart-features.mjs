// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
/**
 * extract-chart-features.mjs
 *
 * 从 MeaXure 导出数据中提取图表特征，产出 _chart_zones.json。
 *
 * 输入：
 *   - _all_elements.json  （元素树，含文字/切片/shape）
 *   - _layer_stack.json   （渲染层序列，含 rect/source）
 *   - chartPanels.json    （人工填写的面板配置，见 §2 手册）
 *
 * 产出：
 *   - _chart_zones.json   （ECharts zone 配置，供 buildBoardRenderPlan 消费）
 *
 * CLI:
 *   node extract-chart-features.mjs <dataDir> [chartPanels.json]
 */

import fs   from 'fs'
import path from 'path'
import { detectChartZones, inferChartType } from './chart-features/detect-zones.mjs'
import { extractAxis, extractCategories, extractLegend } from './chart-features/extract-features.mjs'

// ── 几何工具 ────────────────────────────────────────────────────────────────

function rectCenter(rect) {
  return { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 }
}

function inZone(rect, z) {
  if (!rect) return false
  const { cx, cy } = rectCenter(rect)
  const r = z.rect
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
}

// ── 假柱颜色提取（从 CSS 字符串解析首个背景色）──────────────────────────────

function extractBarColor(layer) {
  const css = (layer.source?.css || []).join(' ')
  // 纯色
  const solid = css.match(/background\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/i)
  if (solid) return solid[1]
  // 渐变起始色
  const grad = css.match(/linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/i)
  if (grad) return grad[1]
  return null
}

// ── 假柱判断（宽 4–18px，高 ≥30px，vector-css）──────────────────────────────

function isFakeBar(layer) {
  if (!layer.rect) return false
  if (layer.source?.kind !== 'vector-css') return false
  const { w, h } = layer.rect
  return w >= 4 && w <= 18 && h >= 30
}

// ── 从 layer_stack 提取 zone 内假柱的颜色调色板 ─────────────────────────────

function extractZonePalette(layers, zone) {
  const bars = layers.filter((l) => isFakeBar(l) && inZone(l.rect, zone))
  const seen  = new Set()
  const colors = []
  for (const bar of bars) {
    const c = extractBarColor(bar)
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase())
      colors.push(c)
    }
  }
  return colors.slice(0, 6)
}

// ── 从 layer_stack 提取 zone 内 vector 的签名（供 inferChartType 用）─────────

function buildVectorSigs(layers, zone) {
  return layers
    .filter((l) => l.source?.kind === 'vector-css' && inZone(l.rect, zone))
    .map((l) => {
      const css      = (l.source?.css || []).join(' ')
      const borderM  = css.match(/border\s*:\s*(\d+)px/i)
      return {
        w:         l.rect.w,
        h:         l.rect.h,
        borderPx:  borderM ? parseInt(borderM[1], 10) : 0,
        css,
      }
    })
}

// ── 核心：构建所有 chart zones ──────────────────────────────────────────────

/**
 * @param {Array} elements   all_elements（flat）
 * @param {Array} layers     layer_stack.layers
 * @param {{panels: Array}}  opts  chartPanels.json 内容
 * @returns {{ zones: Array }}
 */
export function buildChartZones(elements, layers, opts) {
  const allZones = []

  for (const panel of opts.panels || []) {
    const detected = detectChartZones(elements, {
      panelTitles: panel.titles || [],
      panelWidth:  panel.width,
      panelLeft:   panel.left,
      panelId:     panel.id    || null,
      chartType:   panel.chartType || null,   // 人工覆盖
      zoneHeight:  panel.zoneHeight || null,
      top:         panel.top != null ? panel.top : null,
    })

    for (const z of detected) {
      // ── 区内元素分析 ──────────────────────────────────────────────────────
      const inEls   = elements.filter((e) => inZone(e.rect, z))
      const texts   = inEls.filter((e) => e.type === 'text')
      const slices  = inEls
        .filter((e) => /slice/i.test(e.source?.kind || ''))
        .map((e) => ({ ext: (e.source?.file || '').split('.').pop().toLowerCase() }))
      const vectors = buildVectorSigs(layers, z)

      // ── 图表类型：panel 覆盖 > 自动推断 ──────────────────────────────────
      if (!z.chartType) {
        z.chartType = inferChartType({
          slices,
          texts: texts.map((t) => (t.content || '').trim()),
          vectors,
        }) || 'bar'
      }

      // ── 坐标轴 ────────────────────────────────────────────────────────────
      const xTexts = texts.filter(
        (e) =>
          /^\d{4}年?$|^[\u4e00-\u9fa5]{1,5}$|^\d{1,2}月?$/.test(
            (e.content || '').trim()
          ) && e.rect.y > z.rect.y + z.rect.h * 0.6
      )
      const yTexts = texts.filter((e) => e.rect.x < z.rect.x + 80)

      z.axis       = { yLeft: extractAxis(yTexts) }
      z.categories = panel.categories || extractCategories(xTexts)

      // ── 图例（含颜色）────────────────────────────────────────────────────
      // swatches：图例色块（小矩形 vector-css，w/h ≤ 14px）
      const swatches = layers
        .filter(
          (l) =>
            inZone(l.rect, z) &&
            l.source?.kind === 'vector-css' &&
            l.rect.w <= 14 &&
            l.rect.h <= 14
        )
        .map((l) => ({
          rect:  l.rect,
          color: extractBarColor(l) || '#888',
        }))

      z.legend = extractLegend(texts, swatches)

      // ── 调色板：panel 覆盖 > 假柱提取 > 图例色 ───────────────────────────
      z.palette =
        panel.palette ||
        extractZonePalette(layers, z) ||
        (z.legend || []).map((l) => l.color).filter(Boolean)

      // ── 系列名（panel 覆盖）───────────────────────────────────────────────
      if (panel.seriesNames && panel.seriesNames.length > 0) {
        z.legend = panel.seriesNames.map((name, i) => ({
          name,
          color: (z.palette || [])[i] || z.legend?.[i]?.color || '#888',
        }))
      }

      // ── sankey / radar 专用字段（mock 骨架）──────────────────────────────
      z.sankey  = null
      z.radar   = null
      z.series  = []

      // ── 排除层 ID（供 buildBoardRenderPlan 消费）─────────────────────────
      z.excludeLayerIds = layers
        .filter((l) => inZone(l.rect, z))
        .map((l) => l.id)

      allZones.push(z)
    }
  }

  return { zones: allZones }
}

// ── CLI 入口 ────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const dataDir    = process.argv[2]
  const panelsArg  = process.argv[3]

  if (!dataDir) {
    console.error('usage: extract-chart-features.mjs <dataDir> [chartPanels.json]')
    process.exit(1)
  }

  const elDoc    = JSON.parse(fs.readFileSync(path.join(dataDir, '_all_elements.json'), 'utf8'))
  const stackRaw = JSON.parse(fs.readFileSync(path.join(dataDir, '_layer_stack.json'),  'utf8'))
  const layers   = Array.isArray(stackRaw) ? stackRaw : (stackRaw.layers || [])
  const opts     = panelsArg
    ? JSON.parse(fs.readFileSync(panelsArg, 'utf8'))
    : { panels: [] }

  const out = buildChartZones(elDoc.elements || [], layers, opts)
  const outPath = path.join(dataDir, '_chart_zones.json')
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`chart zones: ${out.zones.length} → ${outPath}`)
  out.zones.forEach((z) =>
    console.log(`  [${z.confidence}] ${z.id}  type=${z.chartType}  palette=[${(z.palette || []).join(', ')}]`)
  )
}
