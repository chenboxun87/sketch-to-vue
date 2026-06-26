// audit-slice-assets.mjs
// ─────────────────────────────────────────────────────────────────────────────
// 目的：在「只用已有干净资源、缺失精准留空」的策略下，对 MeaXure 导出做确定性
//       资产审计，产出两份产物：
//
//   1) slice-asset-audit.json —— 消费端（Vue/HTML）据此渲染：
//        byObjectId[id] = { assetPath, render, reason, rect, name }
//        skipIds = [ 不可渲染的 slice objectID ]   ← 消费端必须跳过、留空
//      规则（全部来自深度解析 index.html 的 `let data` 图层树 + assets/ 实际文件，
//      不靠尺寸/AI 猜测）：
//        · 唯一 exportable 且文件在盘            → render:true（正常用）
//        · slice 重名碰撞（同名不同尺寸）：
//             磁盘文件尺寸 ≈ 某 rect 的那个 = 胜出者 → render:true
//             其余引用（像素已被覆盖删除）       → render:false reason=collision-overwritten
//        · 声明导出但 PNG 不在盘                  → render:false reason=missing-asset
//
//   2) slice-asset-gap-report.md —— 面向「向设计师索取切图素材」的人类可读缺口清单：
//        列出所有「不存在干净像素、页面将留空」的元素（碰撞失败方 + 磁盘缺失 +
//        图片填充 ghost shape），含名称/区域/坐标/尺寸/缺陷类型/根治方式。
//
// ⚠️ 本脚本不裁剪预览、不生成兜底像素。缺失元素一律留空，由使用者补充切图后填充。
//
// Usage:
//   node audit-slice-assets.mjs <index.html> <outAuditJson> [outReportMd] [artboardIndex] [minArea]
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'

const [, , htmlPath, outAuditJson, outReportArg, artboardIdxArg, minAreaArg] = process.argv
if (!htmlPath || !outAuditJson) {
	console.error('Usage: node audit-slice-assets.mjs <index.html> <outAuditJson> [outReportMd] [artboardIndex] [minArea]')
	process.exit(1)
}
const artboardIndex = artboardIdxArg ? Number(artboardIdxArg) : 0
const MIN_AREA = minAreaArg ? Number(minAreaArg) : 8 * 8
const outReport = outReportArg || path.join(path.dirname(outAuditJson), 'slice-asset-gap-report.md')

const html = fs.readFileSync(htmlPath, 'utf8')
const data = parseMeaxureData(html)
const artboard = data.artboards?.[artboardIndex]
if (!artboard) throw new Error(`No artboard at index ${artboardIndex}`)
const board = {
	w: Math.round(artboard.rect?.width ?? artboard.width),
	h: Math.round(artboard.rect?.height ?? artboard.height),
}

const assetsDir = path.resolve(path.dirname(htmlPath), 'assets')
function diskPngSize(rel) {
	try {
		const fd = fs.openSync(path.join(assetsDir, rel), 'r')
		const buf = Buffer.alloc(24)
		fs.readSync(fd, buf, 0, 24, 0)
		fs.closeSync(fd)
		return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
	} catch { return null }
}

// 展平
const all = []
const childCount = new Map()
function walk(l) {
	if (!l || typeof l !== 'object') return
	all.push(l)
	childCount.set(l.objectID, (l.layers || []).length)
	for (const k of (l.layers || [])) walk(k)
}
for (const r of (artboard.layers || [])) walk(r)

// exportable path → refs
const pathRefs = new Map()
for (const l of all) {
	if (!l.exportable || !l.exportable.length) continue
	const p1 = (l.exportable.find((e) => !/@2x/.test(e.path)) || l.exportable[0]).path
	if (!pathRefs.has(p1)) pathRefs.set(p1, [])
	pathRefs.get(p1).push(l)
}

const byObjectId = {}
const skipIds = []
const gaps = []

for (const [p1, refs] of pathRefs) {
	const disk = diskPngSize(p1)
	const sizes = new Set(refs.map((l) => `${Math.round(l.rect.width)}x${Math.round(l.rect.height)}`))
	const isCollision = refs.length > 1 && sizes.size > 1

	for (const l of refs) {
		const rect = { x: r2(l.rect.x), y: r2(l.rect.y), w: r2(l.rect.width), h: r2(l.rect.height) }
		if (!disk) {
			byObjectId[l.objectID] = { assetPath: p1, render: false, reason: 'missing-asset', rect, name: l.name }
			skipIds.push(l.objectID)
			gaps.push({ ...rect, name: l.name, kind: 'missing-asset', exportPath: p1, id: l.objectID })
			continue
		}
		if (isCollision) {
			const isWinner = Math.abs(l.rect.width - disk.w) <= 2 && Math.abs(l.rect.height - disk.h) <= 2
			if (isWinner) {
				byObjectId[l.objectID] = { assetPath: p1, render: true, reason: 'collision-winner', rect, name: l.name }
			} else {
				byObjectId[l.objectID] = { assetPath: p1, render: false, reason: 'collision-overwritten', rect, name: l.name }
				skipIds.push(l.objectID)
				gaps.push({ ...rect, name: l.name, kind: 'collision-overwritten', exportPath: p1, id: l.objectID })
			}
			continue
		}
		byObjectId[l.objectID] = { assetPath: p1, render: true, reason: 'ok', rect, name: l.name }
	}
}

