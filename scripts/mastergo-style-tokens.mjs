/**
 * MasterGo 全局 style token 解析
 */
import { mgColorToHex, mgGradientToCss } from '../templates/shared/textStyle.mjs'

export function buildStyleTokenMap(fileData) {
  const map = {}
  const styles = fileData?.styles || {}
  for (const bucket of Object.values(styles)) {
    if (!Array.isArray(bucket)) continue
    for (const style of bucket) {
      const rawItems = style.items ?? style.styles ?? []
      const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : []
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const id = item.id || style.id
        if (!id) continue
        if (item.type === 'SOLID' && item.color) {
          map[id] = { type: 'solid', css: mgColorToHex(item.color) }
        } else if (item.type === 'GRADIENT_LINEAR' || item.type === 'GRADIENT_RADIAL') {
          map[id] = { type: 'gradient', css: mgGradientToCss(item) }
        }
      }
    }
  }
  return map
}

export function resolveFillsWithTokens(fills, tokenMap) {
  return (fills || []).map((f) => {
    if (f.colorStyleId && tokenMap[f.colorStyleId]) {
      const tok = tokenMap[f.colorStyleId]
      if (tok.type === 'solid') {
        return { ...f, type: 'SOLID', color: parseHexToMgColor(tok.css) }
      }
    }
    return f
  })
}

function parseHexToMgColor(hex) {
  if (!hex || typeof hex !== 'string') return { r: 1, g: 1, b: 1, a: 1 }
  const h = hex.replace('#', '')
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: 1,
    }
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: parseInt(h.slice(6, 8), 16) / 255,
    }
  }
  return { r: 1, g: 1, b: 1, a: 1 }
}
