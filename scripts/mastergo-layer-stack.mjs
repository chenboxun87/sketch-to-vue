/**
 * MasterGo layer stack + consume audit
 */
import fs from 'fs'
import path from 'path'

export const DEFAULT_DYNAMIC_ZONES = []

function rectInside(inner, outer, tol = 1) {
  if (!inner || !outer) return false
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  )
}

/** 父 FRAME 已 export 切片时，跳过被完全包住的子层，避免双渲染（如 收起 1463 + 路径 1466） */
export function skipRedundantDescendantsOfSliceParents(elements) {
  const byId = Object.fromEntries(elements.map((e) => [e.id, e]))
  for (const el of elements) {
    if (el.renderAs === 'skip' || !el.parentId) continue
    const parent = byId[el.parentId]
    if (
      parent &&
      parent.renderAs === 'img' &&
      parent.exportSlice &&
      rectInside(el.rect, parent.rect)
    ) {
      el.renderAs = 'skip'
      el.skipReason = 'redundant-under-parent-export-slice'
    }
  }
}

export function loadDynamicZones(outDir) {
  const fp = path.join(outDir, '_dynamic_zones.json')
  if (!outDir || !fs.existsSync(fp)) return DEFAULT_DYNAMIC_ZONES
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'))
    return Array.isArray(raw) ? raw : raw.zones || DEFAULT_DYNAMIC_ZONES
  } catch {
    return DEFAULT_DYNAMIC_ZONES
  }
}

export function buildLayerStack(elements, dynamicZones = DEFAULT_DYNAMIC_ZONES) {
  const excluded = new Set()
  for (const zone of dynamicZones) {
    for (const id of zone.elementIds || []) excluded.add(id)
  }

  const layers = elements
    .filter((e) => e.renderAs !== 'skip')
    .sort((a, b) => a.z - b.z)
    .map((e) => ({
      elementId: e.id,
      kind: e.type,
      z: e.z,
      renderAs: e.renderAs,
      excludeFromVueDecor: excluded.has(e.id),
    }))

  return {
    layers,
    dynamicZones,
    decorCount: layers.filter((l) => !l.excludeFromVueDecor).length,
    excludedCount: layers.filter((l) => l.excludeFromVueDecor).length,
  }
}

export function buildMgConsumeAudit(elements, stack, assetMap = {}) {
  const blockers = []
  const imagesMissing = elements.filter(
    (e) => e.type === 'image' && !assetMap[e.id] && !e.exportSlice
  )
  if (imagesMissing.length) {
    blockers.push({
      code: 'IMAGE_MISSING_EXPORT',
      severity: 'high',
      ids: imagesMissing.map((e) => e.id),
    })
  }

  const rawEffects = elements.filter((e) =>
    (e.effects || []).some((fx) => fx.raw)
  )
  if (rawEffects.length) {
    blockers.push({
      code: 'EFFECTS_RAW_UNPARSED',
      severity: 'high',
      count: rawEffects.length,
    })
  }

  const mixedNoSeg = elements.filter(
    (e) => e.type === 'text' && e.isMixedText && !(e.richTextSegments || []).length
  )
  if (mixedNoSeg.length) {
    blockers.push({
      code: 'MIXED_TEXT_NO_SEGMENTS',
      severity: 'medium',
      ids: mixedNoSeg.map((e) => e.id),
    })
  }

  const inferredRadius = elements.filter((e) => e.borderRadiusMeta?.source === 'inferred')
  if (inferredRadius.length) {
    blockers.push({
      code: 'INFERRED_STYLE_FORBIDDEN',
      severity: 'high',
      message: '禁止推断补全样式；须加强 extract 或使用 export/MCP',
      ids: inferredRadius.map((e) => e.id),
    })
  }

  const styleGapItems = elements.filter((e) => (e.styleGaps || []).some((g) => g.severity === 'high'))
  const styleGapUnresolved = styleGapItems.filter((e) => !e.exportSlice)
  if (styleGapUnresolved.length) {
    blockers.push({
      code: 'STYLE_DATA_INCOMPLETE',
      severity: 'high',
      message: 'FILE_DATA 样式不完整且无 export 切片；须在 MasterGo 勾选 export 或 MCP get_dsl',
      items: styleGapUnresolved.map((e) => ({
        id: e.id,
        name: e.name,
        gaps: e.styleGaps,
      })),
    })
  }

  const stackIds = new Set(stack.layers.map((l) => l.elementId))
  const unstacked = elements.filter(
    (e) => e.renderAs !== 'skip' && !stackIds.has(e.id)
  )

  const highBlockers = blockers.filter((b) => b.severity === 'high')

  return {
    elementsTotal: elements.length,
    stackTotal: stack.layers.length,
    decorLayers: stack.decorCount,
    dynamicExcluded: stack.excludedCount,
    imagesWithoutExport: imagesMissing.length,
    effectsInnerShadowCount: elements.reduce(
      (n, e) => n + (e.effects || []).filter((x) => x.type === 'inner_shadow').length,
      0
    ),
    effectsBackgroundBlurCount: elements.reduce(
      (n, e) => n + (e.effects || []).filter((x) => x.type === 'background_blur').length,
      0
    ),
    strokesCount: elements.reduce((n, e) => n + (e.strokes || []).length, 0),
    mixedTextWithFallback: elements.filter((e) => e.richTextFallback).length,
    unstackedRenderables: unstacked.map((e) => e.id),
    blockers,
    ok: highBlockers.length === 0 && unstacked.length === 0,
  }
}
