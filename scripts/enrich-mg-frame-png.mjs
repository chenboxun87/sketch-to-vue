/**
 * 从 MasterGo 官方帧 PNG（data/{frameId}.png）裁剪 styleGap 图层 → data/{nodeId}.png
 * 像素来源：导出包内帧级渲染图，非几何推断。
 */
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import { idFallbackFileName } from './enrich-from-dsl.mjs'

function cropPixels(src, px) {
  const out = new PNG({ width: px.w, height: px.h })
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const si = ((px.y + y) * src.width + (px.x + x)) * 4
      const di = (y * px.w + x) * 4
      out.data[di] = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = src.data[si + 3]
    }
  }
  return out
}

/**
 * @param {object[]} elements - 含 styleGaps 的元素
 * @param {object} board - { w, h }
 * @param {string} designDir - 导出包根（含 data/）
 * @param {string} frameId - 如 11:5182
 */
export function cropFramePngFallbacks(elements, board, designDir, frameId) {
  const dataDir = path.join(designDir, 'data')
  const exportsDir = path.join(dataDir, 'exports')
  const framePng = path.join(dataDir, idFallbackFileName(frameId))
  const report = { framePng, scale: 1, crops: [], ok: false }

  if (!fs.existsSync(framePng)) {
    report.error = 'frame_png_missing'
    return report
  }

  const png = PNG.sync.read(fs.readFileSync(framePng))
  const scale = png.width / board.w
  report.scale = scale

  const targets = elements.filter((e) =>
    (e.styleGaps || []).some((g) => g.severity === 'high') && !e.exportSlice
  )

  fs.mkdirSync(exportsDir, { recursive: true })

  for (const el of targets) {
    const { x, y, w, h } = el.rect || {}
    if (!w || !h) continue

    const pxX = Math.max(0, Math.round(x * scale))
    const pxY = Math.max(0, Math.round(y * scale))
    const pxW = Math.min(png.width - pxX, Math.round(w * scale))
    const pxH = Math.min(png.height - pxY, Math.round(h * scale))
    if (pxW <= 0 || pxH <= 0) continue

    const out = cropPixels(png, { x: pxX, y: pxY, w: pxW, h: pxH })
    const fileName = idFallbackFileName(el.id)
    const dataPath = path.join(dataDir, fileName)
    const exportPath = path.join(exportsDir, fileName)
    const buf = PNG.sync.write(out)
    fs.writeFileSync(dataPath, buf)
    fs.writeFileSync(exportPath, buf)

    report.crops.push({
      id: el.id,
      name: el.name,
      logical: { x, y, w, h },
      pixel: { x: pxX, y: pxY, w: pxW, h: pxH },
      fileName,
    })
  }

  report.ok = report.crops.length > 0
  return report
}
