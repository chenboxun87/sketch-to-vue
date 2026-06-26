// 矢量层退化/伪装判定（A 轨道 MeaXure 渲染缺口）

/**
 * 退化描边路径：MeaXure 用 `border:Npx solid` 表示 Sketch 描边路径，
 * 当 border 厚度 ≫ 自身 rect 尺寸时，CSS 渲染成远超原位的实心大色块。
 * 保留 ≤2px 的正常细线/描边。
 * @param {string[]} cssArr layer.source.css
 * @param {{w:number,h:number}} rect
 * @returns {boolean} true=应跳过渲染
 */
export function isDegenerateBorderPath(cssArr, rect) {
  if (!rect) return false
  const arr = cssArr || []
  const borderCss = arr.find((c) => /^border\s*:\s*\d/i.test(c) && !/border-radius/i.test(c))
  if (!borderCss) return false
  const m = borderCss.match(/border\s*:\s*(\d+)px/i)
  if (!m) return false
  const borderW = parseInt(m[1], 10)
  if (borderW <= 2) return false
  const w = rect.w || 0
  const h = rect.h || 0
  return (borderW * 2 > w || borderW * 2 > h) && (w < 60 || h < 60)
}
