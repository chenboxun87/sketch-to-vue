// 采样切片四角像素，判定黑底/白底，给出 mix-blend-mode 提示。
// 注：让真实切片正确显示（黑底透出背景 / 白底消融），非 CSS 模拟视觉（不违反禁令 #18）。
import fs from 'fs'
import { PNG } from 'pngjs'

function sampleAt(png, x, y) {
  const idx = (png.width * y + x) << 2
  return { r: png.data[idx], g: png.data[idx + 1], b: png.data[idx + 2], a: png.data[idx + 3] }
}

/**
 * @param {string} pngPath absolute path to a PNG slice file (JPEG returns null, not supported by pngjs)
 * @returns {'screen'|'multiply'|null}
 */
export function classifyBlend(pngPath) {
  let png
  try {
    png = PNG.sync.read(fs.readFileSync(pngPath))
  } catch {
    return null
  }
  const w = png.width, h = png.height
  // guard: need ≥3px each dimension for inset corner sampling
  if (w < 3 || h < 3) return null
  const pts = [
    sampleAt(png, 1, 1), sampleAt(png, w - 2, 1),
    sampleAt(png, 1, h - 2), sampleAt(png, w - 2, h - 2),
    sampleAt(png, w >> 1, h >> 1),  // center
  ]
  // any corner transparent → slice has its own alpha, no blend needed
  if (pts.some((p) => p.a < 250)) return null
  const allBlack = pts.every((p) => p.r < 16 && p.g < 16 && p.b < 16)
  if (allBlack) return 'screen'
  const allWhite = pts.every((p) => p.r > 244 && p.g > 244 && p.b > 244)
  if (allWhite) return 'multiply'
  return null
}
