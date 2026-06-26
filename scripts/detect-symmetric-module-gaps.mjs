#!/usr/bin/env node
/**
 * 对称 KPI 卡片审计：漏导 + 同 pitch 处置不一致 + clone 落点跨 panel 风险。
 * 用法: node detect-symmetric-module-gaps.mjs <_all_elements.json> [outJson]
 */
import fs from 'node:fs'
import path from 'node:path'

const inFile = process.argv[2]
const outFile = process.argv[3] || path.join(path.dirname(inFile || '.'), '_symmetric_module_gaps.json')

if (!inFile || !fs.existsSync(inFile)) {
	console.error('Usage: node detect-symmetric-module-gaps.mjs <_all_elements.json> [outJson]')
	process.exit(1)
}

const { elements = [] } = JSON.parse(fs.readFileSync(inFile, 'utf8'))

const KPI_CARD_NAMES = new Set(['矩形备份 5', '矩形背景 2'])
const PANEL_SLICE_RE = /^编组 5备份 \d+$/
const CARD_W = 168
const CARD_H = 83
const ICON_SLICE_NAME = '编组 40'

function uniqPanelsByY(slices) {
	const byY = new Map()
	for (const sl of slices) {
		const key = sl.rect.y
		if (!byY.has(key) || sl.rect.x > byY.get(key).rect.x) {
			byY.set(key, sl)
		}
	}
	return [...byY.values()].sort((a, b) => a.rect.y - b.rect.y)
}

const panelSlices = uniqPanelsByY(
	elements.filter((e) => e.type === 'slice' && PANEL_SLICE_RE.test(e.name || ''))
)

let pitchY = null
if (panelSlices.length >= 2) {
	const diffs = []
	for (let i = 1; i < panelSlices.length; i++) {
		diffs.push(panelSlices[i].rect.y - panelSlices[i - 1].rect.y)
	}
	const freq = new Map()
	for (const d of diffs) freq.set(d, (freq.get(d) || 0) + 1)
	pitchY = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

const kpiCards = elements.filter(
	(e) =>
		(e.type === 'shape' && KPI_CARD_NAMES.has(e.name)) ||
		(e.type === 'slice' && (e.name || '').startsWith('矩形背景'))
)

function panelForY(y) {
	return panelSlices.find((p) => y >= p.rect.y && y < p.rect.y + p.rect.h)
}

const gaps = []
for (const card of kpiCards) {
	const { x, y, w, h } = card.rect
	const home = panelForY(y)
	for (const panel of panelSlices) {
		if (home && panel.rect.y === home.rect.y) continue
		const dy = panel.rect.y - (home?.rect.y ?? panelSlices[0].rect.y)
		const targetY = y + dy
		const hasPeer = elements.some(
			(e) =>
				(e.type === 'shape' || e.type === 'slice') &&
				Math.abs(e.rect.x - x) < 2 &&
				Math.abs(e.rect.y - targetY) < 4 &&
				Math.abs(e.rect.w - w) < 2 &&
				Math.abs(e.rect.h - h) < 2
		)
		if (!hasPeer) {
			gaps.push({
				kind: 'missing-peer',
				templateId: card.id,
				templateName: card.name,
				templateRect: card.rect,
				missingAt: { x, y: targetY, w, h },
				panelSlice: panel.name,
				dy,
				hint:
					'若 missingAt 落在下一业务区块（如模块C），勿用 template.y+dy 盲 clone；用「参考行→目标行」dy',
			})
		}
	}
}

/** 同 pitch 槽位：slice 行 vs vector 行处置不一致 */
const dispositionMismatches = []
if (pitchY && kpiCards.length >= 2) {
	const sorted = [...kpiCards].sort((a, b) => a.rect.y - b.rect.y)
	for (let i = 1; i < sorted.length; i++) {
		const a = sorted[i - 1]
		const b = sorted[i]
		const delta = b.rect.y - a.rect.y
		if (Math.abs(delta - pitchY) > 8) continue
		if (a.name === b.name) continue
		dispositionMismatches.push({
			kind: 'disposition-mismatch',
			referenceRow: { id: a.id, name: a.name, y: a.rect.y, type: a.type },
			targetRow: { id: b.id, name: b.name, y: b.rect.y, type: b.type },
			pitchY: delta,
			hint: 'Sketch 视觉一致时，Implement 应用 excludeNativeIds + clone 参考行（见 symmetric-kpi-override.md）',
		})
	}
}

/** 168×83 槽位缺 编组40 slice 伴随 */
const iconGaps = []
for (const card of kpiCards) {
	const { x, y, w, h } = card.rect
	if (Math.abs(w - CARD_W) > 3 || Math.abs(h - CARD_H) > 3) continue
	const iconNear = elements.some(
		(e) =>
			(e.name === ICON_SLICE_NAME && e.type === 'slice') &&
			Math.abs(e.rect.x - (x + 17)) < 30 &&
			Math.abs(e.rect.y - (y + 22)) < 30
	)
	const vectorIconNear = elements.some(
		(e) =>
			e.type === 'shape' &&
			(e.name || '').includes('Top_Isometric') &&
			Math.abs(e.rect.x - (x + 17)) < 30 &&
			Math.abs(e.rect.y - (y + 28)) < 30
	)
	if (!iconNear && vectorIconNear) {
		iconGaps.push({
			kind: 'vector-icon-instead-of-slice',
			cardId: card.id,
			cardName: card.name,
			cardRect: card.rect,
			hint: '卡片 icon 为 isometric 矢量；若参考行用 编组40 slice，需 override 非 CSS 微调',
		})
	}
}

const report = {
	version: 2,
	pitchY,
	panelSlices: panelSlices.map((p) => ({ name: p.name, y: p.rect.y, h: p.rect.h })),
	kpiTemplates: kpiCards.map((c) => ({ id: c.id, name: c.name, type: c.type, rect: c.rect })),
	gaps,
	dispositionMismatches,
	iconGaps,
}

fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8')
const issueCount = gaps.length + dispositionMismatches.length + iconGaps.length
console.log(
	`Wrote ${outFile} (gaps=${gaps.length} disposition=${dispositionMismatches.length} icon=${iconGaps.length})`
)
if (issueCount) process.exit(1)
