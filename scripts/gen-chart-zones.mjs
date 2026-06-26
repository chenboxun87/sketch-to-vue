/**
 * 从 _render_gaps_report.json + _all_elements.json + _layer_stack.json
 * 生成 chartZones.json（假柱聚类 bbox + 标题锚定 zone + excludeLayerIds）
 *
 * 用法：
 *   node gen-chart-zones.mjs <dataDir> [--panels panels.json] [--out chartZones.json]
 */
import fs from 'fs'
import path from 'path'
import { inferChartType } from './chart-features/detect-zones.mjs'
import { extractAxis, extractCategories } from './chart-features/extract-features.mjs'

const KEEP_IN_ZONE_RE =
	/^(框框|面板背景|矩形备份\s*\d+|BG|编组备份\s*\d+|编组\s*\d+备份|形状结合|光效|蒙版|路径|路径备份|pic\/|组\s*\d+|雷达图|位图|第[一二三]产业)/

const TITLE_HEIGHT = 44
const ZONE_MARGIN = 20
const MIN_BAR_W = 10
const MIN_BAR_H = 30
const X_CLUSTER_GAP = 120
const Y_BAND_GAP = 80

function isFakeBarShape(el) {
	if (!el || el.type !== 'shape') return false
	const r = el.rect
	if (!r || r.w > 24 || r.w < 6 || r.h < 8) return false
	const css = (el.css || []).join(' ')
	if (/linear-gradient/i.test(css) && /background/i.test(css)) return true
	return r.w <= 18 && r.h >= 30 && /background\s*:\s*#/i.test(css)
}

function inZoneCenter(rect, z) {
	if (!rect || !z) return false
	const cx = rect.x + rect.w / 2
	const cy = rect.y + rect.h / 2
	return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h
}

function bboxWithMargin(items, margin = ZONE_MARGIN) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
	for (const it of items) {
		const r = it.rect || it
		minX = Math.min(minX, r.x)
		minY = Math.min(minY, r.y)
		maxX = Math.max(maxX, r.x + r.w)
		maxY = Math.max(maxY, r.y + r.h)
	}
	if (!Number.isFinite(minX)) return null
	return {
		x: Math.max(0, Math.floor(minX - margin)),
		y: Math.max(0, Math.floor(minY - margin)),
		w: Math.ceil(maxX - minX + margin * 2),
		h: Math.ceil(maxY - minY + margin * 2),
	}
}

function clusterFakeBars(bars) {
	const filtered = bars.filter((b) => b.rect.w >= MIN_BAR_W && b.rect.h >= MIN_BAR_H)
	if (!filtered.length) return []

	const sorted = filtered.slice().sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
	const yBands = []
	for (const bar of sorted) {
		const cy = bar.rect.y + bar.rect.h / 2
		let band = yBands.find((b) => Math.abs(cy - b.cy) <= Y_BAND_GAP)
		if (!band) {
			band = { cy, bars: [] }
			yBands.push(band)
		}
		band.bars.push(bar)
		band.cy = (band.cy * (band.bars.length - 1) + cy) / band.bars.length
	}

	const clusters = []
	for (const band of yBands) {
		const row = band.bars.slice().sort((a, b) => a.rect.x - b.rect.x)
		// 宽 x 跨度的同 y 带假柱 → 分组柱图，合并为单 cluster（规则 30：按 bbox 定界）
		const span = row[row.length - 1].rect.x + row[row.length - 1].rect.w - row[0].rect.x
		if (row.length >= 12 && span > 400) {
			clusters.push(row)
			continue
		}
		let group = [row[0]]
		for (let i = 1; i < row.length; i++) {
			const prev = group[group.length - 1]
			const gap = row[i].rect.x - (prev.rect.x + prev.rect.w)
			if (gap > X_CLUSTER_GAP) {
				clusters.push(group)
				group = [row[i]]
			} else {
				group.push(row[i])
			}
		}
		if (group.length) clusters.push(group)
	}
	return clusters
}

