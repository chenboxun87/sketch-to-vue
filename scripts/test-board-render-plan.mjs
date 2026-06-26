#!/usr/bin/env node
/**
 * test-board-render-plan.mjs — boardRender.mjs 回归
 */
import {
	buildBoardRenderPlan,
	indexElements,
	DEFAULT_SKIP_SLICE_NAMES,
} from '../templates/shared/boardRender.mjs'

let passed = 0
let failed = 0

function assert(cond, msg) {
	if (cond) passed++
	else {
		failed++
		console.error('FAIL:', msg)
	}
}

const mockResolve = (file) => `/static/mock/${String(file).replace(/\\/g, '/')}`

const layerStack = {
	layers: [
		{
			id: 's-skip',
			name: 'BG',
			z: 0,
			rect: { x: 0, y: 0, w: 800, h: 600 },
			source: { kind: 'slice-file', file: 'D:/proj/assets/BG.png' },
		},
		{
			id: 's1',
			name: 'feature-chip',
			z: 10,
			rect: { x: 10, y: 10, w: 48, h: 48 },
			source: { kind: 'slice-file', file: 'icon/feature-a.png' },
		},
		{
			id: 'v1',
			name: '形状结合',
			z: 20,
			rect: { x: 100, y: 100, w: 200, h: 80 },
			source: {
				kind: 'vector-css',
				css: ['opacity: 0.8;', 'background-image: linear-gradient(180deg, #0080ff 0%, #0040aa 100%);'],
			},
		},
		{
			id: 't1',
			name: 'label-a',
			z: 30,
			rect: { x: 10, y: 70, w: 120, h: 20 },
			source: { kind: 'live-text-static' },
		},
		{
			id: 't-drop',
			name: 'fragment',
			z: 31,
			rect: { x: 10, y: 70, w: 40, h: 20 },
			source: { kind: 'live-text-static' },
		},
	],
}

const allElements = {
	elements: [
		{
			id: 't1',
			type: 'text',
			content: 'Feature Label',
			fontSize: 14,
			color: '#ffffff',
			rect: { x: 10, y: 70, w: 120, h: 20 },
		},
		{
			id: 't-drop',
			type: 'text',
			content: 'frag',
			fontSize: 14,
			color: '#ffffff',
		},
	],
}

const gapsReport = {
	duplicateTextGroups: [{ keepId: 't1', dropId: 't-drop' }],
	fakeBarShapes: [],
	degenerateBorderPaths: [],
	iconGapCandidates: [{ id: 'g1', name: 'ghost-icon', rect: { x: 200, y: 200, w: 32, h: 32 } }],
}

const iconOverlays = {
	items: [{ elementId: 'g1', file: 'icon/feature-a.png' }],
}

const chartZones = { zones: [] }

// missing resolveAssetUrl must throw
try {
	buildBoardRenderPlan({
		layerStack,
		elementsById: indexElements(allElements),
		gapsReport,
		iconOverlays,
		chartZones,
	})
	assert(false, 'should throw without resolveAssetUrl')
} catch (e) {
	assert(/resolveAssetUrl is required/i.test(e.message), 'missing resolver error message')
}

const plan = buildBoardRenderPlan({
	layerStack,
	elementsById: indexElements(allElements),
	gapsReport,
	iconOverlays,
	chartZones,
	resolveAssetUrl: mockResolve,
})

assert(!plan.some((l) => l.name === 'BG'), 'BG skipped by DEFAULT_SKIP_SLICE_NAMES')
assert(!plan.some((l) => l.id === 't-drop'), 'dropId text excluded')
assert(plan.some((l) => l.id === 's1' && l.src === '/static/mock/icon/feature-a.png'), 'slice uses resolveAssetUrl')
assert(plan.some((l) => l.id === 'v1' && l.kind === 'vector'), 'vector-css in plan')
assert(plan.some((l) => l.id === 't1' && l.content === 'Feature Label'), 'text enriched from all_elements')
const iconGap = plan.find((l) => l.id === 'icon-gap-g1')
assert(iconGap && iconGap.src === '/static/mock/icon/feature-a.png', 'icon-gap uses same resolveAssetUrl as slice')

// simulate copy-paste bug: overlay branch must not reference foreign fn name
const src = buildBoardRenderPlan.toString()
assert(!/getMonitorLayerPublicPath|getCockpitLayerPublicPath|getProjectALayerPath/.test(src), 'shared module has no project-specific URL fn names')

assert(DEFAULT_SKIP_SLICE_NAMES.test('BG'), 'skip regex matches BG')

console.log(`test-board-render-plan: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
