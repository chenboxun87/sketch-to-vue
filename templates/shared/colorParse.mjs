// 统一颜色解析：兼容 MeaXure / MasterGo 多种颜色形态，输出 CSS 颜色字符串或 null。

function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))) }

/**
 * @param {string|Object|null} c
 *   - "#RRGGBB" / "rgba(...)" / "#hex 100%"（带百分号尾缀）
 *   - { rgb: { r, g, b }, alpha? }   （MeaXure artboard 结构化，r/g/b 为 0-255，alpha 为 0-1）
 *   - { r, g, b, a? }                （MasterGo，r/g/b/a 均为 0-1）
 * @returns {string|null} CSS 颜色 或 null
 */
export function parseColor(c) {
  if (c == null) return null
  if (typeof c === 'string') {
    const s = c.trim()
    if (!s) return null
    // 去掉 "#7AF4FF 100%" 这类尾缀百分比
    const m = s.match(/^(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))\s*\d*\.?\d*%?$/)
    if (m) return m[1]
    // non-CSS strings (e.g. 'transparent') pass through as-is
    return s
  }
  if (typeof c === 'object') {
    // { rgb: { r,g,b }, alpha? }，r/g/b 0-255
    if (c.rgb && typeof c.rgb.r === 'number') {
      const { r, g, b } = c.rgb
      const a = c.alpha != null ? c.alpha : 1
      return `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${a})`
    }
    // { r,g,b,a }，r/g/b 0-1
    if (typeof c.r === 'number') {
      const a = c.a != null ? c.a : 1
      return `rgba(${clamp255(c.r * 255)},${clamp255(c.g * 255)},${clamp255(c.b * 255)},${a})`
    }
  }
  return null
}
