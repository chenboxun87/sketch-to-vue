/**
 * 解析 MasterGo 导出的 default_layers.txt / expand_layers.txt（位于设计包父目录）
 * 格式示例：[PEN] "矩形" x=1026 y=3953 w=328 h=40
 */
import fs from 'fs'
import path from 'path'

const LINE_RE =
  /^(\s*)\[(FRAME|GROUP|RECTANGLE|PEN|TEXT|ELLIPSE|BOOLEAN_OPERATION|FRAME)\]\s+"([^"]*)"\s+x=([\d.+-]+)\s+y=([\d.+-]+)\s+w=([\d.+-]+)\s+h=([\d.+-]+)(?:\s+text="([^"]*)")?/

export function parseLayersTxt(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
  const stack = []
  const flat = []

  for (const line of lines) {
    const m = line.match(LINE_RE)
    if (!m) continue
    const indent = m[1].length
    const depth = Math.floor(indent / 2)
    const node = {
      type: m[2],
      name: m[3],
      x: parseFloat(m[4]),
      y: parseFloat(m[5]),
      w: parseFloat(m[6]),
      h: parseFloat(m[7]),
      text: m[8] || null,
      depth,
    }
    while (stack.length > depth) stack.pop()
    node.parentName = stack.length ? stack[stack.length - 1].name : null
    stack.push(node)
    flat.push(node)
  }
  return flat
}

export function loadDesignRootLayerFiles(designRoot, frameName) {
  if (!designRoot || !fs.existsSync(designRoot)) {
    return { layers: [], sourceFile: null }
  }
  const candidates = []
  if (frameName?.includes('展开')) {
    candidates.push('expand_layers.txt')
  } else if (frameName?.includes('默认')) {
    candidates.push('default_layers.txt')
  }
  candidates.push('expand_layers.txt', 'default_layers.txt')

  const seen = new Set()
  for (const file of candidates) {
    if (seen.has(file)) continue
    seen.add(file)
    const fp = path.join(designRoot, file)
    if (!fs.existsSync(fp)) continue
    const layers = parseLayersTxt(fs.readFileSync(fp, 'utf8'))
    const root = layers.find((l) => l.type === 'FRAME' && l.name === frameName)
    if (root || layers.length) {
      return { layers, sourceFile: fp, frameRoot: root || null }
    }
  }
  return { layers: [], sourceFile: null, frameRoot: null }
}

/** 与 extract 元素按 name + 相对坐标比对（容差 1px） */
export function validateLayersAgainstElements(layers, elements, origin) {
  const originX = origin?.x || 0
  const originY = origin?.y || 0
  const frameRoot = layers.find((l) => l.type === 'FRAME')
  const mismatches = []
  const matched = []

  for (const el of elements) {
    if (el.renderAs === 'skip' || el.type === 'text') continue
    const relX = originX + (el.rect?.x || 0)
    const relY = originY + (el.rect?.y || 0)
    const candidates = layers.filter(
      (l) =>
        l !== frameRoot &&
        l.name === el.name &&
        Math.abs(l.x - relX) <= 1 &&
        Math.abs(l.y - relY) <= 1 &&
        Math.abs(l.w - (el.rect?.w || 0)) <= 1 &&
        Math.abs(l.h - (el.rect?.h || 0)) <= 1
    )
    if (candidates.length === 1) {
      matched.push({ id: el.id, name: el.name, layer: candidates[0] })
    } else if (candidates.length === 0) {
      mismatches.push({
        id: el.id,
        name: el.name,
        expected: { x: relX, y: relY, w: el.rect?.w, h: el.rect?.h },
        reason: 'no_layers_txt_match',
      })
    }
  }

  return {
    sourceFrame: frameRoot?.name || null,
    layerCount: layers.length,
    matchedCount: matched.length,
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 20),
    ok: mismatches.length === 0,
  }
}
