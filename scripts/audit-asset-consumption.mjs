// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// 资产消费自检（确定性，无需手工输入）。
//
// 在「人工肉眼挑错之前」对一个 scene-graph + 已部署资产目录做客观体检，
// 覆盖踩坑反复出现的三类问题：图片【漏用/错用/多用】、样式【漏用/错用/多用】。
//
// 输入全部来自磁盘，纯确定性、对低阶模型友好（不靠 AI 看图猜）。
//
// 检测项：
//   missing-asset        render-slice 引用的文件在资产目录里找不到 → 会 404（漏用）
//   shared-file          同一文件被多个 render-slice 以不同尺寸引用 → 复用/碰撞错用风险
//   aspect-distort       render-slice rect 比例与 PNG 自然比例严重不符 → fill 会拉伸（错用）
//   slice-transform      render-slice 的 css 带几何 transform（scaleX/rotate…）→ 已烘焙进 PNG，消费端必须 delete 防二次变换（错用）
//   empty-vector         render-vector 无任何可渲染样式 → 空盒/隐形（漏用或冗余）
//   text-fragment-overlap 复合文本与碎片文本重叠且都非 artifact → 双重渲染（多用）
//   unused-asset         资产目录里存在、但没有任何 render-slice 引用的 PNG（多用/冗余）
//
// 同时产出 slice-fit.suggest.json：aspect-distort 切片的 object-fit 建议，
// 供页面 slice-fit.json 人工确认后落地。
//
// 用法：
//   node audit-asset-consumption.mjs --scene <scene-graph.json> --assets <dir> [--out <dir>]
//   node audit-asset-consumption.mjs --self-test
//
// 注意：本脚本只做「设计数据级」体检，不感知页面自定义过滤（图表区/缺口区/去重），
// 因此个别条目可能是页面已有意处理的（误报偏宽松）。判定时结合页面逻辑。

import fs from 'fs'
import path from 'path'
import { hasRenderableStyle } from './disposition.mjs'

// ── 纯函数（可被测试 import） ────────────────────────────────────────────────

/** 从 PNG 文件头(IHDR)读宽高，不解码像素。非 PNG / 头损坏返回 null。 */
export function pngDimsFromBuffer(buf) {
	if (!buf || buf.length < 24) return null
	// 8B 签名 + 4B 长度 + "IHDR"(4B) + width(4B,@16) + height(4B,@20)
	if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null
	const w = buf.readUInt32BE(16)
	const h = buf.readUInt32BE(20)
	if (!w || !h) return null
	return { w, h }
}

/** 去目录、去扩展名、去 @2x/@3x 后缀，统一成资产键。 */
export function assetKey(p) {
	return String(p || '')
		.split(/[\\/]/).pop()
		.replace(/@[0-9.]+x(?=\.)/i, '')
		.replace(/\.(png|jpg|jpeg|svg|webp)$/i, '')
		.trim()
}

/**
 * 比例失真判定 + object-fit 建议。
 * 宽条塞窄方框（boxAR << pngAR）→ 内容多偏一侧，建议 cover + left（裁掉装饰、主体不缩）。
 * 窄图塞宽方框（boxAR >> pngAR）→ 建议 contain（不裁、不拉伸，可能留白）。
 */
export function aspectVerdict(boxW, boxH, pngW, pngH, distortRatio = 1.4) {
	if (!boxW || !boxH || !pngW || !pngH) return { distorted: false }
	const boxAR = boxW / boxH
	const pngAR = pngW / pngH
	const ratio = boxAR > pngAR ? boxAR / pngAR : pngAR / boxAR
	if (ratio < distortRatio) return { distorted: false, ratio: +ratio.toFixed(2) }
	const suggest = boxAR < pngAR
		? { fit: 'cover', position: 'left center' }
		: { fit: 'contain', position: 'center center' }
	return { distorted: true, ratio: +ratio.toFixed(2), boxAR: +boxAR.toFixed(2), pngAR: +pngAR.toFixed(2), suggest }
}

/** 两个 rect 是否重叠（含面积占比）。 */
export function rectOverlap(a, b) {
	const x = Math.max(a.x, b.x)
	const y = Math.max(a.y, b.y)
	const r = Math.min(a.x + a.w, b.x + b.w)
	const bt = Math.min(a.y + a.h, b.y + b.h)
	if (r <= x || bt <= y) return 0
	const inter = (r - x) * (bt - y)
	const minArea = Math.min(a.w * a.h, b.w * b.h) || 1
	return inter / minArea
}

