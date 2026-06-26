/**
 * MasterGo 富文本分段提取
 */
import { mgColorToHex } from '../templates/shared/textStyle.mjs'

const TITLE_COLOR = '#4CA7FF'
const BODY_COLOR = '#CAD0EF'

function segmentFromStyle(node, start, end, content, overrideStyle) {
  const base = node.style || {}
  const style = overrideStyle || base
  const fills = overrideStyle?.fills || node.fills
  let color = BODY_COLOR
  const solid = (fills || []).find((f) => f.type === 'SOLID')
  if (solid?.color) color = mgColorToHex(solid.color)

  return {
    start,
    end,
    content,
    fontSize: style.fontSize || base.fontSize,
    fontWeight: style.fontWeight || base.fontWeight,
    fontFamily: style.fontFamily || base.fontFamily,
    color,
  }
}

function extractFromTextTable(node) {
  const table = node.textTable
  const chars = node.characters || ''
  if (!Array.isArray(table) || !table.length || !chars) return null

  const segments = []
  for (const row of table) {
    const start = row.start ?? row.characterOffset ?? 0
    const end = row.end ?? row.characterOffset + (row.length || 0)
    if (end <= start) continue
    segments.push(segmentFromStyle(node, start, end, chars.slice(start, end), row.style))
  }
  return segments.length ? segments : null
}

function extractFromOverrides(node) {
  const chars = node.characters || ''
  const overrides = node.characterStyleOverrides
  const table = node.styleOverrideTable
  if (!Array.isArray(overrides) || !overrides.length || !chars) return null

  const segments = []
  let pos = 0
  for (let i = 0; i < overrides.length; i++) {
    const styleIdx = overrides[i]
    const style = table?.[styleIdx] || node.style
    let j = i + 1
    while (j < overrides.length && overrides[j] === styleIdx) j++
    const end = j < overrides.length ? j : chars.length
    if (end > pos) {
      segments.push(segmentFromStyle(node, pos, end, chars.slice(pos, end), style))
      pos = end
    }
    i = j - 1
  }
  if (pos < chars.length) {
    segments.push(segmentFromStyle(node, pos, chars.length, chars.slice(pos), node.style))
  }
  return segments.length ? segments : null
}

function extractFallbackByParagraph(node) {
  const chars = node.characters || ''
  if (!chars) return null

  const parts = chars.split(/\n/)
  const segments = []
  let offset = 0
  for (const part of parts) {
    if (!part.trim()) {
      offset += part.length + 1
      continue
    }
    const isTitle = /^\d+\./.test(part.trim())
    segments.push({
      start: offset,
      end: offset + part.length,
      content: part,
      fontSize: node.style?.fontSize,
      fontWeight: isTitle ? '600' : node.style?.fontWeight,
      fontFamily: node.style?.fontFamily,
      color: isTitle ? TITLE_COLOR : BODY_COLOR,
    })
    offset += part.length + 1
  }
  return segments.length ? segments : null
}

export function extractRichTextSegments(node, _styleTokenMap) {
  if (node.type !== 'TEXT') return { segments: [], fallback: false }

  let segments = extractFromTextTable(node)
    || extractFromOverrides(node)

  let fallback = false
  if (!segments && node.isMixedText && (node.characters || '').length > 80) {
    segments = extractFallbackByParagraph(node)
    fallback = !!segments
  }

  if (!segments && node.characters) {
    segments = [segmentFromStyle(node, 0, node.characters.length, node.characters)]
  }

  return { segments: segments || [], fallback }
}
