// gen-kpi-overlays.mjs —— 从 _all_elements.json 提取 KPI 数值文本，生成 kpiOverlays[]（活体数值覆盖层）
//
// 用途：大屏/驾驶舱中，KPI 数字常被烘焙进背景切片或散落为静态 text 图层；要把它们换成
// 「活体」可绑定 mock/接口的覆盖层时，本脚本确定性地产出每个 KPI 的位置/字号/颜色/局部背景色。
//
// 算法（与设计技法对应，勿改语义）：
//   1. 过滤「以数字/正负号开头」的 text 图层（KPI 数值；纯描述文字/单位行被排除）。
//   2. 排除落在动态区域（已由真实表格/图表渲染）的候选——见 --exclude。
//   3. 按 ~8px 取整去重，保留 content 最完整者。
//   4. 碎片抑制：候选中心落在另一候选盒内且内容更短 → 视为复合数值的子字形，丢弃。
//   5. 渐变末段色 / 纯色 → 文字色（缺省 #FFFFFF）。
//   6. 从 board@2x 预览在「文本盒外侧环带」采样局部背景色（中位数），供覆盖层底色（见规则 9）。
//
// 用法：
//   node gen-kpi-overlays.mjs --elements <_all_elements.json> --board <board@2x.png> \
//        --out <kpiOverlays.json> [--scale 2] [--exclude <regions.json>] [--num preserve|<固定值>]
//
//   --exclude regions.json：动态区域逻辑坐标数组 [[x0,y0,x1,y1], ...]（可选；缺省不排除）
//   --num：preserve=保留解析出的数值（默认）；给定固定值（如 1）则全部覆盖为该值（用于"证明活体"演示）
//   --board：可选；不传则 bg 字段输出 null（跳过背景采样）

import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

function parseArgs(argv) {
	const a = {}
	for (let i = 2; i < argv.length; i++) {
		const k = argv[i]
		if (k.startsWith('--')) {
			const key = k.slice(2)
			const next = argv[i + 1]
			if (next && !next.startsWith('--')) {
				a[key] = next
				i++
			} else {
				a[key] = true
			}
		}
	}
	return a
}

const args = parseArgs(process.argv)
if (!args.elements || !args.out) {
	console.error('用法: node gen-kpi-overlays.mjs --elements <_all_elements.json> --out <kpiOverlays.json> [--board <board@2x.png>] [--scale 2] [--exclude <regions.json>] [--num preserve|<固定值>]')
	process.exit(1)
}

const ELEMENTS = path.resolve(args.elements)
const OUT = path.resolve(args.out)
const BOARD = args.board ? path.resolve(args.board) : null
const SCALE = args.scale ? Number(args.scale) : 2
const NUM_MODE = args.num == null ? 'preserve' : String(args.num)

// 动态区域（逻辑坐标）[x0,y0,x1,y1]——已由真实表格/图表渲染，KPI 不在此生成覆盖层
let EXCLUDE = []
if (args.exclude) {
	EXCLUDE = JSON.parse(fs.readFileSync(path.resolve(args.exclude), 'utf8'))
}