// 图片填充 ghost 叶子 shape（无干净像素，页面留空）——仅列入缺口清单，不进 skip（disposition 已排除）
function hasVisibleCss(cssArr) {
	return (cssArr || []).some((c) =>
		/(^|;|\s)(background(-image)?|border)\s*:/i.test(c) &&
		!/border-radius/i.test(c) && !/^\s*opacity/i.test(c) && !/^\s*transform/i.test(c)
	)
}
for (const l of all) {
	if (l.type !== 'shape') continue
	if ((childCount.get(l.objectID) || 0) > 0) continue
	if ((l.fills || []).length || (l.borders || []).length || (l.shadows || []).length) continue
	if (hasVisibleCss(l.css)) continue
	if (/^蒙版$/.test((l.name || '').trim())) continue
	const r = l.rect
	if (!r || r.width * r.height < MIN_AREA) continue
	if (r.width >= board.w * 0.99 && r.height >= board.h * 0.99) continue
	gaps.push({ x: r2(r.x), y: r2(r.y), w: r2(r.width), h: r2(r.height), name: l.name, kind: 'ghost-not-exported', exportPath: null, id: l.objectID })
}

fs.writeFileSync(outAuditJson, JSON.stringify({ board, skipIds, byObjectId, gapCount: dedupGaps(gaps).length }, null, 2))

// ── Markdown 缺口清单（去重、按区域） ────────────────────────────────────────
const rows = dedupGaps(gaps).sort((a, b) => (a.y - b.y) || (a.x - b.x))
const KIND = {
	'collision-overwritten': ['slice 重名碰撞被覆盖', '设计师对相关图层**唯一命名**后重新导出'],
	'missing-asset': ['声明了导出但 PNG 不在盘', '设计师**补充导出**该切片'],
	'ghost-not-exported': ['图片填充未导出（CSS 表达不了）', '设计师把该图层**单独标记为可导出切片**'],
}
const md = []
md.push('# 切图素材缺口清单（已有资源用全用对，缺失精准留空）')
md.push('')
md.push(`> 自动生成自 \`audit-slice-assets.mjs\`。画板 ${board.w}×${board.h}。本页**不裁预览、不打补丁**，下列元素在页面上**留空**，待补充切图后填充。`)
md.push('')
md.push('## 策略')
md.push('')
md.push('- 已有干净切片资产（`assets/*.png`）→ **丝毫不差地用全、用对、不冗余**。')
md.push('- 矢量形状（fill/border/css）/ 文本 → 按样式与活体文本重建。')
md.push('- 下表元素**没有任何干净像素来源**（导出环节被销毁/未导出）→ **精准留空**，使用者补切图后填充。')
md.push('')
md.push('## 缺陷类型')
md.push('')
md.push('| 类型 | 含义 | 根治方式 |')
md.push('| --- | --- | --- |')
for (const [k, [desc, fix]] of Object.entries(KIND)) md.push(`| \`${k}\` | ${desc} | ${fix} |`)
md.push('')
md.push(`## 需补充切图素材的元素（共 ${rows.length} 处，页面当前留空）`)
md.push('')
md.push('| # | 元素名 | 区域 | 坐标(x,y) | 尺寸(w×h) | 缺陷类型 | 碰撞/导出路径 |')
md.push('| --- | --- | --- | --- | --- | --- | --- |')
rows.forEach((e, i) => {
	md.push(`| ${i + 1} | ${e.name} | ${zone(e)} | ${Math.round(e.x)}, ${Math.round(e.y)} | ${Math.round(e.w)}×${Math.round(e.h)} | \`${e.kind}\` | ${e.exportPath ? '`' + e.exportPath + '`' : '—'} |`)
})
md.push('')
md.push('> 补充方式：把设计师给的切图放进 `design-assets/`，在场景图消费端按该 slice 的 exportable 路径渲染即可（缺口自动消失）。')
md.push('')
fs.writeFileSync(outReport, md.join('\n'))

console.log('=== audit-slice-assets ===')
console.log('画板:', `${board.w}×${board.h}`)
console.log('exportable 唯一路径:', pathRefs.size)
console.log('跳过(留空)的 slice:', skipIds.length, '(碰撞失败方 + 磁盘缺失)')
console.log('缺口清单条目:', rows.length)
console.log('审计:', outAuditJson)
console.log('清单:', outReport)

// helpers
function dedupGaps(list) {
	const m = new Map()
	for (const g of list) {
		const key = `${g.name}@${Math.round(g.x)},${Math.round(g.y)},${Math.round(g.w)}x${Math.round(g.h)}|${g.kind}`
		if (!m.has(key)) m.set(key, g)
	}
	return [...m.values()]
}
function zone(r) {
	const cx = r.x + r.w / 2, cy = r.y + r.h / 2
	const col = cx < board.w / 3 ? '左' : cx < (board.w * 2) / 3 ? '中' : '右'
	const row = cy < board.h / 3 ? '上' : cy < (board.h * 2) / 3 ? '中' : '下'
	return `${col}${row}`
}
function r2(v) { return Math.round((Number(v) || 0) * 100) / 100 }
function parseMeaxureData(source) {
	const marker = 'let data = {'
	const start = source.indexOf(marker)
	if (start === -1) throw new Error('Cannot find `let data = {`')
	let depth = 0, inString = false, quote = '', escaped = false, end = -1
	const objStart = start + marker.length - 1
	for (let i = objStart; i < source.length; i++) {
		const c = source[i]
		if (inString) {
			if (escaped) { escaped = false; continue }
			if (c === '\\') { escaped = true; continue }
			if (c === quote) inString = false
			continue
		}
		if (c === '"' || c === "'") { inString = true; quote = c; continue }
		if (c === '{') depth++
		if (c === '}') { depth--; if (depth === 0) { end = i; break } }
	}
	if (end === -1) throw new Error('Cannot parse data object')
	return JSON.parse(source.slice(objStart, end + 1))
}
