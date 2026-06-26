// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// 从 MeaXure 原生图层树构建类型化场景图：保留父子树 + native 边，节点内嵌全字段。
const round = (n) => Math.round((n || 0) * 100) / 100

function normRect(r) {
  if (!r) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: round(r.x), y: round(r.y), w: round(r.width ?? r.w), h: round(r.height ?? r.h) }
}

// 浅拷贝：attrs 内引用类型字段（css/fills 等）与原始 layer 共享引用。消费方不得就地修改（write）attrs 内的数组/对象。
const STRUCT_KEYS = new Set(['objectID', 'type', 'name', 'layers', 'rect'])
function pickAttrs(layer) {
  const attrs = {}
  for (const k of Object.keys(layer)) if (!STRUCT_KEYS.has(k)) attrs[k] = layer[k]
  return attrs
}

export function buildSceneGraph(artboardLayers, board) {
  const nodes = []
  const edges = []
  let zCounter = 0
  function walk(layer, parentId) {
    const id = layer.objectID
    if (!id) {
      console.warn(`[scene-graph] layer "${layer.name}" missing objectID, skipped`)
      return
    }
    const type = layer.type || 'unknown'
    const rect = normRect(layer.rect)
    const z = zCounter++
    nodes.push({
      id, name: layer.name, type, rect, z,
      attrs: pickAttrs(layer),
      disposition: null, // Task 2 填充
    })
    if (parentId) edges.push({ type: 'child-of', from: id, to: parentId, confidence: 'native' })
    if (Array.isArray(layer.layers) && layer.layers.length > 0) {
      for (const c of layer.layers) walk(c, id)
    }
  }
  for (const l of artboardLayers || []) walk(l, null)
  return { meta: { board: normRect(board), schemaVersion: 1 }, nodes, edges }
}
