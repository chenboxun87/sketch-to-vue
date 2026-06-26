/**
 * MeaXure vector-css 消费侧工具（parseCssArray / synthBorderFromAttrs）
 * A 轨道 §3.9 render-vector 必用。
 */

export function stopColorRaw(c) {
	if (!c) return ''
	if (typeof c === 'string') {
		const rgba = c.match(/rgba?\([^)]+\)/i)
		if (rgba) return rgba[0]
		return c.replace(/\s+\d+%\s*$/, '').trim() || c.split(/\s+/)[0]
	}
	if (c['css-rgba']) return c['css-rgba']
	if (c['color-hex']) return c.replace(/\s+\d+%\s*$/, '').trim() || c['color-hex']
	return ''
}

function rgbaFromSketchColor(color) {
	if (!color || !color.rgb) return ''
	const { r, g, b } = color.rgb
	let a = color.alpha
	if (a == null) a = 1
	else if (a > 1) a = a / 255
	return `rgba(${r},${g},${b},${Number(a.toFixed(3))})`
}

/** MeaXure css 行常带尾部分号；写入 inline style 必须去掉 */
export function normalizeCssValue(val) {
	return String(val || '')
		.trim()
		.replace(/;\s*$/, '')
		.replace(/\bNaNpx\b/g, '0')
}

export function parseCssArray(css, opts = {}) {
	const style = {}
	;(css || []).forEach((line) => {
		const m = String(line).match(/^([^:]+):\s*(.+)$/)
		if (!m) return
		const prop = m[1].trim()
		let val = normalizeCssValue(m[2])
		if (!val) return
		if (prop === 'transform' && !opts.keepTransform) return
		const camel = prop.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
		style[camel] = val
	})
	return style
}

/** MeaXure 渐变内描边不进 css[]，须从 borders[] 合成 box-shadow inset（规则 47） */
export function synthBorderFromAttrs(attrs) {
	const borders = (attrs && attrs.borders) || []
	if (!borders.length) return {}

	const hasExplicitBorder = (attrs.css || []).some(
		(c) => /^border\s*:/i.test(String(c)) && !/border-radius/i.test(String(c))
	)
	if (hasExplicitBorder) return {}

	const insetParts = []
	for (const b of borders) {
		const thick = b.thickness || b.width || 1
		let color = ''

		if (b.fillType === 'Gradient' && b.gradient && Array.isArray(b.gradient.colorStops)) {
			const stops = b.gradient.colorStops
			const best = stops.reduce(
				(acc, s) => ((s.color && s.color.alpha) || 0) > ((acc.color && acc.color.alpha) || 0) ? s : acc,
				stops[0] || { color: { alpha: 0 } }
			)
			color = rgbaFromSketchColor(best.color)
		} else if (b.color) {
			color = typeof b.color === 'string' ? stopColorRaw(b.color) : rgbaFromSketchColor(b.color)
		}

		if (!color || color.endsWith(',0)')) continue
		if (String(b.position || 'Center') === 'Inside') {
			insetParts.push(`inset 0 0 0 ${thick}px ${color}`)
		}
	}

	if (!insetParts.length) return {}
	return { boxShadow: insetParts.join(', ') }
}

export function buildVectorStyle(source, opts = {}) {
	const cssStyle = parseCssArray(source && source.css, { keepTransform: true, ...opts })
	const borderStyle = synthBorderFromAttrs(source || {})
	return { ...cssStyle, ...borderStyle }
}