const TEXT_ARTIFACT_RE = /border:\s*1px\s+solid\s+#979797/i

/** 几何 transform（翻转/旋转/倾斜/矩阵/位移）——切片已烘焙进 PNG，消费端必须剔除。 */
const GEOM_TRANSFORM_RE = /transform\s*:\s*[^;]*(scaleX|scaleY|scale|rotate|matrix|skew|translate)/i

/** 取节点 css 里所有几何 transform 声明（无则空数组）。 */
export function geomTransformsOf(attrs) {
	return ((attrs && attrs.css) || [])
		.map((c) => String(c))
		.filter((c) => GEOM_TRANSFORM_RE.test(c))
}

/** 取 render-slice 的资产引用路径。 */
function slicePath(node) {
	const a = node.attrs || {}
	return (a.exports && a.exports[0] && a.exports[0].path)
		|| (a.exportable && a.exportable[0] && a.exportable[0].path)
		|| ''
}

// ── 核心审计（纯逻辑，资产信息由调用方注入，便于测试） ───────────────────────

/**
 * @param {Array} nodes scene-graph nodes（含 disposition.kind / rect / attrs）
 * @param {Map<string,{w,h}|null>} assetDims  资产键 → 自然尺寸（null=磁盘缺失）
 * @param {Set<string>} assetKeysOnDisk        资产目录里所有键（用于 unused 检测）
 */
export function auditAssetConsumption(nodes, assetDims, assetKeysOnDisk) {
	const issues = []
	const fitSuggest = {}
	const usedKeys = new Set()
	const fileUsers = new Map() // key → [{id,w,h}]

	for (const n of nodes || []) {
		const kind = n.disposition && n.disposition.kind
		const rect = n.rect || {}

		if (kind === 'render-slice') {
			const key = assetKey(slicePath(n))
			if (!key) continue
			usedKeys.add(key)
			const arr = fileUsers.get(key) || []
			arr.push({ id: n.id, w: Math.round(rect.w || 0), h: Math.round(rect.h || 0) })
			fileUsers.set(key, arr)

			const dim = assetDims.get(key)
			if (dim === null || dim === undefined) {
				issues.push({ type: 'missing-asset', sev: 'high', id: n.id, name: n.name, asset: key, msg: '资产目录找不到该文件 → 运行时 404' })
				continue
			}
			const v = aspectVerdict(rect.w, rect.h, dim.w, dim.h)
			if (v.distorted) {
				issues.push({ type: 'aspect-distort', sev: 'mid', id: n.id, name: n.name, asset: key, ratio: v.ratio, box: `${Math.round(rect.w)}x${Math.round(rect.h)}`, png: `${dim.w}x${dim.h}`, suggest: v.suggest })
				fitSuggest[key] = v.suggest
			}
			const txs = geomTransformsOf(n.attrs)
			if (txs.length) {
				issues.push({ type: 'slice-transform', sev: 'high', id: n.id, name: n.name, asset: key, transform: txs, msg: '切片 css 带几何 transform——翻转/旋转已烘焙进 PNG，消费端 render-slice 分支必须 delete transform，否则二次变换（如左括号被翻成右括号）' })
			}
		} else if (kind === 'render-vector') {
			if (!hasRenderableStyle(n.attrs || {})) {
				issues.push({ type: 'empty-vector', sev: 'mid', id: n.id, name: n.name, msg: 'render-vector 无任何可渲染样式 → 空盒/隐形' })
			}
		}
	}

	// shared-file：同名文件被多个 slice 以不同尺寸引用
	for (const [key, arr] of fileUsers) {
		if (arr.length < 2) continue
		const dims = new Set(arr.map((u) => `${u.w}x${u.h}`))
		if (dims.size > 1) {
			issues.push({ type: 'shared-file', sev: 'mid', asset: key, users: arr, msg: '同一文件被多个切片以不同尺寸引用 → 复用/碰撞错用风险' })
		}
	}

	// text-fragment-overlap：复合文本与碎片文本重叠（双方都非 artifact）
	const texts = (nodes || []).filter((n) => {
		const k = n.disposition && n.disposition.kind
		return k === 'live-text-static' || k === 'live-text-dynamic'
	}).map((n) => ({
		id: n.id, name: n.name, rect: n.rect || {},
		content: (n.attrs && n.attrs.content) || '',
		artifact: TEXT_ARTIFACT_RE.test(((n.attrs && n.attrs.css) || []).join(' ')),
	}))
	for (let i = 0; i < texts.length; i++) {
		for (let j = i + 1; j < texts.length; j++) {
			const a = texts[i], b = texts[j]
			if (a.artifact || b.artifact) continue // artifact 碎片页面已过滤，不算双渲染
			if (!a.content || !b.content) continue
			const ov = rectOverlap(a.rect, b.rect)
			if (ov > 0.6 && a.content !== b.content) {
				issues.push({ type: 'text-fragment-overlap', sev: 'low', ids: [a.id, b.id], overlap: +ov.toFixed(2), a: a.content, b: b.content, msg: '两条非-artifact 文本高度重叠 → 可能双重渲染' })
			}
		}
	}

	// unused-asset：磁盘有但无切片引用
	for (const key of assetKeysOnDisk || []) {
		if (!usedKeys.has(key)) {
			issues.push({ type: 'unused-asset', sev: 'low', asset: key, msg: '资产目录存在但无任何 render-slice 引用 → 冗余/未消费（也可能是被页面过滤项的素材）' })
		}
	}

	return { ok: issues.filter((x) => x.sev === 'high').length === 0, issues, fitSuggest }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
	const o = {}
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--self-test') o.selfTest = true
		else if (a.startsWith('--')) o[a.slice(2)] = argv[++i]
	}
	return o
}

