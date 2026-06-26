/**
 * design-to-vue 共享文字样式内核（MeaXure + MasterGo 双入口）
 */

const toHex2 = (v) => Math.round(v * 255).toString(16).padStart(2, '0')

export function normalizeTextColor(c) {
  if (!c || typeof c !== 'string') return ''
  return c.replace(/\s+\d+%\s*$/, '').trim()
}

export function mgColorToCss(c) {
  if (!c) return 'transparent'
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const a = c.a !== undefined ? c.a : 1
  if (Math.abs(a - 1) < 0.001) return `rgb(${r},${g},${b})`
  return `rgba(${r},${g},${b},${parseFloat(a.toFixed(4))})`
}

export function mgColorToHex(c) {
  if (!c) return 'transparent'
  const r = toHex2(c.r)
  const g = toHex2(c.g)
  const b = toHex2(c.b)
  const a = c.a !== undefined ? c.a : 1
  if (Math.abs(a - 1) < 0.001) return `#${r}${g}${b}`.toUpperCase()
  return `#${r}${g}${b}${toHex2(a)}`.toUpperCase()
}

export function mgGradientToCss(fill) {
  const stops = (fill.gradientStops || [])
    .map((s) => `${mgColorToHex(s.color)} ${(s.position * 100).toFixed(1)}%`)
    .join(', ')
  if (fill.type === 'GRADIENT_RADIAL') return `radial-gradient(${stops})`

  const handles = fill.gradientHandlePositions
  if (handles && handles.length >= 2) {
    const [a, b] = handles
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
      let deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI)
      if (deg < 0) deg += 360
      return `linear-gradient(${deg}deg, ${stops})`
    }
  }

  const t = fill.transform
  let deg = 180
  if (t && t[0] && t[1]) {
    const angle = Math.atan2(t[0][1], t[0][0])
    deg = Math.round((angle * 180) / Math.PI + 90)
    if (deg < 0) deg += 360
  }
  return `linear-gradient(${deg}deg, ${stops})`
}

export function stopColorRaw(c) {
  if (!c) return '#ffffff'
  if (typeof c === 'string') {
    const rgba = c.match(/rgba?\([^)]+\)/i)
    if (rgba) return rgba[0]
    return normalizeTextColor(c) || c.split(/\s+/)[0]
  }
  if (c['css-rgba']) return c['css-rgba']
  if (c['color-hex']) return normalizeTextColor(c['color-hex']) || c['color-hex']
  return '#ffffff'
}

