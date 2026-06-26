// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/design-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
/**
 * MeaXure §3.9 layer_stack 渲染计划（标准实现）
 *
 * 项目侧薄包装示例：
 *   import { buildBoardRenderPlan, indexElements } from '<skill>/templates/shared/boardRender.mjs'
 *   import { getLayerPublicPath } from './layerUrl.js'  // 或项目自定义 wrapper
 *
 *   const resolveAssetUrl = (file) => getLayerPublicPath(STATIC_BASE, file, resolveStaticPublicUrl)
 *   export function buildPageRenderPlan(opts) {
 *     return buildBoardRenderPlan({ ...opts, resolveAssetUrl })
 *   }
 *
 * 铁律（规则 74）：slice 与 icon-gap overlay 必须共用同一 resolveAssetUrl，禁止 copy-paste 后遗留其他模块函数名。
 */

import { parseCssArray, synthBorderFromAttrs, stopColorRaw } from './vectorStyle.mjs'

const TEXT_ARTIFACT_BORDER = /border:\s*1px\s+solid\s+#979797/i

function normalizeTextColor(c) {
	if (!c || typeof c !== 'string') return ''
	return c.replace(/\s+\d+%\s*$/, '').trim()
}

function fontFamilyFromCss(css, fallback) {
	const line = (css || []).find((c) => /font-family/i.test(c))
	if (!line) return fallback || ''
	const m = line.match(/font-family:\s*([^;]+)/i)
	return m ? m[1].trim().replace(/['"]/g, '') : (fallback || '')
}

function fontStack(family) {
	const f = String(family || '').trim().replace(/['"]/g, '')
	if (!f) return "'PingFang SC','Microsoft YaHei',sans-serif"
	if (/DINAlternate/i.test(f) || /^DIN\s/i.test(f))
		return `'D-DIN-PRO','DINAlternate-Bold','${f}','Helvetica Neue',Arial,sans-serif`
	if (/YouShe/i.test(f)) return `'YouSheBiaoTiHei','${f}','PingFang SC',sans-serif`
	if (/PingFangSC/i.test(f)) return `'PingFang SC','${f}','Microsoft YaHei',sans-serif`
	return `'${f}','PingFang SC','Microsoft YaHei',sans-serif`
}

function textGradientStyle(el) {
	const fill = (el.fills || []).find(
		(f) => f.type === 'gradient' && Array.isArray(f.stops) && f.stops.length >= 2
	)
	if (!fill) return null
	const parts = fill.stops.map((s) => {
		const pos = s.position != null ? (s.position <= 1 ? s.position * 100 : s.position) : 0
		return `${stopColorRaw(s.color)} ${pos}%`
	})
	const angle = fill.angle != null ? fill.angle : 180
	return {
		background: `linear-gradient(${angle}deg, ${parts.join(', ')})`,
		WebkitBackgroundClip: 'text',
		backgroundClip: 'text',
		WebkitTextFillColor: 'transparent',
		color: 'transparent',
	}
}

function solidTextColor(el) {
	const solid = (el.fills || []).find((f) => f.type === 'solid')
	if (solid && solid.color) return stopColorRaw(solid.color)
	return el.colorRgba || normalizeTextColor(el.color) || '#ffffff'
}

function textShadowCss(shadows) {
	if (!Array.isArray(shadows) || !shadows.length) return 'none'
	return shadows
		.map((s) => {
			const c = (s.color && s.color['css-rgba']) || 'rgba(0,0,0,0.3)'
			return `${s.offsetX || 0}px ${s.offsetY || 0}px ${s.blurRadius || 0}px ${c}`
		})
		.join(', ')
}

function buildTextStyle(el) {
	const cssFont = fontFamilyFromCss(el.css, el.fontFamily || el.fontFace)
	const style = {
		fontFamily: fontStack(cssFont),
		fontSize: `${el.fontSize || 14}px`,
		lineHeight: el.lineHeight ? `${el.lineHeight}px` : 'normal',
		letterSpacing: `${el.letterSpacing || 0}px`,
		textAlign: el.textAlign || 'left',
		textShadow: textShadowCss(el.shadows),
		opacity: el.opacity != null ? el.opacity : 1,
		overflow: 'visible',
		whiteSpace: 'nowrap',
	}
	const grad = textGradientStyle(el)
	if (grad) Object.assign(style, grad)
	else style.color = solidTextColor(el)
	const ff = (el.css || []).find((c) => /font-weight/i.test(c))
	if (ff) {
		const m = ff.match(/font-weight:\s*([^;]+)/)
		if (m) style.fontWeight = m[1].trim()
	} else if (el.fontWeight) {
		style.fontWeight = el.fontWeight
	}
	if (el.rotation) style.transform = `rotate(${el.rotation}deg)`
	return style
}

function zoneArea(rect) {
	return (rect.w || 0) * (rect.h || 0)
}

/** 全屏背景与括号装饰常由 Index.vue 单独处理 */
export const DEFAULT_SKIP_SLICE_NAMES = /^(BG|位图备份\s*7|位图备份\s*11)$/

/** 图表区内须保留的面板背景/装饰层（规则 33） */
export const DEFAULT_KEEP_IN_ZONE_RE =
	/^(框框|面板背景|矩形备份\s*\d+|BG|编组备份\s*\d+|编组\s*\d+备份|形状结合|光效|蒙版|路径|路径备份|pic\/|组\s*\d+|雷达图|位图|第[一二三]产业)/

function buildChartExcludeIds(zones) {
	const ids = new Set()
	;(zones || []).forEach((z) => {
		;(z.excludeLayerIds || []).forEach((id) => ids.add(id))
	})
	return ids
}

function overlapsChartZone(rect, zones) {
	const area = (rect.w || 0) * (rect.h || 0)
	return (zones || []).some((zone) => {
		const zr = zone.rect
		const zArea = zoneArea(zr)
		if (zArea > 0 && area >= zArea * 0.9 && rect.w >= zr.w * 0.85 && rect.h >= zr.h * 0.85) {
			return false
		}
		const cx = rect.x + rect.w / 2
		const cy = rect.y + rect.h / 2
		return cx >= zr.x && cx <= zr.x + zr.w && cy >= zr.y && cy <= zr.y + zr.h
	})
}

export function shouldExcludeFromChartZone(layer, zones, chartExcludeIds, keepInZoneRe = DEFAULT_KEEP_IN_ZONE_RE) {
	if (keepInZoneRe.test(layer.name || '')) return false
	if (chartExcludeIds.has(layer.id)) return true
	return overlapsChartZone(layer.rect, zones)
}

export function isSketchClipMask(layer) {
	if (!layer.name || !/^蒙版/.test(layer.name)) return false
	if (layer.source?.kind !== 'vector-css') return false
	const css = (layer.source?.css || []).join(' ')
	return /background\s*:\s*#[Ff]{3,6}\b|background\s*:\s*rgba?\(\s*255[\s,]/.test(css)
}

function isFakeBarLayer(layer, el, fakeBarIds) {
	if (fakeBarIds.has(layer.id)) return true
	if (!el || el.type !== 'shape') return false
	const r = layer.rect
	if (!r || r.w > 24 || r.w < 6 || r.h < 8) return false
	const css = (el.css || []).join(' ')
	if (r.w <= 24 && /linear-gradient/i.test(css) && /background/i.test(css)) return true
	return r.w <= 18 && r.h >= 30 && /background\s*:\s*#/i.test(css)
}

function isTextArtifact(el) {
	return (el.css || []).some((c) => TEXT_ARTIFACT_BORDER.test(c))
}

/**
 * @param {object} opts
 * @param {object} opts.layerStack - _layer_stack.json
 * @param {Record<string,object>} opts.elementsById - indexElements() 产出
 * @param {object} opts.gapsReport - _render_gaps_report.json
 * @param {object} opts.iconOverlays - _icon_gap_overlays.json
 * @param {object} opts.chartZones - chartZones.json / _chart_zones.json
 * @param {(filePath: string) => string} opts.resolveAssetUrl - **必填**；slice 与 icon-gap 共用
 * @param {RegExp} [opts.skipSliceNames]
 * @param {RegExp} [opts.keepInZoneRe]
 */
export function buildBoardRenderPlan({
	layerStack,
	elementsById,
	gapsReport,
	iconOverlays,
	chartZones,
	resolveAssetUrl,
	skipSliceNames = DEFAULT_SKIP_SLICE_NAMES,
	keepInZoneRe = DEFAULT_KEEP_IN_ZONE_RE,
}) {
	if (typeof resolveAssetUrl !== 'function') {
		throw new TypeError(
			'buildBoardRenderPlan: resolveAssetUrl is required (slice + icon-gap must share one URL resolver; see hard-won-rules §74)'
		)
	}

	const dropTextIds = new Set((gapsReport.duplicateTextGroups || []).map((g) => g.dropId))
	const fakeBarIds = new Set((gapsReport.fakeBarShapes || []).map((b) => b.id))
	const degenerateIds = new Set((gapsReport.degenerateBorderPaths || []).map((d) => d.id))
	const overlayIds = new Set((iconOverlays.items || []).map((item) => item.elementId))

	const iconOverlayById = new Map(
		(iconOverlays.items || []).map((item) => [item.elementId, item])
	)
	const iconGapRects = (gapsReport.iconGapCandidates || [])
		.filter((c) => overlayIds.has(c.id))
		.map((c) => ({
			...c,
			overlay: iconOverlayById.get(c.id),
		}))

	const chartExcludeIds = buildChartExcludeIds(chartZones?.zones || [])
	const zones = chartZones?.zones || []

	const layers = []
	;(layerStack.layers || []).forEach((layer) => {
		if (skipSliceNames.test(layer.name || '')) return
		if (dropTextIds.has(layer.id)) return
		if (degenerateIds.has(layer.id)) return
		if (overlayIds.has(layer.id)) return
		if (isSketchClipMask(layer)) return
		if (isFakeBarLayer(layer, elementsById[layer.id], fakeBarIds)) return
		if (shouldExcludeFromChartZone(layer, zones, chartExcludeIds, keepInZoneRe)) return

		const base = {
			id: layer.id,
			name: layer.name,
			z: layer.z,
			rect: layer.rect,
			role: layer.role,
		}
		const src = layer.source || {}
		const el = elementsById[layer.id]

		if (src.kind === 'slice-file') {
			layers.push({
				...base,
				kind: 'slice',
				src: resolveAssetUrl(src.file),
				fit: src.fit || 'fill',
				style: parseCssArray(el && el.css, { keepTransform: false }),
			})
			return
		}

		if (src.kind === 'vector-css') {
			const cssStyle = parseCssArray(src.css, { keepTransform: true })
			const borderStyle = synthBorderFromAttrs(src)
			layers.push({
				...base,
				kind: 'vector',
				style: { ...cssStyle, ...borderStyle },
			})
			return
		}

		if (src.kind === 'live-text-static' || src.kind === 'live-text-dynamic') {
			if (!el || isTextArtifact(el)) return
			layers.push({
				...base,
				kind: src.kind === 'live-text-dynamic' ? 'live-text' : 'text',
				content: el.content || layer.name || '',
				textStyle: buildTextStyle(el),
			})
		}
	})

	iconGapRects.forEach((gap) => {
		if (!gap.overlay || !gap.overlay.file) return
		layers.push({
			id: `icon-gap-${gap.id}`,
			name: gap.name,
			z: 9990,
			rect: gap.rect,
			kind: 'slice',
			src: resolveAssetUrl(gap.overlay.file),
			fit: 'contain',
			style: {},
		})
	})

	layers.sort((a, b) => a.z - b.z)
	return layers
}

export function indexElements(allElements) {
	const map = {}
	;(allElements.elements || allElements.layers || []).forEach((el) => {
		map[el.id] = el
	})
	return map
}

/** 统计 layer_stack 中可渲染层数量（用于 verify 门禁阈值） */
export function countStackRenderableHints(layerStack, skipSliceNames = DEFAULT_SKIP_SLICE_NAMES) {
	const layers = layerStack?.layers || []
	let slice = 0
	let vector = 0
	let text = 0
	for (const l of layers) {
		if (skipSliceNames.test(l.name || '')) continue
		const k = l.source?.kind || ''
		if (k === 'slice-file') slice++
		else if (k === 'vector-css') vector++
		else if (k === 'live-text-static' || k === 'live-text-dynamic') text++
	}
	return { total: layers.length, slice, vector, text, hint: slice + vector + text }
}
