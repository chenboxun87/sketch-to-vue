/**
 * MasterGo FILE_DATA 节点 → DesignElement 全量归一化
 */
import {
  mgColorToHex,
  mgGradientToCss,
} from '../templates/shared/textStyle.mjs'
import { buildStyleTokenMap, resolveFillsWithTokens } from './mastergo-style-tokens.mjs'
import { extractRichTextSegments } from './mastergo-rich-text.mjs'

export { mgColorToHex, mgGradientToCss }

export function mapMgType(type) {
  switch (type) {
    case 'TEXT': return 'text'
    case 'RECTANGLE':
    case 'ELLIPSE': return 'shape'
    case 'PEN': return 'pen'
    case 'FRAME':
    case 'GROUP': return 'frame'
    default: return 'shape'
  }
}

function rgbaFromMg(c) {
  if (!c) return 'rgba(0,0,0,0.3)'
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const a = c.a !== undefined ? c.a : 1
  return `rgba(${r},${g},${b},${a})`
}

export function normalizeMgFills(fills, styleTokenMap) {
  if (!fills || !fills.length) return []
  const resolved = styleTokenMap ? resolveFillsWithTokens(fills, styleTokenMap) : fills
  return resolved.filter((f) => f.visible !== false).map((f) => {
    if (f.type === 'SOLID') {
      return { type: 'solid', color: mgColorToHex(f.color) }
    }
    if (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') {
      return {
        type: 'gradient',
        css: mgGradientToCss(f),
        stops: (f.gradientStops || []).map((s) => ({
          position: s.position,
          color: mgColorToHex(s.color),
        })),
      }
    }
    if (f.type === 'IMAGE') {
      return { type: 'image', imageRef: f.imageRef || null, scaleMode: f.scaleMode }
    }
    return { type: String(f.type || 'unknown').toLowerCase() }
  })
}

export function normalizeMgStrokes(strokes, strokeWeight, strokeAlign) {
  if (!strokes || !strokes.length) return []
  const w = strokeWeight || 1
  const align = strokeAlign || 'INSIDE'
  return strokes
    .filter((s) => s.visible !== false && s.isVisible !== false && s.type === 'SOLID' && s.color)
    .map((s) => ({
      color: mgColorToHex(s.color),
      weight: w,
      align,
    }))
}

function isMixedCornerRadius(node) {
  const cr = node.cornerRadius
  if (cr == null) return false
  if (typeof cr === 'number') return false
  return String(cr).includes('mixed')
}

/** 仅消费 FILE_DATA 显式字段；禁止几何/位置推断 */
export function cornerRadiusToCss(node) {
  if (node.type === 'ELLIPSE') {
    return '50%'
  }
  if (node.cornerRadius !== undefined && typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    return `${node.cornerRadius}px`
  }
  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii.map((v) => (v == null ? 0 : v))
    if (tl === tr && tr === br && br === bl) {
      return tl > 0 ? `${tl}px` : null
    }
    const parts = `${tl}px ${tr}px ${br}px ${bl}px`
    return parts === '0px 0px 0px 0px' ? null : parts
  }
  return null
}

export { isMixedCornerRadius }

export function strokesToCss(strokes) {
  if (!strokes || !strokes.length) return null
  const s = strokes[0]
  return `${s.weight || 1}px solid ${s.color}`
}

export function normalizeMgEffects(effects) {
  if (!effects || !effects.length) return []
  const out = []
  for (const e of effects) {
    if (e.visible === false || e.isVisible === false) continue
    if (e.type === 'DROP_SHADOW') {
      out.push({
        type: 'drop_shadow',
        offsetX: e.offset?.x || 0,
        offsetY: e.offset?.y || 0,
        blurRadius: e.radius || 0,
        spread: e.spread || 0,
        color: { 'css-rgba': rgbaFromMg(e.color) },
      })
    } else if (e.type === 'INNER_SHADOW') {
      out.push({
        type: 'inner_shadow',
        offsetX: e.offset?.x || 0,
        offsetY: e.offset?.y || 0,
        blurRadius: e.radius || 0,
        spread: e.spread || 0,
        color: { 'css-rgba': rgbaFromMg(e.color) },
      })
    } else if (e.type === 'LAYER_BLUR') {
      out.push({ type: 'layer_blur', blurRadius: e.radius || 0 })
    } else if (e.type === 'BACKGROUND_BLUR') {
      out.push({ type: 'background_blur', blurRadius: e.radius || 0 })
    }
  }
  return out
}

function hasVisualContent(node, fills, effects, strokes) {
  if (fills?.length || effects?.length || strokes?.length) return true
  if (node.type === 'TEXT' && node.characters) return true
  return false
}

function inferRenderAs(node, type, fills, rect) {
  if (node.type === 'TEXT') return 'text'
  if (type === 'image') return 'img'
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    return hasVisualContent(node, node.fills, node.effects, node.strokes) ? 'div' : 'skip'
  }
  if (node.type === 'PEN' || node.type === 'RECTANGLE' || node.type === 'ELLIPSE') return 'div'
  return 'div'
}

