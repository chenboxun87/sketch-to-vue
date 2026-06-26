#!/usr/bin/env node
/**
 * gen-icon-overlays.mjs
 *
 * 读 _icon_gap_candidates.json + 已部署静态资产目录，产出 _icon_gap_overlays.json。
 * 须在 gen-icon-gap-candidates.mjs 之后运行。
 *
 * 规则：
 * - file 字段保留 icon/、pic/ 相对路径（与 layerUrl.relativeAssetPath 一致）
 * - 禁止将全屏背景（BG备份.png 等）映射到小 ghost 矩形
 * - score >= 0.12 或 auto-resolved 才采纳；否则尝试邻近文本 ↔ icon/ 文件名匹配
 *
 * Usage:
 *   node gen-icon-overlays.mjs <outDir> <deployedAssetsDir> [boardW] [boardH]
 *
 * deployedAssetsDir = 项目 static/<module>/design-assets/（非设计稿源 assets）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'
import { FULLSCREEN_BACKDROP_BASENAMES, SMALL_GHOST_AREA_RATIO } from '../templates/shared/layerUrl.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const [, , outDir, deployedAssetsDir, boardWArg, boardHArg] = process.argv
if (!outDir || !deployedAssetsDir) {
	console.error('Usage: node gen-icon-overlays.mjs <outDir> <deployedAssetsDir> [boardW] [boardH]')
	process.exit(1)
}

const candidatesPath = path.join(outDir, '_icon_gap_candidates.json')
if (!fs.existsSync(candidatesPath)) {
	console.error(`[gen-icon-overlays] 缺少 ${candidatesPath}，请先运行 gen-icon-gap-candidates.mjs`)
	process.exit(1)
}

const allElementsPath = path.join(outDir, '_all_elements.json')
const allElements = fs.existsSync(allElementsPath)
	? JSON.parse(fs.readFileSync(allElementsPath, 'utf8'))
	: { elements: [] }

const boardW = Number(boardWArg) || allElements.board?.w || 1920
const boardH = Number(boardHArg) || allElements.board?.h || 1080
const boardArea = boardW * boardH

function walkAssets(dir, prefix = '') {
	const byName = new Map()
	const byNorm = new Map()
	if (!fs.existsSync(dir)) return { byName, byNorm }
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${ent.name}` : ent.name
		const abs = path.join(dir, ent.name)
		if (ent.isDirectory()) {
			const sub = walkAssets(abs, rel)
			sub.byName.forEach((v, k) => byName.set(k, v))
			sub.byNorm.forEach((v, k) => byNorm.set(k, v))
		} else if (/\.(png|jpg|jpeg|webp|svg)$/i.test(ent.name)) {
			byName.set(ent.name, rel)
			const norm = ent.name.replace(/\.(png|jpg|jpeg|webp|svg)$/i, '').replace(/\s+/g, '')
			if (!byNorm.has(norm)) byNorm.set(norm, rel)
		}
	}
	return { byName, byNorm }
}

function normText(s) {
	return String(s || '')
		.replace(/[\n\r\t]/g, '')
		.replace(/\s+/g, '')
		.toLowerCase()
}

function rectArea(r) {
	return (r.w || 0) * (r.h || 0)
}

function expandRect(r, pad) {
	return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
}

function rectContains(outer, inner) {
	const cx = inner.x + inner.w / 2
	const cy = inner.y + inner.h / 2
	return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h
}

function resolveRel(file, assets) {
	if (!file) return null
	const bn = path.basename(file)
	return assets.byName.get(bn) || assets.byName.get(file) || null
}

function isBackdropForGap(file, rect) {
	const bn = path.basename(String(file).replace(/\\/g, '/'))
	if (!FULLSCREEN_BACKDROP_BASENAMES.has(bn)) return false
	return rectArea(rect) < boardArea * SMALL_GHOST_AREA_RATIO
}

function pickFile(item, assets, texts) {
	const rect = item.rect || {}
	const cands = (item.candidates || []).filter((c) => c.file && !isBackdropForGap(c.file, rect))
	const rec = item.recommended

	if (item.status === 'auto-resolved' && rec?.file && !isBackdropForGap(rec.file, rect)) {
		const rel = resolveRel(rec.file, assets)
		if (rel) return { file: rel, score: rec.score, reason: 'auto-resolved' }
	}

	if (rec?.file && !isBackdropForGap(rec.file, rect) && (rec.score || 0) >= 0.15) {
		const rel = resolveRel(rec.file, assets)
		if (rel) return { file: rel, score: rec.score, reason: rec.basis || 'recommended' }
	}

	const best = [...cands].sort((a, b) => (b.score || 0) - (a.score || 0))[0]
	if (best && (best.score || 0) >= 0.12) {
		const rel = resolveRel(best.file, assets)
		if (rel) return { file: rel, score: best.score, reason: best.basis || 'candidate' }
	}

	if (rect.w <= 600 && rect.h <= 200) {
		const zone = expandRect(rect, 280)
		const nearby = texts.filter((t) => t.rect && rectContains(zone, t.rect))
		for (const t of nearby) {
			const nt = normText(t.content || t.name)
			if (!nt || nt.length < 4) continue
			for (const [norm, rel] of assets.byNorm) {
				if (!rel.startsWith('icon/')) continue
				const nn = normText(norm)
				if (nt.includes(nn) || nn.includes(nt)) {
					return { file: rel, score: 0.5, reason: 'text-nearby-match' }
				}
			}
		}
	}

	return null
}

const assets = walkAssets(deployedAssetsDir)
const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))
const texts = (allElements.elements || []).filter((e) => e.type === 'text' && (e.content || e.name))

const items = []
for (const item of candidates.items || []) {
	const pick = pickFile(item, assets, texts)
	if (!pick) continue
	const abs = path.join(deployedAssetsDir, pick.file.split('/').join(path.sep))
	if (!fs.existsSync(abs)) continue
	items.push({
		elementId: item.elementId,
		name: item.name,
		file: pick.file,
		reason: pick.reason,
		score: pick.score,
	})
}

const out = {
	comment: 'gen-icon-overlays.mjs — 保留 icon/ 子路径；排除全屏背景误映射',
	generatedAt: new Date().toISOString(),
	deployedAssetsDir,
	items,
}

const outPath = path.join(outDir, '_icon_gap_overlays.json')
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`[gen-icon-overlays] wrote ${items.length} overlays (from ${(candidates.items || []).length} gaps) → ${outPath}`)

if (items.length < (candidates.items || []).length) {
	const skipped = (candidates.items || []).length - items.length
	console.warn(`[gen-icon-overlays] ${skipped} gaps 未映射（低置信度或无资产）；请人工核对 _icon_gap_candidates.json`)
}
