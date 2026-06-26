// 图表区检测：section 标题锚定（high）+ 假柱聚类兜底（low）+ 类型推断。

const TITLE_HEIGHT = 44
const ZONE_DEFAULT_H = 312

/**
 * 类型推断（确定性签名）。
 *
 * sig.vectors 的每个元素由调用方从 shape layer 提取，包含：
 *   { w, h, borderPx, css }   ← css 是完整 CSS 字符串（已 join）
 *
 * @param {{slices:Array, texts:string[], vectors:Array}} sig
 * @returns {'radar'|'sankey'|'area'|'dualLine'|'multiLine'|'line'|'groupBar'|'dualAxisBar'|'bar'|null}
 */
export function inferChartType(sig) {
  const slices  = sig.slices  || []
  const vectors = sig.vectors || []
  const texts   = sig.texts   || []

  // ── 雷达：面板内 jpg/png 切片（多边形图片）+ 3–8 维度文字 ─────────────────
  if (
    slices.some((s) => /jpe?g|png/i.test(s.ext || '')) &&
    texts.length >= 3 &&
    texts.length <= 8
  ) {
    return 'radar'
  }

  // ── 桑基：多个 border:Npx 描边路径（节点矩形）──────────────────────────────
  const borderPaths = vectors.filter((v) => (v.borderPx || 0) > 5)
  if (borderPaths.length >= 6) return 'sankey'

  // ── 面积图：底部大渐变 div（linear-gradient 且高宽比 < 0.5）────────────────
  // 修复：原代码检查 v.areaGradient（永不设置）；改为从 css 字符串检测渐变
  const areaGradientVectors = vectors.filter((v) => {
    const css = v.css || ''
    return (
      /linear-gradient/i.test(css) &&
      v.h > 0 && v.w > 0 &&
      v.h / v.w < 0.6   // 宽扁矩形（宽远大于高）
    )
  })
  if (areaGradientVectors.length >= 1) {
    // 进一步区分：区内折线点数量决定单线/双线/多线
    const linePoints = vectors.filter((v) => v.w < 10 && v.h < 10)
    if      (linePoints.length === 0)  return 'area'
    // 有折线点序列且有面积渐变 → area（带线的面积图）
    return 'area'
  }

  // ── 折线 / 双折线 / 多系列折线（无面积填充）──────────────────────────────────
  // 修复：原代码检查 v.polyline（永不设置）；改为检测线段路径（height ≤ 4, width > 30）
  const lineSegments = vectors.filter((v) => {
    const css = v.css || ''
    // 线段特征：高度很小（≤6px）且宽度大（>30px）；或含 border-top/bottom 而无背景
    return (v.h <= 6 && v.w > 30) ||
           /border-(?:top|bottom)\s*:/.test(css)
  })
  if (lineSegments.length >= 2) {
    // 通过颜色去重估算系列数
    const colors = new Set(
      lineSegments
        .map((v) => {
          const m = (v.css || '').match(/(?:border(?:-top)?|background)\s*:\s*(#[0-9a-fA-F]{3,8})/i)
          return m ? m[1].toLowerCase() : null
        })
        .filter(Boolean)
    )
    const seriesCount = colors.size || 1
    if (seriesCount === 2) return 'dualLine'
    if (seriesCount >= 3)  return 'multiLine'
    return 'line'
  }

  // ── 柱图：等距小柱（4–18px 宽，h≥30px）─────────────────────────────────────
  const bars = vectors.filter((v) => v.w >= 4 && v.w <= 18 && v.h >= 30)

  if (bars.length >= 12) {
    // 12+ 根柱：按颜色去重判断是分组柱还是单系列
    const barColors = new Set(
      bars
        .map((v) => {
          const m = (v.css || '').match(/background\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/i)
          return m ? m[1].toLowerCase() : null
        })
        .filter(Boolean)
    )
    return barColors.size >= 2 ? 'groupBar' : 'bar'
  }
  if (bars.length >= 4) return 'bar'

  return null
}

/**
 * 标题锚定图表区。支持从 panel 配置中读取覆盖值（chartType/zoneHeight/top/id）。
 *
 * @param {Array} elements all_elements
 * @param {{
 *   panelTitles: string[],
 *   panelWidth:  number,
 *   panelLeft:   number,
 *   panelId?:    string,      // zone id 覆盖（不填则用标题文字）
 *   chartType?:  string,      // chartType 覆盖（不填则走 inferChartType）
 *   zoneHeight?: number,      // 图表绘图区高度覆盖（不填用 ZONE_DEFAULT_H）
 *   top?:        number,      // zone top 绝对坐标覆盖（不填从标题 y 计算）
 * }} opts
 * @returns {Array} zones（rect + title + confidence）
 */
export function detectChartZones(elements, opts) {
  const titles = opts.panelTitles || []
  const zones  = []

  for (const t of titles) {
    const titleEl = elements.find(
      (e) => e.type === 'text' &&
             (e.content || '').replace(/\s/g, '').includes(t.replace(/\s/g, ''))
    )

    // 计算 zone top：覆盖值 > 从标题推算 > 无标题时跳过
    let zoneTop = opts.top != null ? opts.top : null
    if (zoneTop == null) {
      if (!titleEl) continue
      zoneTop = titleEl.rect.y + TITLE_HEIGHT
    }

    const zoneH = opts.zoneHeight != null ? opts.zoneHeight : ZONE_DEFAULT_H
    const zoneId = opts.panelId != null
      ? opts.panelId
      : t.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '-').toLowerCase()

    zones.push({
      id:          zoneId,
      title:       t,
      chartType:   opts.chartType || null,   // null → 后续由 inferChartType 填充
      rect: {
        x: opts.panelLeft,
        y: zoneTop,
        w: opts.panelWidth,
        h: zoneH,
      },
      confidence:  titleEl ? 'high' : 'low',
      needsConfirm: !titleEl,
    })
  }
  return zones
}
