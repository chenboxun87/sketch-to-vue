import { normalizeMgEffects, nodeToDesignElement, strokesToCss, cornerRadiusToCss, flattenMgFrame } from './mastergo-normalize.mjs'
import { detectStyleGaps } from './mastergo-style-gaps.mjs'
import { skipRedundantDescendantsOfSliceParents } from './mastergo-layer-stack.mjs'

let failed = 0
function ok(c, m) {
  if (!c) { console.error('FAIL', m); failed++ } else console.log('OK', m)
}

const effects = normalizeMgEffects([
  { type: 'DROP_SHADOW', visible: true, offset: { x: 0, y: 4 }, radius: 8, color: { r: 0, g: 0, b: 0, a: 0.5 } },
  { type: 'INNER_SHADOW', visible: true, offset: { x: 0, y: 0 }, radius: 28, spread: 4, color: { r: 0.2, g: 0.57, b: 1, a: 0.6 } },
  { type: 'BACKGROUND_BLUR', visible: true, radius: 12 },
])
ok(effects.every((e) => !e.raw), 'no raw effects left')
ok(effects.some((e) => e.type === 'inner_shadow'), 'inner shadow parsed')
ok(effects.some((e) => e.type === 'background_blur'), 'backdrop blur parsed')

const node = {
  type: 'RECTANGLE',
  name: 't',
  id: '1:1',
  absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 },
  fills: [{ type: 'SOLID', color: { r: 0.07, g: 0.09, b: 0.18, a: 1 } }],
  strokes: [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } }],
  strokeWeight: 1,
  strokeAlign: 'INSIDE',
  cornerRadius: 8,
}
const el = nodeToDesignElement(node, 0, 0, 1)
ok(el.strokes && el.strokes.length === 1, 'strokes extracted')
ok(el.borderRadius === '8px', 'corner radius')
ok(el.borderRadiusMeta?.source === 'file', 'radius from file')

const ellipse = nodeToDesignElement(
  { type: 'ELLIPSE', name: 'e', id: '1:2', absoluteBoundingBox: { x: 0, y: 0, width: 48, height: 48 }, fills: [] },
  0, 0, 2
)
ok(ellipse.borderRadius === '50%', 'ellipse radius from type')
ok(ellipse.borderRadiusMeta?.field === 'type:ELLIPSE', 'ellipse meta field')

const mixedPen = nodeToDesignElement(
  {
    type: 'PEN',
    name: 'bubble',
    id: '1:3',
    cornerRadius: 'Symbol(mg.mixed)',
    rectangleCornerRadii: [null, null, null, null],
    isMaskOutline: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 328, height: 40 },
    fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.9, a: 0.75 } }],
  },
  0, 0, 3
)
ok(!mixedPen.borderRadius, 'mixed pen no guessed radius')
const gaps = detectStyleGaps({
  type: 'PEN',
  cornerRadius: 'Symbol(mg.mixed)',
  rectangleCornerRadii: [null, null, null, null],
  isMaskOutline: true,
  fills: mixedPen.fills,
})
ok(gaps.some((g) => g.code === 'MIXED_CORNER_RADIUS_UNRESOLVED'), 'mixed pen style gap')

ok(strokesToCss(el.strokes).includes('solid'), 'strokesToCss')

const frame = {
  id: 'f1',
  name: 'test',
  absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
  children: [
    {
      id: '1:hidden',
      name: 'hidden',
      type: 'RECTANGLE',
      isVisible: false,
      absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
      fills: [],
    },
    {
      id: '1:vis',
      name: 'visible',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 20, height: 20 },
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    },
  ],
}
const flat = flattenMgFrame(frame, 0, 0)
ok(flat.length === 1 && flat[0].id === '1:vis', 'skip isVisible false nodes')

const parentChild = [
  {
    id: 'p1',
    renderAs: 'img',
    exportSlice: 'icon.png',
    rect: { x: 0, y: 0, w: 20, h: 20 },
  },
  {
    id: 'c1',
    parentId: 'p1',
    renderAs: 'div',
    rect: { x: 2, y: 2, w: 8, h: 6 },
  },
]
skipRedundantDescendantsOfSliceParents(parentChild)
ok(parentChild[1].renderAs === 'skip', 'skip child under parent export slice')

if (failed) process.exit(1)
console.log('mg-normalize tests passed')
