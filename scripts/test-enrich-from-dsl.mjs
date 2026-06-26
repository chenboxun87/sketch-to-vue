import assert from 'assert'
import {
  normalizeDslPayload,
  getDslNodeMap,
  enrichElementsFromDsl,
} from './enrich-from-dsl.mjs'
import { detectStyleGapsForElement } from './mastergo-style-gaps.mjs'

const mockMcp = {
  dsl: {
    nodeMap: {
      '11:6508': {
        id: '11:6508',
        layerType: 'PEN',
        style: {
          value: { borderRadius: '0px 0px 0px 0px' },
        },
      },
      '11:7917': {
        id: '11:7917',
        layerType: 'PEN',
        style: {
          value: { clipPath: 'path("M0 0 L100 0")' },
        },
      },
    },
  },
}

assert.strictEqual(normalizeDslPayload(mockMcp)?.nodeMap['11:6508'].id, '11:6508')
assert.strictEqual(Object.keys(getDslNodeMap(mockMcp)).length, 2)

const treeOnly = {
  dsl: {
    nodes: [
      {
        id: '11:6508',
        layerType: 'PEN',
        style: { value: { borderTopLeftRadius: '8px' } },
        children: [],
      },
    ],
  },
}
assert.ok(getDslNodeMap(treeOnly)['11:6508'])

const el6508 = {
  id: '11:6508',
  type: 'pen',
  mgNodeType: 'PEN',
  mgCornerRadiusRaw: 'mixed',
  mgRectangleCornerRadii: [null, null, null, null],
  isMaskOutline: true,
  fills: [{ type: 'GRADIENT', visible: true }],
  styleGaps: [{ code: 'MIXED_CORNER_RADIUS_UNRESOLVED', severity: 'high' }],
}
const el7917 = {
  id: '11:7917',
  type: 'pen',
  mgNodeType: 'PEN',
  isMaskOutline: true,
  fills: [{ type: 'SOLID', visible: true }],
  styleGaps: [{ code: 'PEN_MASK_OUTLINE_NO_RADIUS', severity: 'high' }],
}

const r = enrichElementsFromDsl([el6508, el7917], mockMcp)
assert.ok(r.applied.includes('11:6508'))
assert.ok(r.applied.includes('11:7917'))
assert.strictEqual(el6508.borderRadiusMeta.source, 'dsl')
assert.ok(el7917.dslVectorHint)

assert.strictEqual(detectStyleGapsForElement(el6508).length, 0)
const el7917b = {
  id: '11:7917',
  type: 'pen',
  mgNodeType: 'PEN',
  mgCornerRadiusRaw: 'mixed',
  mgRectangleCornerRadii: [null, null, null, null],
  isMaskOutline: true,
  fills: [{ type: 'SOLID', visible: true }],
  styleGaps: [{ code: 'MIXED_CORNER_RADIUS_UNRESOLVED', severity: 'high' }],
  dslVectorHint: true,
  dslClipPath: 'path("M0 0")',
  dslStyleResolved: true,
}
assert.strictEqual(detectStyleGapsForElement(el7917b).length, 0)

console.log('[OK] test-enrich-from-dsl.mjs')
