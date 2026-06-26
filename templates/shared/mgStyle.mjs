/**
 * MasterGo DesignElement → CSS 消费内核
 */
import { buildTextStyleMg } from './textStyle.mjs'

export function sanitizeRadius(r) {
  if (!r || r === 'nullpx' || String(r).includes('null')) return undefined
  return r
}

export function fillsToBackground(fills) {
  if (!fills || !fills.length) return null
  const layers = fills.filter((f) => f.type === 'solid' || (f.type === 'gradient' && f.css))
  if (!layers.length) return null
  const cssLayers = layers.map((f) => (f.type === 'solid' ? f.color : f.css))
  return cssLayers.length === 1 ? cssLayers[0] : cssLayers.join(', ')
}

export function effectsToCss(effects) {
  if (!effects || !effects.length) return {}
  const box = []
  let filter = null
  let backdrop = null

  for (const e of effects) {
    if (e.type === 'drop_shadow') {
      const c = e.color?.['css-rgba'] || 'rgba(0,0,0,0.3)'
      box.push(`${e.offsetX || 0}px ${e.offsetY || 0}px ${e.blurRadius || 0}px ${e.spread || 0}px ${c}`)
    } else if (e.type === 'inner_shadow') {
      const c = e.color?.['css-rgba'] || 'rgba(0,0,0,0.3)'
      box.push(`inset ${e.offsetX || 0}px ${e.offsetY || 0}px ${e.blurRadius || 0}px ${e.spread || 0}px ${c}`)
    } else if (e.type === 'layer_blur') {
      filter = `blur(${e.blurRadius || 0}px)`
    } else if (e.type === 'background_blur') {
      backdrop = `blur(${e.blurRadius || 0}px)`
    }
  }

  const out = {}
  if (box.length) out.boxShadow = box.join(', ')
  if (filter) out.filter = filter
  if (backdrop) out.backdropFilter = backdrop
  return out
}

export function strokesToCssProp(strokes) {
  if (!strokes || !strokes.length) return {}
  const s = strokes[0]
  const w = s.weight || 1
  const color = s.color
  const align = (s.align || 'INSIDE').toUpperCase()
  if (align === 'OUTSIDE') {
    return {
      outline: `${w}px solid ${color}`,
      outlineOffset: `${-w}px`,
    }
  }
  if (align === 'CENTER') {
    return {
      border: `${w}px solid ${color}`,
      boxSizing: 'border-box',
    }
  }
  return { border: `${w}px solid ${color}`, boxSizing: 'border-box' }
}

export function rectToCss(rect, z) {
  if (!rect) return {}
  const style = {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
  }
  if (z != null) style.zIndex = z
  return style
}

export function buildMgBoxStyle(el) {
  const style = {
    ...rectToCss(el.rect, el.z),
    boxSizing: 'border-box',
  }
  const bg = fillsToBackground(el.fills)
  if (bg) style.background = bg
  Object.assign(style, effectsToCss(el.effects))
  Object.assign(style, strokesToCssProp(el.strokes))
  const radius = sanitizeRadius(el.borderRadius)
  if (radius) style.borderRadius = radius
  if (el.opacity != null) style.opacity = el.opacity
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`
  if (el.blendMode) style.mixBlendMode = el.blendMode
  if (el.clipsContent) style.overflow = 'hidden'
  return style
}

function textColorFromNormalizedFills(fills) {
  const grad = (fills || []).find((f) => f.type === 'gradient' && f.css)
  if (grad) {
    return {
      background: grad.css,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    }
  }
  const solid = (fills || []).find((f) => f.type === 'solid' && f.color)
  if (solid) return { color: solid.color }
  return {}
}

export function buildMgTextStyle(el) {
  const base = buildTextStyleMg({
    style: {
      fontSize: el.fontSize,
      fontWeight: el.fontWeight,
      fontFamily: el.fontFamily,
      lineHeightPx: el.lineHeight,
      letterSpacing: el.letterSpacing,
      textAlignHorizontal: el.textAlign,
    },
    fills: [],
  })
  Object.assign(base, textColorFromNormalizedFills(el.fills))
  const glow = (el.effects || []).find((e) => e.type === 'drop_shadow')
  if (glow?.color) {
    base.textShadow = `0 0 ${glow.blurRadius || 6}px ${glow.color['css-rgba']}`
  }
  if (el.lineHeight) base.lineHeight = `${el.lineHeight}px`
  return { ...rectToCss(el.rect, el.z), ...base, whiteSpace: 'pre-wrap' }
}

export function richTextSegmentsToHtml(segments) {
  if (!segments || !segments.length) return ''
  return segments
    .map((s) => {
      const style = [
        s.color ? `color:${s.color}` : '',
        s.fontSize ? `font-size:${s.fontSize}px` : '',
        s.fontWeight && s.fontWeight !== 'regular' ? `font-weight:${s.fontWeight === 'medium' ? 500 : s.fontWeight}` : '',
        s.fontFamily ? `font-family:'${s.fontFamily}',sans-serif` : '',
        s.lineHeight ? `line-height:${s.lineHeight}px` : '',
      ].filter(Boolean).join(';')
      const text = String(s.content || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')
      return `<span style="${style}">${text}</span>`
    })
    .join('')
}

export function imageStyle(el, assetUrl) {
  const base = { ...rectToCss(el.rect, el.z), boxSizing: 'border-box' }
  const radius = sanitizeRadius(el.borderRadius)
  if (radius) base.borderRadius = radius
  if (!assetUrl) {
    return {
      ...base,
      outline: '2px dashed #ff4444',
      background: 'rgba(255,0,0,0.08)',
    }
  }
  const scaleMode = (el.fills || []).find((f) => f.scaleMode)?.scaleMode || 'FILL'
  return {
    ...base,
    objectFit: scaleMode === 'FIT' ? 'contain' : 'cover',
    display: 'block',
  }
}