function rectContains(outer, inner) {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.w <= outer.x + outer.w + 4 &&
		inner.y + inner.h <= outer.y + outer.h + 4
	)
}

function seriesFromBars(bars) {
	const sorted = bars.slice().sort((a, b) => a.rect.x - b.rect.x)
	const heights = sorted.map((b) => b.rect.h)
	const maxH = Math.max(...heights, 1)
	return heights.map((h) => Math.round((h / maxH) * 100))
}

function buildExcludeLayerIds(layers, zoneRect) {
	const zArea = zoneRect.w * zoneRect.h
	return layers
		.filter((layer) => {
			if (KEEP_IN_ZONE_RE.test(layer.name || '')) return false
			const r = layer.rect
			if (!r) return false
			const area = r.w * r.h
			if (zArea > 0 && area >= zArea * 0.9 && r.w >= zoneRect.w * 0.85 && r.h >= zoneRect.h * 0.85) {
				return false
			}
			return inZoneCenter(r, zoneRect)
		})
		.map((l) => l.id)
}

function zoneFromTitle(elements, panel) {
	const title = (panel.title || '').replace(/\s/g, '')
	const titleEl = elements.find(
		(e) => e.type === 'text' && (e.content || '').replace(/\s/g, '').includes(title)
	)
	if (!titleEl) return null
	const y0 = titleEl.rect.y + (panel.titleHeight || TITLE_HEIGHT)
	const h = panel.zoneHeight || 312
	return {
		id: panel.id || title,
		title: panel.title,
		chartType: panel.chartType || 'line',
		confidence: 'high',
		rect: {
			x: panel.left ?? titleEl.rect.x,
			y: Math.round(y0),
			w: panel.width ?? 1263,
			h,
		},
	}
}

function enrichZone(zone, elements, layers, barCluster, forcedChartType) {
	const rect = zone.rect
	const inEls = elements.filter((e) => inZoneCenter(e.rect, rect))
	const texts = inEls.filter((e) => e.type === 'text')
	const xTexts = texts.filter(
		(e) => /^\d{4}年?$|^[\u4e00-\u9fa5]{1,6}$/.test((e.content || '').trim()) && e.rect.y > rect.y + rect.h * 0.55
	)
	const yTexts = texts.filter((e) => e.rect.x < rect.x + 90)

	if (barCluster && barCluster.length >= 4 && !forcedChartType) {
		zone.chartType = barCluster.length >= 12 ? 'groupBar' : 'bar'
		zone.series = [{ name: '系列1', data: seriesFromBars(barCluster), color: '#2C6DFF' }]
	} else if (forcedChartType) {
		zone.chartType = forcedChartType
	} else if (!zone.series || !zone.series.length) {
		const mockLen = zone.chartType === 'groupBar' ? 8 : 6
		zone.series = [{ name: '系列1', data: Array.from({ length: mockLen }, (_, i) => 40 + ((i * 17) % 55)), color: '#2C6DFF' }]
	}

	if (!zone.chartType) {
		const vectors = inEls
			.filter((e) => e.type === 'shape')
			.map((e) => {
				const css = ((e.css || e.source?.css) || []).join(' ')
				const bm = css.match(/border\s*:\s*(\d+)px/i)
				return { w: e.rect.w, h: e.rect.h, borderPx: bm ? parseInt(bm[1], 10) : 0 }
			})
		const slices = inEls
			.filter((e) => e.exports?.length || e.source?.kind === 'slice-file')
			.map((e) => ({ ext: ((e.exports?.[0]?.path || e.source?.file || '').split('.').pop() || '').toLowerCase() }))
		zone.chartType = inferChartType({ slices, texts: texts.map((t) => (t.content || '').trim()), vectors }) || zone.chartType || 'line'
	}

	zone.categories = extractCategories(xTexts)
	zone.axis = { yLeft: extractAxis(yTexts) }
	zone.excludeLayerIds = buildExcludeLayerIds(layers, rect)
	return zone
}