export function nodeToDesignElement(node, originX, originY, z, ctx = {}) {
  const b = node.absoluteBoundingBox
  const rect = b
    ? {
        x: Math.round(b.x - originX),
        y: Math.round(b.y - originY),
        w: Math.round(b.width),
        h: Math.round(b.height),
      }
    : { x: 0, y: 0, w: 0, h: 0 }

  const styleTokenMap = ctx.styleTokenMap
  const fills = normalizeMgFills(node.fills, styleTokenMap)
  let type = mapMgType(node.type)
  let imageRef = null

  const imageFill = fills.find((f) => f.type === 'image')
  if (imageFill) {
    type = 'image'
    imageRef = imageFill.imageRef
  }
  if (node.type === 'PEN') type = 'pen'

  const strokes = normalizeMgStrokes(node.strokes, node.strokeWeight, node.strokeAlign)
  const borderRadius = cornerRadiusToCss(node)
  const effects = normalizeMgEffects(node.effects)
  const renderAs = inferRenderAs(node, type, fills, rect)

  const el = {
    id: node.id,
    name: node.name,
    type,
    rect,
    z,
    source: 'mastergo',
    fills,
    strokes,
    effects,
    renderAs,
    parentId: ctx.parentId || null,
    depth: ctx.depth || 0,
  }

  if (borderRadius) {
    el.borderRadius = borderRadius
    el.borderRadiusMeta = {
      source: 'file',
      field: node.type === 'ELLIPSE' ? 'type:ELLIPSE' : 'cornerRadius|rectangleCornerRadii',
    }
  }
  if (node.cornerRadius !== undefined) {
    el.mgCornerRadiusRaw =
      typeof node.cornerRadius === 'number' ? node.cornerRadius : String(node.cornerRadius)
  }
  if (node.rectangleCornerRadii) el.mgRectangleCornerRadii = node.rectangleCornerRadii
  if (node.type) el.mgNodeType = node.type
  if (node.isMaskOutline) el.isMaskOutline = true
  if (node.blendMode && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') {
    el.blendMode = node.blendMode.toLowerCase().replace(/_/g, '-')
  }
  if (node.rotation) el.rotation = node.rotation
  if (node.clipsContent) el.clipsContent = true
  if (node.opacity != null && node.opacity !== 1) el.opacity = node.opacity

  if (node.type === 'TEXT') {
    el.content = node.characters || ''
    el.fontSize = node.style?.fontSize
    el.fontWeight = node.style?.fontWeight
    el.fontFamily = node.style?.fontFamily
    el.lineHeight = node.style?.lineHeightPx
    el.letterSpacing = node.style?.letterSpacing
    el.textAlign = node.style?.textAlignHorizontal
    el.isMixedText = !!node.isMixedText
    const rich = extractRichTextSegments(node, styleTokenMap)
    if (rich.segments?.length) {
      el.richTextSegments = rich.segments
      if (rich.fallback) el.richTextFallback = true
    }
  }

  if (imageRef) {
    el.imageRef = imageRef
    el.exportSlice = ctx.assetMap?.[node.id] || null
  }

  if (node.layoutMode) {
    el.layoutMode = node.layoutMode
    el.itemSpacing = node.itemSpacing
    el.padding = {
      t: node.paddingTop || 0,
      r: node.paddingRight || 0,
      b: node.paddingBottom || 0,
      l: node.paddingLeft || 0,
    }
  }

  el.implementHint = type === 'image' ? 'img' : type === 'pen' && rect.w * rect.h > 10000 ? 'img' : 'css'
  return el
}

export function flattenMgFrame(frame, originX, originY, ctx = {}) {
  const result = []
  const zRef = { n: 0 }
  const assetMap = ctx.assetMap || {}

  function walk(node, depth, parentId) {
    if (node.isVisible === false || node.visible === false) return
    zRef.n += 1
    const el = nodeToDesignElement(node, originX, originY, zRef.n, {
      styleTokenMap: ctx.styleTokenMap,
      assetMap,
      depth,
      parentId,
    })
    result.push(el)
    for (const child of node.children || []) {
      walk(child, depth + 1, node.id)
    }
  }

  for (const child of frame.children || []) walk(child, 0, frame.id)
  return result
}

export function buildClassification(elements) {
  return {
    texts: elements.filter((e) => e.type === 'text'),
    images: elements.filter((e) => e.type === 'image'),
    shapes: elements.filter((e) => e.type === 'shape'),
    penCandidates: elements.filter((e) => e.type === 'pen'),
    frames: elements.filter((e) => e.type === 'frame'),
    interactiveZones: [],
  }
}

export function buildMgGapsReport(elements, assetMap = {}) {
  const unmappedImages = elements.filter(
    (e) => e.type === 'image' && !assetMap[e.id] && !e.exportSlice
  )
  const penWithoutAsset = elements.filter(
    (e) => e.type === 'pen' && e.rect.w * e.rect.h > 100 * 100 && e.implementHint === 'img'
  )
  const mixedTextNoSegments = elements.filter(
    (e) => e.type === 'text' && e.isMixedText && !(e.richTextSegments || []).length
  )
  const rawEffectsLeft = elements.filter((e) =>
    (e.effects || []).some((fx) => fx.raw)
  )

  return {
    comment: '检测-only；IMAGE 须真实 export；禁止 css:* 假绿',
    unmappedImages: unmappedImages.map((e) => ({
      id: e.id,
      name: e.name,
      imageRef: e.imageRef,
      severity: 'high',
    })),
    penWithoutAsset: penWithoutAsset.map((e) => ({
      id: e.id,
      name: e.name,
      rect: e.rect,
      severity: 'medium',
    })),
    mixedTextNoSegments: mixedTextNoSegments.map((e) => ({
      id: e.id,
      name: e.name?.slice?.(0, 40),
      severity: 'medium',
    })),
    rawEffectsLeft: rawEffectsLeft.length,
    counts: {
      elements: elements.length,
      unmappedImages: unmappedImages.length,
      penWithoutAsset: penWithoutAsset.length,
      mixedTextNoSegments: mixedTextNoSegments.length,
    },
  }
}
