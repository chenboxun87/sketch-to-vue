#!/usr/bin/env node
/**
 * verify-board-render-plan.mjs — 交付前渲染计划门禁
 *
 * 用法：
 *   node verify-board-render-plan.mjs <dataDir>
 *
 * 读取 dataDir 下 _layer_stack / _all_elements / _render_gaps_report /
 * _icon_gap_overlays.json（或 _icon_gap_overlays 缺失则空）/ chartZones.json，
 * 调用 templates/shared/boardRender.mjs 生成 plan 并做阈值校验。
 *
 * exit 0 = 通过；exit 1 = 校验失败；exit 2 = 运行期异常（如 ReferenceError）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	buildBoardRenderPlan,
	indexElements,
	countStackRenderableHints,
	DEFAULT_SKIP_SLICE_NAMES,
} from '../templates/shared/boardRender.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readJson(p) {
	return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function loadOptional(p, fallback) {
	return fs.existsSync(p) ? readJson(p) : fallback
}

function main() {
	const dataDir = process.argv[2]
	if (!dataDir) {
		console.error('Usage: node verify-board-render-plan.mjs <dataDir>')
		process.exit(2)
	}

	const abs = path.resolve(dataDir)
	const layerStack = readJson(path.join(abs, '_layer_stack.json'))
	const allElements = readJson(path.join(abs, '_all_elements.json'))
	const gapsReport = loadOptional(path.join(abs, '_render_gaps_report.json'), {})
	const iconOverlays = loadOptional(path.join(abs, '_icon_gap_overlays.json'), { items: [] })
	const chartZones = loadOptional(path.join(abs, 'chartZones.json'), null)
		|| loadOptional(path.join(abs, '_chart_zones.json'), { zones: [] })

	const elementsById = indexElements(allElements)
	const mockResolve = (file) => `/static/mock-design-assets/${String(file || '').replace(/\\/g, '/')}`

	let plan
	try {
		plan = buildBoardRenderPlan({
			layerStack,
			elementsById,
			gapsReport,
			iconOverlays,
			chartZones,
			resolveAssetUrl: mockResolve,
		})
	} catch (err) {
		console.error('FAIL: buildBoardRenderPlan threw:', err.message)
		if (err.stack) console.error(err.stack.split('\n').slice(0, 4).join('\n'))
		process.exit(2)
	}

	const hints = countStackRenderableHints(layerStack)
	const planSlice = plan.filter((l) => l.kind === 'slice').length
	const planVector = plan.filter((l) => l.kind === 'vector').length
	const planText = plan.filter((l) => l.kind === 'text' || l.kind === 'live-text').length
	const iconGapCount = plan.filter((l) => String(l.id || '').startsWith('icon-gap-')).length

	const errors = []
	const minPlan = Math.max(10, Math.floor(hints.hint * 0.15))

	if (hints.hint >= 50 && plan.length < minPlan) {
		errors.push(
			`plan too small: ${plan.length} layers (expected >= ${minPlan} when stack hint=${hints.hint})`
		)
	}
	if (hints.text >= 20 && planText < Math.floor(hints.text * 0.2)) {
		errors.push(`text layers missing: plan=${planText}, stack text hint=${hints.text}`)
	}
	if (hints.vector >= 10 && planVector < Math.floor(hints.vector * 0.2)) {
		errors.push(`vector layers missing: plan=${planVector}, stack vector hint=${hints.vector}`)
	}
	if ((iconOverlays.items || []).length > 0 && iconGapCount === 0) {
		errors.push('icon overlays configured but no icon-gap layers in plan (check overlay elementIds)')
	}
	const badSrc = plan.filter((l) => l.kind === 'slice' && (!l.src || l.src.includes('undefined')))
	if (badSrc.length) {
		errors.push(`${badSrc.length} slice layers have invalid src (undefined resolver?)`)
	}

	const report = {
		ok: errors.length === 0,
		dataDir: abs,
		stack: hints,
		plan: {
			total: plan.length,
			slice: planSlice,
			vector: planVector,
			text: planText,
			iconGap: iconGapCount,
		},
		errors,
	}

	console.log(JSON.stringify(report, null, 2))
	process.exit(report.ok ? 0 : 1)
}

main()
