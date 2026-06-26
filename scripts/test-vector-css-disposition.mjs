#!/usr/bin/env node
/** hasRenderableStyle + standaloneShapes 判据：组切片 bbox 内的 table 行不得误判缺切片 */
import { hasRenderableStyle } from './disposition.mjs'

let passed = 0
let failed = 0

function assert(label, cond) {
	if (cond) {
		console.log(`✅ ${label}`)
		passed++
	} else {
		console.error(`❌ ${label}`)
		failed++
	}
}

function rectContains(outer, inner) {
	return (
		inner.x >= outer.x - 1 &&
		inner.y >= outer.y - 1 &&
		inner.x + inner.w <= outer.x + outer.w + 1 &&
		inner.y + inner.h <= outer.y + outer.h + 1
	)
}

function isStandaloneShape(shape, sliceEls) {
	return hasRenderableStyle(shape) || !sliceEls.some((sl) => rectContains(sl.rect, shape.rect))
}

const tableRow = {
	type: 'shape',
	rect: { x: 2523, y: 596, w: 346, h: 28 },
	fills: [{ type: 'solid', color: 'rgba(13,69,126,0.3)' }],
	css: ['background: rgba(13,69,126,0.30);'],
}
const groupSlice = {
	type: 'slice',
	rect: { x: 2500, y: 300, w: 766, h: 274 },
	exports: [{ path: '编组.png' }],
}
const borderLine = {
	type: 'shape',
	rect: { x: 100, y: 200, w: 436, h: 2 },
	css: ['border: 0.9px solid #32414D;'],
}
const ghostBitmap = {
	type: 'shape',
	rect: { x: 2520, y: 400, w: 60, h: 60 },
}

assert('table row hasRenderableStyle', hasRenderableStyle(tableRow))
assert('table row standalone inside group slice', isStandaloneShape(tableRow, [groupSlice]))
assert('border line hasRenderableStyle', hasRenderableStyle(borderLine))
assert('border line standalone inside slice', isStandaloneShape(borderLine, [groupSlice]))
assert('ghost bitmap not renderable', !hasRenderableStyle(ghostBitmap))
assert('ghost not standalone when inside slice', !isStandaloneShape(ghostBitmap, [groupSlice]))

console.log(`\nvector-css disposition: ${passed} passed, ${failed} failed.`)
process.exit(failed ? 1 : 0)
