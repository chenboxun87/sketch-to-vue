/**
 * 将 MasterGo MCP DSL / 人工 enrich JSON 合并进 DesignElement（零几何推断）
 */
import fs from 'fs'
import { cornerRadiusToCss } from './mastergo-normalize.mjs'

export function idFallbackFileName(nodeId) {
  return `${String(nodeId).replace(/:/g, '-')}.png`
}

/** MCP get_dsl 输出 { dsl: MGDSLData } → 取内层；已是 MGDSLData 则原样返回 */
export function normalizeDslPayload(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.dsl && typeof raw.dsl === 'object') return raw.dsl
  return raw
}

function flattenDslNodes(node, map) {
  if (!node || typeof node !== 'object') return
  if (node.id) map[node.id] = node
  for (const child of node.children || []) {
    if (typeof child === 'object') flattenDslNodes(child, map)
  }
}

/** nodeMap 优先；MCP 树形 nodes/root 时现场建索引 */
export function getDslNodeMap(dsl) {
  const root = normalizeDslPayload(dsl)
  if (!root) return {}
  if (root.nodeMap && Object.keys(root.nodeMap).length) return root.nodeMap

  const map = {}
  for (const n of root.nodes || []) flattenDslNodes(n, map)
  if (root.root) flattenDslNodes(root.root, map)
  return map
}

/** CssNodeStyle：value + layoutStyles + inlineStyles（见 dsl-structure.md） */
export function mergedDslStyle(node) {
  const s = node?.style || {}
  return {
    ...(s.layoutStyles || {}),
    ...(s.value || {}),
    ...(s.inlineStyles || {}),
    ...s,
  }
}

function parseBorderRadiusFromDslStyle(style) {
  if (!style || typeof style !== 'object') return undefined
  if (typeof style.borderRadius === 'string' && style.borderRadius.trim()) {
    return style.borderRadius.trim()
  }
  const r = style.borderTopLeftRadius
  if (r != null) {
    const tl = style.borderTopLeftRadius ?? r
    const tr = style.borderTopRightRadius ?? r
    const br = style.borderBottomRightRadius ?? r
    const bl = style.borderBottomLeftRadius ?? r
    return `${tl} ${tr} ${br} ${bl}`
  }
  return undefined
}

function dslNodeToRadiusPatch(node) {
  const style = mergedDslStyle(node)
  const css = parseBorderRadiusFromDslStyle(style)
  if (css !== undefined) {
    return {
      borderRadius: css,
      borderRadiusMeta: { source: 'dsl', field: 'style.value.borderRadius' },
      mgCornerRadiusRaw: css === '0px' || css === '0px 0px 0px 0px' ? 0 : node?.layout?.cornerRadius,
      dslStyleResolved: true,
    }
  }
  const layout = node?.layout
  if (layout?.cornerRadius != null && typeof layout.cornerRadius === 'number') {
    const n = { type: 'RECTANGLE', cornerRadius: layout.cornerRadius }
    const css2 = cornerRadiusToCss(n)
    if (css2 || layout.cornerRadius === 0) {
      return {
        borderRadius: css2 || '0px',
        borderRadiusMeta: { source: 'dsl', field: 'layout.cornerRadius' },
        mgCornerRadiusRaw: layout.cornerRadius,
        dslStyleResolved: true,
      }
    }
  }
  return null
}

function dslNodeToVectorPatch(node) {
  const style = mergedDslStyle(node)
  const clipPath = style.clipPath || node?.style?.value?.clipPath
  if (node?.vectorNetwork || clipPath) {
    return {
      dslVectorHint: true,
      dslClipPath: clipPath || null,
      dslStyleResolved: true,
    }
  }
  return null
}

/** SLICE / IMAGE tag → 标记 DSL 侧 export 意图（仍须磁盘文件或 id 回退 PNG） */
function dslNodeToExportHint(node) {
  if (node?.layerType === 'SLICE') {
    return { dslExportHint: { source: 'dsl', layerType: 'SLICE' } }
  }
  const tag = node?.style?.tag
  if (tag === 'IMG' || node?.style?.type === 'IMAGE') {
    return { dslExportHint: { source: 'dsl', tag: 'IMG' } }
  }
  return null
}

/**
 * @param {object} dsl - MGDSLData 或 MCP 包装 { dsl: MGDSLData }
 * @returns {{ applied: string[], missing: string[], nodeMapSize: number }}
 */
export function enrichElementsFromDsl(elements, dsl) {
  const nodeMap = getDslNodeMap(dsl)
  const applied = []
  const missing = []

  for (const el of elements) {
    const node = nodeMap[el.id]
    if (!node) continue

    const radiusPatch = dslNodeToRadiusPatch(node)
    const vectorPatch = dslNodeToVectorPatch(node)
    const exportHint = dslNodeToExportHint(node)

    if (radiusPatch) Object.assign(el, radiusPatch)
    if (vectorPatch) Object.assign(el, vectorPatch)
    if (exportHint) Object.assign(el, exportHint)

    if (radiusPatch || vectorPatch || exportHint) {
      applied.push(el.id)
    } else {
      missing.push(el.id)
    }
  }
  return { applied, missing, nodeMapSize: Object.keys(nodeMap).length }
}

/** 读取 `_dsl_enrich.json`：{ "11:6508": { "borderRadius": "20px 0 20px 20px" } } */
export function enrichElementsFromManualJson(elements, enrichMap) {
  const applied = []
  if (!enrichMap || typeof enrichMap !== 'object') return { applied }

  for (const el of elements) {
    const row = enrichMap[el.id]
    if (!row) continue
    if (row.borderRadius) {
      el.borderRadius = row.borderRadius
      el.borderRadiusMeta = { source: 'dsl-manual', field: 'borderRadius' }
      el.dslStyleResolved = true
      applied.push(el.id)
    }
    if (row.exportSlice) {
      el.manualExportSlice = row.exportSlice
      applied.push(el.id)
    }
  }
  return { applied }
}

export function loadDslFile(dslPath) {
  if (!dslPath || !fs.existsSync(dslPath)) return null
  const raw = JSON.parse(fs.readFileSync(dslPath, 'utf8'))
  return normalizeDslPayload(raw)
}

export function loadManualEnrichFile(outDir) {
  const fp = `${outDir}/_dsl_enrich.json`
  if (!fs.existsSync(fp)) return null
  return JSON.parse(fs.readFileSync(fp, 'utf8'))
}