export function buildChartZonesFromData({ elements, layers, gapsReport, panels }) {
	const zones = []
	const usedBarIds = new Set()

	const allBars = [
		...(gapsReport.fakeBarShapes || []),
		...elements.filter(isFakeBarShape).map((e) => ({ id: e.id, name: e.name, rect: e.rect })),
	]
	const barById = new Map()
	allBars.forEach((b) => barById.set(b.id, b))
	const uniqueBars = [...barById.values()]

	const clusters = clusterFakeBars(uniqueBars)
	const panelZones = []

	for (const panel of panels?.panels || []) {
		const z = zoneFromTitle(elements, panel)
		if (!z) continue
		const barsInZone = uniqueBars.filter((b) => inZoneCenter(b.rect, z.rect))
		if (barsInZone.length >= 4) {
			z.chartType = barsInZone.length >= 12 ? 'groupBar' : 'bar'
		}
		const forceType = panel.chartType || null
		const barsForSeries = forceType && forceType !== 'bar' && forceType !== 'groupBar' ? null : (barsInZone.length >= 4 ? barsInZone : null)
		panelZones.push(enrichZone(z, elements, layers, barsForSeries, forceType))
		barsInZone.forEach((b) => usedBarIds.add(b.id))
	}

	clusters.forEach((cluster, idx) => {
		if (cluster.length < 4) return
		if (cluster.some((b) => usedBarIds.has(b.id))) return
		const rect = bboxWithMargin(cluster)
		if (!rect || rect.w < 40 || rect.h < 40) return
		if (panelZones.some((pz) => rectContains(pz.rect, rect))) return
		cluster.forEach((b) => usedBarIds.add(b.id))
		zones.push(
			enrichZone(
				{
					id: `chart-bar-cluster-${idx}`,
					chartType: cluster.length >= 12 ? 'groupBar' : 'bar',
					confidence: 'high',
					rect,
				},
				elements,
				layers,
				cluster
			)
		)
	})

	zones.push(...panelZones)

	return { zones }
}

// CLI
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
if (isMain || process.argv[1]?.includes('gen-chart-zones.mjs')) {
	const dataDir = process.argv[2]
	if (!dataDir) {
		console.error('usage: node gen-chart-zones.mjs <dataDir> [--panels panels.json] [--out chartZones.json]')
		process.exit(1)
	}
	const panelsIdx = process.argv.indexOf('--panels')
	const outIdx = process.argv.indexOf('--out')
	const panelsPath = panelsIdx >= 0 ? process.argv[panelsIdx + 1] : null
	const outName = outIdx >= 0 ? process.argv[outIdx + 1] : 'chartZones.json'

	const elDoc = JSON.parse(fs.readFileSync(path.join(dataDir, '_all_elements.json'), 'utf8'))
	const stackRaw = JSON.parse(fs.readFileSync(path.join(dataDir, '_layer_stack.json'), 'utf8'))
	const gapsReport = JSON.parse(fs.readFileSync(path.join(dataDir, '_render_gaps_report.json'), 'utf8'))
	const elements = elDoc.elements || elDoc
	const layers = Array.isArray(stackRaw) ? stackRaw : stackRaw.layers || []
	const panels = panelsPath ? JSON.parse(fs.readFileSync(panelsPath, 'utf8')) : { panels: [] }

	const out = buildChartZonesFromData({ elements, layers, gapsReport, panels })
	const outPath = path.join(dataDir, outName)
	fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
	console.log(`chart zones: ${out.zones.length} → ${outPath}`)
	out.zones.forEach((z) => {
		console.log(`  ${z.id} ${z.chartType} @ ${z.rect.x},${z.rect.y} ${z.rect.w}x${z.rect.h} exclude=${(z.excludeLayerIds || []).length}`)
	})
}