function loadAssetDir(dir) {
	const dims = new Map()
	const keys = new Set()
	if (!dir || !fs.existsSync(dir)) return { dims, keys }
	const walk = (d) => {
		for (const e of fs.readdirSync(d, { withFileTypes: true })) {
			const fp = path.join(d, e.name)
			if (e.isDirectory()) { walk(fp); continue }
			if (!/\.(png|jpg|jpeg|svg|webp)$/i.test(e.name)) continue
			const key = assetKey(e.name)
			keys.add(key)
			if (/\.png$/i.test(e.name)) {
				try { dims.set(key, pngDimsFromBuffer(fs.readFileSync(fp).subarray(0, 24))) }
				catch { dims.set(key, null) }
			} else {
				dims.set(key, { w: 1, h: 1 }) // 非 PNG：仅标记存在，不做比例检
			}
		}
	}
	walk(dir)
	return { dims, keys }
}

function main() {
	const o = parseArgs(process.argv.slice(2))
	if (o.selfTest) return selfTest()
	if (!o.scene || !o.assets) {
		console.error('用法: node audit-asset-consumption.mjs --scene <scene-graph.json> --assets <dir> [--out <dir>]')
		process.exit(2)
	}
	const sg = JSON.parse(fs.readFileSync(o.scene, 'utf8'))
	const { dims, keys } = loadAssetDir(o.assets)
	// assetDims 需对「被引用但磁盘没有」返回 undefined → 用 has 区分
	const assetDims = { get: (k) => (dims.has(k) ? dims.get(k) : null) }
	const res = auditAssetConsumption(sg.nodes || [], assetDims, keys)

	const outDir = o.out || path.dirname(o.scene)
	fs.writeFileSync(path.join(outDir, 'consumption-audit.json'), JSON.stringify(res, null, '\t'))
	if (Object.keys(res.fitSuggest).length) {
		fs.writeFileSync(path.join(outDir, 'slice-fit.suggest.json'), JSON.stringify(res.fitSuggest, null, '\t'))
	}

	const by = {}
	for (const it of res.issues) by[it.type] = (by[it.type] || 0) + 1
	console.log('── 资产消费自检 ──────────────────────────────')
	console.log(`节点: ${(sg.nodes || []).length}  资产: ${keys.size}  问题: ${res.issues.length}`)
	const order = ['missing-asset', 'slice-transform', 'shared-file', 'aspect-distort', 'empty-vector', 'text-fragment-overlap', 'unused-asset']
	for (const t of order) if (by[t]) console.log(`  [${by[t]}] ${t}`)
	const high = res.issues.filter((x) => x.sev === 'high')
	if (high.length) {
		console.log('\n⚠ 高优先级（会 404/明显错位）:')
		for (const h of high) console.log(`  ${h.type}  ${h.name || h.asset || ''}  ${h.msg || ''}`)
	}
	const dist = res.issues.filter((x) => x.type === 'aspect-distort')
	if (dist.length) {
		console.log('\n比例失真（建议见 slice-fit.suggest.json）:')
		for (const d of dist) console.log(`  ${d.asset}  box=${d.box} png=${d.png} ×${d.ratio} → ${d.suggest.fit} ${d.suggest.position}`)
	}
	console.log('\n详见 consumption-audit.json')
	process.exit(res.ok ? 0 : 1)
}