export function fontFamilyFromCss(css, fallback) {
  const line = (css || []).find((c) => /font-family/i.test(c))
  if (!line) return fallback || ''
  const m = line.match(/font-family:\s*([^;]+)/i)
  return m ? m[1].trim().replace(/['"]/g, '') : (fallback || '')
}

export function fontStack(family) {
  const f = String(family || '').trim().replace(/['"]/g, '')
  if (!f) return "'PingFang SC','Microsoft YaHei',sans-serif"
  if (/DINAlternate/i.test(f) || /^DIN\s/i.test(f) || f === 'DINAlternate-Bold')
    return `'D-DIN-PRO','DINAlternate-Bold','${f}','Helvetica Neue',Arial,sans-serif`
  if (/DingTalk/i.test(f))
    return `'DingTalkJinBuTi','DingTalk JinBuTi','PingFang SC',sans-serif`
  if (/YouShe/i.test(f))
    return `'YouSheBiaoTiHei','${f}','PingFang SC',sans-serif`
  if (/PingFangSC/i.test(f))
    return `'PingFang SC','${f}','Microsoft YaHei',sans-serif`
  if (/SourceHan/i.test(f))
    return `'SourceHanSansCN','Source Han Sans SC','${f}','PingFang SC',sans-serif`
  return `'${f}','PingFang SC','Microsoft YaHei',sans-serif`
}

export function textGradientStyle(el) {
  const fill = (el.fills || []).find(
    (f) => f.type === 'gradient' && Array.isArray(f.stops) && f.stops.length >= 2
  )
  if (!fill) return null
  const parts = fill.stops.map((s) => {
    const pos = s.position != null ? (s.position <= 1 ? s.position * 100 : s.position) : 0
    return `${stopColorRaw(s.color)} ${pos}%`
  })
  const angle = fill.angle != null ? fill.angle : 180
  return {
    background: `linear-gradient(${angle}deg, ${parts.join(', ')})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  }
}

export function solidTextColor(el) {
  const solid = (el.fills || []).find((f) => f.type === 'solid')
  if (solid && solid.color) return stopColorRaw(solid.color)
  return el.colorRgba || normalizeTextColor(el.color) || '#ffffff'
}

export function weightFromCss(css) {
  const line = (css || []).find((c) => /font-weight\s*:/.test(c))
  if (line) {
    const m = line.match(/font-weight\s*:\s*([^;]+)/)
    if (m) return m[1].trim()
  }
  const ff = (css || []).find((c) => /font-family/i.test(c))
  if (ff && /bold/i.test(ff)) return '700'
  return ''
}

export function textShadowCss(shadows) {
  if (!Array.isArray(shadows) || !shadows.length) return 'none'
  return shadows
    .map((s) => {
      const c = (s.color && s.color['css-rgba']) || 'rgba(0,0,0,0.3)'
      return `${s.offsetX || 0}px ${s.offsetY || 0}px ${s.blurRadius || 0}px ${c}`
    })
    .join(', ')
}

export function textGradientStyleMg(fills) {
  const f = (fills || []).find(
    (x) => x.type === 'GRADIENT_LINEAR' || x.type === 'GRADIENT_RADIAL'
  )
  if (!f || !(f.gradientStops || []).length) return null
  return {
    background: mgGradientToCss(f),
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  }
}

export function solidTextColorMg(fills, fallbackColor) {
  const solid = (fills || []).find((f) => f.type === 'SOLID')
  if (solid && solid.color) return mgColorToHex(solid.color)
  return fallbackColor || '#EAEFF7'
}

export function buildTextStyleMg(node) {
  const style = node.style || {}
  const base = {}
  if (style.fontSize) base.fontSize = `${style.fontSize}px`
  if (style.fontWeight && style.fontWeight !== 'regular') base.fontWeight = style.fontWeight
  if (style.fontFamily) base.fontFamily = `'${style.fontFamily}', sans-serif`
  if (style.lineHeightPx && style.lineHeightUnit !== 'AUTO')
    base.lineHeight = `${style.lineHeightPx}px`
  if (style.letterSpacing && style.letterSpacing !== 0)
    base.letterSpacing = `${style.letterSpacing}px`
  if (style.textAlignHorizontal) {
    const map = { LEFT: 'left', RIGHT: 'right', CENTER: 'center', JUSTIFIED: 'justify' }
    base.textAlign = map[style.textAlignHorizontal] || 'left'
  }
  const grad = textGradientStyleMg(node.fills)
  if (grad) return { ...base, ...grad }
  return { ...base, color: solidTextColorMg(node.fills, '#EAEFF7') }
}

/**
 * MeaXure 元素 → 文字 style 对象（不含 position）
 */
export function buildTextStyle(el, opts = {}) {
  const cssFont = fontFamilyFromCss(el.css, el.fontFamily)
  const style = {
    fontFamily: fontStack(cssFont),
    fontSize: `${el.fontSize || 14}px`,
    lineHeight: el.lineHeight ? `${el.lineHeight}px` : 'normal',
    letterSpacing: `${el.letterSpacing || 0}px`,
    textAlign: el.textAlign || 'left',
    textShadow: textShadowCss(el.shadows),
    opacity: el.opacity != null ? el.opacity : 1,
    ...(opts.extra || {}),
  }
  const grad = textGradientStyle(el)
  if (grad) Object.assign(style, grad)
  else style.color = solidTextColor(el)
  const w = weightFromCss(el.css)
  if (w) style.fontWeight = w
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`
  return style
}
