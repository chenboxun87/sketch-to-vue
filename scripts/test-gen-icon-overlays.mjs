#!/usr/bin/env node
/**
 * test-gen-icon-overlays.mjs — gen-icon-overlays.mjs 回归
 * 使用通用 fixture 名与最小 rect，不绑定任何真实项目坐标/业务文案。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const scriptPath = path.join(__dirname, 'gen-icon-overlays.mjs')

const FIXTURE_BOARD = { w: 800, h: 600 }
const FIXTURE_ICON_A = 'icon/feature-a.png'

let passed = 0
let failed = 0

function assert(cond, msg) {
	if (cond) {
		passed++
	} else {
		failed++
		console.error('FAIL:', msg)
	}
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-overlays-'))
const assets = path.join(tmp, 'assets')
fs.mkdirSync(path.join(assets, 'icon'), { recursive: true })
fs.writeFileSync(path.join(assets, 'BG备份.png'), 'bg')
fs.writeFileSync(path.join(assets, 'icon', 'feature-a.png'), 'icon-a')
fs.writeFileSync(path.join(assets, 'icon', 'feature-label-b.png'), 'icon-b')

const outDir = path.join(tmp, 'data')
fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(
	path.join(outDir, '_icon_gap_candidates.json'),
	JSON.stringify({
		items: [
			{
				elementId: 'gap-small',
				name: 'ghost-chip',
				rect: { x: 10, y: 10, w: 48, h: 48 },
				candidates: [{ file: 'BG备份.png', score: 0, basis: 'rect-nearest' }],
				recommended: { file: 'BG备份.png', score: 0, basis: 'rect-nearest' },
				status: 'needs-review',
			},
			{
				elementId: 'gap-auto',
				name: 'feature-a',
				rect: { x: 100, y: 100, w: 200, h: 200 },
				candidates: [{ file: FIXTURE_ICON_A, score: 0.72, basis: 'name-exact' }],
				recommended: { file: FIXTURE_ICON_A, score: 0.72, basis: 'name-exact' },
				status: 'auto-resolved',
			},
		],
	})
)

fs.writeFileSync(
	path.join(outDir, '_all_elements.json'),
	JSON.stringify({
		board: FIXTURE_BOARD,
		elements: [],
	})
)

const run = spawnSync(
	process.execPath,
	[scriptPath, outDir, assets, String(FIXTURE_BOARD.w), String(FIXTURE_BOARD.h)],
	{ encoding: 'utf8' }
)
assert(run.status === 0, `exit ${run.status} stderr=${run.stderr}`)

const out = JSON.parse(fs.readFileSync(path.join(outDir, '_icon_gap_overlays.json'), 'utf8'))
assert(!out.items.some((i) => i.elementId === 'gap-small'), 'small gap must not map backdrop')
assert(
	out.items.some((i) => i.elementId === 'gap-auto' && i.file === FIXTURE_ICON_A),
	'auto-resolved keeps icon/ subpath'
)
assert(out.items.some((i) => i.file.startsWith('icon/')), 'overlay file keeps subdir')

console.log(`\nAll gen-icon-overlays cases: ${passed} passed, ${failed} failed.`)
process.exit(failed > 0 ? 1 : 0)