function inExclude(cx, cy) {
	return EXCLUDE.some(([x0, y0, x1, y1]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1)
}

function cleanHex(c) {
	if (!c) return null
	const m = String(c).match(/#?[0-9a-fA-F]{6}/)
	return m ? '#' + m[0].replace('#', '').toUpperCase() : null
}

function endColor(layer) {
	const fills = layer.fills || []
	const grad = fills.find((f) => f.type === 'gradient')
	if (grad && Array.isArray(grad.stops) && grad.stops.length) {
		const last = grad.stops[grad.stops.length - 1]
		const hex = cleanHex(last.color)
		if (hex) return hex
	}
	const solid = fills.find((f) => f.type === 'solid')
	if (solid && cleanHex(solid.color)) return cleanHex(solid.color)
	if (layer.color && cleanHex(layer.color)) return cleanHex(layer.color)
	return '#FFFFFF'
}

function parseNumUnit(content) {
	const s = String(content).trim()
	const m = s.match(/^([+\-]?\d[\d,.]*)(.*)$/)
	if (!m) return null
	return { num: m[1], unit: (m[2] || '').trim() }
}

function alignOf(layer) {
	const a = (layer.textAlign || 'left').toLowerCase()
	if (a === 'center') return 'center'
	if (a === 'right') return 'right'
	return 'left'
}

// ---- load elements ----
const doc = JSON.parse(fs.readFileSync(ELEMENTS, 'utf8'))
const elements = doc.elements || []

const candidates = []
const excludedSample = []
for (const e of elements) {
	if (e.type !== 'text' || !e.content || !e.rect) continue
	const nu = parseNumUnit(e.content)
	if (!nu) continue // 非数字开头 → 描述文字/单位行
	const cx = e.rect.x + e.rect.w / 2
	const cy = e.rect.y + e.rect.h / 2
	if (inExclude(cx, cy)) {
		excludedSample.push({ content: e.content, cx: Math.round(cx), cy: Math.round(cy) })
		continue
	}
	candidates.push({
		content: e.content,
		x: Math.round(e.rect.x * 100) / 100,
		y: Math.round(e.rect.y * 100) / 100,
		w: Math.round(e.rect.w * 100) / 100,
		h: Math.round(e.rect.h * 100) / 100,
		fs: Math.round((e.fontSize || 24) * 10) / 10,
		end: endColor(e),
		align: alignOf(e),
		num: nu.num,
		unit: nu.unit,
	})
}

// ---- dedupe by rounded position (~8px), keep most-complete content ----
const byKey = new Map()
for (const c of candidates) {
	const key = `${Math.round(c.x / 8)}_${Math.round(c.y / 8)}`
	const prev = byKey.get(key)
	if (!prev || c.content.length > prev.content.length) byKey.set(key, c)
}
let deduped = [...byKey.values()].sort((a, b) => a.y - b.y || a.x - b.x)

// 碎片抑制：候选中心落在另一更大/更完整候选盒内 → 丢弃（复合数值的子字形，如 "1.2万棵"）
const suppressed = []
deduped = deduped.filter((c) => {
	const ccx = c.x + c.w / 2,
		ccy = c.y + c.h / 2
	const container = deduped.find(
		(o) =>
			o !== c &&
			ccx >= o.x &&
			ccx <= o.x + o.w &&
			ccy >= o.y &&
			ccy <= o.y + o.h &&
			o.content.length >= c.content.length &&
			o.w * o.h >= c.w * c.h
	)
	if (container) {
		suppressed.push(c)
		return false
	}
	return true
})

// ---- sample local background from board@2x on a ring band just outside the box ----
let png = null
if (BOARD) png = PNG.sync.read(fs.readFileSync(BOARD))
const RING = 6 // pixels (in board@2x space)

function median(arr) {
	if (!arr.length) return 0
	const s = [...arr].sort((a, b) => a - b)
	const mid = s.length >> 1
	return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function sampleBg(c) {
	if (!png) return null
	const px = Math.round(c.x * SCALE)
	const py = Math.round(c.y * SCALE)
	const pw = Math.round(c.w * SCALE)
	const ph = Math.round(c.h * SCALE)
	const x0 = Math.max(0, px - RING)
	const y0 = Math.max(0, py - RING)
	const x1 = Math.min(png.width - 1, px + pw + RING)
	const y1 = Math.min(png.height - 1, py + ph + RING)
	const rs = [],
		gs = [],
		bs = []
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const insideBox = x >= px && x <= px + pw && y >= py && y <= py + ph
			if (insideBox) continue // ring band only
			const i = (y * png.width + x) * 4
			if (png.data[i + 3] < 128) continue // skip transparent
			rs.push(png.data[i])
			gs.push(png.data[i + 1])
			bs.push(png.data[i + 2])
		}
	}
	const r = median(rs),
		g = median(gs),
		b = median(bs)
	const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
	return hex.toUpperCase()
}

const kpiOverlays = deduped.map((c) => ({
	x: c.x,
	y: c.y,
	w: c.w,
	h: c.h,
	fs: c.fs,
	end: c.end,
	align: c.align,
	bg: sampleBg(c),
	num: NUM_MODE === 'preserve' ? c.num : NUM_MODE,
	unit: c.unit,
}))

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(kpiOverlays, null, 2))

console.log('=== KPI overlays ===')
console.log('candidates(after leading-digit filter, outside exclude):', candidates.length)
console.log('excluded-by-region count:', excludedSample.length)
console.log('suppressed fragments:', suppressed.length, suppressed.map((s) => `${s.content}@${Math.round(s.x)},${Math.round(s.y)}`).join(' '))
console.log('deduped overlays:', kpiOverlays.length, '→', OUT)
