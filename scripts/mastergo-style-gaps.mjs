/**
 * MasterGo 样式数据完整性检测（禁止推断补全）
 */
import { cornerRadiusToCss, isMixedCornerRadius } from './mastergo-normalize.mjs'

export { isMixedCornerRadius }

/** FILE_DATA 是否含可消费的圆角（禁止几何/位置猜测） */
export function hasFileCornerRadius(node) {
  return !!cornerRadiusToCss(node)
}

/** 节点是否存在未解析的 mixed 圆角（MasterGo 有语义但导出包缺数值） */
export function hasUnresolvedMixedRadius(node) {
  if (!isMixedCornerRadius(node)) return false
  return !hasFileCornerRadius(node)
}

/** 从 extract 元素构造 gap 检测用 nodeLike（含 DSL enrich 后字段） */
export function nodeLikeFromElement(el) {
  const type =
    el.type === 'pen'
      ? 'PEN'
      : el.type === 'shape'
        ? 'RECTANGLE'
        : el.mgNodeType || el.type?.toUpperCase()
  const nodeLike = {
    type: el.mgNodeType === 'ELLIPSE' ? 'ELLIPSE' : type,
    cornerRadius: el.mgCornerRadiusRaw,
    rectangleCornerRadii: el.mgRectangleCornerRadii,
    isMaskOutline: el.isMaskOutline,
    fills: el.fills,
    borderRadiusMeta: el.borderRadiusMeta,
    dslVectorHint: el.dslVectorHint,
    dslClipPath: el.dslClipPath,
    dslStyleResolved: el.dslStyleResolved,
  }
  return nodeLike
}

/**
 * @returns {Array<{code:string,severity:'high'|'medium',hint?:string}>}
 */
export function detectStyleGaps(node) {
  const gaps = []
  const visual =
    node.type === 'PEN' ||
    node.type === 'RECTANGLE' ||
    node.type === 'ELLIPSE' ||
    (node.fills || []).some((f) => f.visible !== false && f.isVisible !== false)

  if (!visual) return gaps

  const dslRadiusResolved =
    node.dslStyleResolved &&
    (node.borderRadiusMeta?.source === 'dsl' || node.borderRadiusMeta?.source === 'dsl-manual')
  const dslVectorResolved = node.dslStyleResolved && (node.dslVectorHint || node.dslClipPath)

  if (hasUnresolvedMixedRadius(node) && !dslRadiusResolved && !dslVectorResolved) {
    gaps.push({
      code: 'MIXED_CORNER_RADIUS_UNRESOLVED',
      severity: 'high',
      hint:
        'FILE_DATA 中 cornerRadius=mixed 且 rectangleCornerRadii 全 null；' +
        '须在 MasterGo 为该层勾选 export，或使用 MCP get_dsl 补全，禁止 CSS 推断圆角',
    })
  }

  if (
    node.type === 'PEN' &&
    node.isMaskOutline &&
    !hasFileCornerRadius(node) &&
    !dslRadiusResolved &&
    !dslVectorResolved
  ) {
    gaps.push({
      code: 'PEN_MASK_OUTLINE_NO_RADIUS',
      severity: 'high',
      hint: 'isMaskOutline PEN 无 vectorNetwork/圆角数值；须 export 切片或 MCP DSL',
    })
  }

  return gaps
}

/** enrich 后重算 styleGaps（尊重 DSL 补全） */
export function detectStyleGapsForElement(el) {
  return detectStyleGaps(nodeLikeFromElement(el))
}

export function buildStyleGapsReport(elements) {
  const items = []
  for (const el of elements) {
    const gaps = detectStyleGapsForElement(el)
    if (gaps.length) {
      items.push({
        id: el.id,
        name: el.name,
        type: el.type,
        renderAs: el.renderAs,
        hasExportSlice: !!el.exportSlice,
        gaps,
      })
    }
  }
  const high = items.filter((i) => i.gaps.some((g) => g.severity === 'high'))
  return {
    total: items.length,
    highCount: high.length,
    items,
    ok: high.every((i) => i.hasExportSlice),
  }
}
