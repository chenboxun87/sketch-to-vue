// 按 merge plan 合并多画板 layer_stack 与 all_elements。
import fs from 'fs'
import path from 'path'

/**
 * @param {Array} baseLayers
 * @param {Array<{layers:Array, zOffset:number, filterFn?:Function}>} overlays
 * @returns {Array} 合并后的 layer 数组
 */
export function mergeLayerStacks(baseLayers, overlays) {
  const out = [...baseLayers]
  for (const ov of overlays) {
    const layers = (ov.layers || []).filter(ov.filterFn || (() => true))
    for (const l of layers) {
      const base = l.z || l.zIndex || 0
      out.push({ ...l, z: ov.zOffset + base, zIndex: ov.zOffset + base })
    }
  }
  return out
}

/**
 * 合并 all_elements，按 id 去重（base 优先）
 */
export function mergeElements(baseEls, overlayEls) {
  const ids = new Set(baseEls.map((e) => e.id))
  const extra = overlayEls.filter((e) => !ids.has(e.id))
  return [...baseEls, ...extra]
}

// CLI: node merge-artboards.mjs <dataDir>
// dataDir contains artboard0/ artboard1/ subdirectories and _artboard_merge_plan.json
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const dataDir = process.argv[2]
  if (!dataDir) { console.error('usage: merge-artboards.mjs <dataDir>'); process.exit(1) }
  const plan = JSON.parse(fs.readFileSync(path.join(dataDir, '_artboard_merge_plan.json'), 'utf8'))
  const readBoard = (i, f) => JSON.parse(fs.readFileSync(path.join(dataDir, `artboard${i}`, f), 'utf8'))
  const baseStackRaw = readBoard(plan.base, '_layer_stack.json')
  const baseStack = Array.isArray(baseStackRaw) ? baseStackRaw : (baseStackRaw.layers || [])
  const LEFT_MAX = 1600, RIGHT_MIN = 4700
  const overlays = plan.overlays.map((o) => {
    const raw = readBoard(o.from, '_layer_stack.json')
    const layers = Array.isArray(raw) ? raw : (raw.layers || [])
    return {
      layers,
      zOffset: o.zOffset,
      filterFn: (it) => {
        const cx = (it.rect.x || 0) + (it.rect.w || 0) / 2
        return o.filter === 'panels' ? (cx < LEFT_MAX || cx > RIGHT_MIN) : true
      },
    }
  })
  const mergedStack = mergeLayerStacks(baseStack, overlays)
  fs.writeFileSync(path.join(dataDir, '_layer_stack.json'), JSON.stringify(mergedStack, null, 2))

  const baseElDoc = readBoard(plan.base, '_all_elements.json')
  let mergedEls = baseElDoc.elements || []
  for (const o of plan.overlays) {
    const ovDoc = readBoard(o.from, '_all_elements.json')
    mergedEls = mergeElements(mergedEls, ovDoc.elements || [])
  }
  fs.writeFileSync(path.join(dataDir, '_all_elements.json'), JSON.stringify({ ...baseElDoc, elements: mergedEls }, null, 2))
  console.log('merged: layers', mergedStack.length, 'elements', mergedEls.length)
}