function selfTest() {
	let pass = 0, fail = 0
	const eq = (got, want, label) => {
		const ok = JSON.stringify(got) === JSON.stringify(want)
		console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
		ok ? pass++ : fail++
		if (!ok) console.log(`   got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
	}
	// pngDims
	const buf = Buffer.alloc(24)
	buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47
	buf.writeUInt32BE(286, 16); buf.writeUInt32BE(94, 20)
	eq(pngDimsFromBuffer(buf), { w: 286, h: 94 }, 'pngDimsFromBuffer 读 IHDR')
	eq(pngDimsFromBuffer(Buffer.alloc(10)), null, 'pngDimsFromBuffer 头太短=null')
	// assetKey
	eq(assetKey('大屏/小标题/月总指标量@2x.png'), '月总指标量', 'assetKey 去目录/@2x/扩展名')
	// aspectVerdict
	eq(aspectVerdict(144, 126, 286, 94).suggest, { fit: 'cover', position: 'left center' }, 'aspectVerdict 宽条→cover left')
	eq(aspectVerdict(323, 93, 286, 86).distorted, false, 'aspectVerdict 比例相近→不失真')
	eq(aspectVerdict(300, 50, 100, 100).suggest, { fit: 'contain', position: 'center center' }, 'aspectVerdict 宽框窄图→contain')
	// geomTransformsOf
	eq(geomTransformsOf({ css: ['transform: scaleX(-1);'] }), ['transform: scaleX(-1);'], 'geomTransformsOf 命中 scaleX')
	eq(geomTransformsOf({ css: ['opacity: 0.5;', 'transform: rotate(45deg);'] }), ['transform: rotate(45deg);'], 'geomTransformsOf 只取 transform')
	eq(geomTransformsOf({ css: ['opacity: 0.5;'] }), [], 'geomTransformsOf 无 transform→空')
	// auditAssetConsumption
	const nodes = [
		{ id: 'a', name: 'icon', rect: { x: 0, y: 0, w: 144, h: 126 }, disposition: { kind: 'render-slice' }, attrs: { exports: [{ path: 'icon.png' }] } },
		{ id: 'b', name: 'gone', rect: { x: 0, y: 0, w: 10, h: 10 }, disposition: { kind: 'render-slice' }, attrs: { exports: [{ path: 'gone.png' }] } },
		{ id: 'c', name: 'ghost', rect: { x: 0, y: 0, w: 10, h: 10 }, disposition: { kind: 'render-vector' }, attrs: { css: ['opacity: 0.5'] } },
		{ id: 'd', name: 'bracket', rect: { x: 0, y: 0, w: 100, h: 100 }, disposition: { kind: 'render-slice' }, attrs: { exports: [{ path: 'bracket.png' }], css: ['transform: scaleX(-1);'] } },
	]
	const dims = new Map([['icon', { w: 286, h: 94 }], ['bracket', { w: 100, h: 100 }]])
	const res = auditAssetConsumption(nodes, { get: (k) => (dims.has(k) ? dims.get(k) : null) }, new Set(['icon', 'bracket', 'orphan']))
	const types = res.issues.map((i) => i.type).sort()
	eq(types, ['aspect-distort', 'empty-vector', 'missing-asset', 'slice-transform', 'unused-asset'], 'auditAssetConsumption 命中五类')
	eq(res.ok, false, 'missing-asset/slice-transform → ok=false')
	console.log(`\n${pass} passed, ${fail} failed`)
	process.exit(fail ? 1 : 0)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
if (isMain) main()
