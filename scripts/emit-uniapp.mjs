// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// UniApp (Vue 2 Options API) emitter — deterministic codegen from scene graph.
// Outputs index.vue with UniApp-specific tags, rpx units, lime-echart, and pages.json snippet.
// CLI: node emit-uniapp.mjs <scene-graph.json> [chart-zones.json] [outDir] [--host fullscreen|mobile]
import fs from 'node:fs'
import path from 'node:path'

// ─── rpx / px unit helpers ───────────────────────────────────────────────────

/**
 * Decide whether to use rpx (mobile) or px (big-screen dashboard).
 * Threshold: canvas width > 1024 → big-screen mode (keep px, add viewport scale).
 */
function detectMode(board) {
  return (board.w || 750) > 1024 ? 'bigscreen' : 'mobile'
}

/**
 * Convert a design-space pixel value to the appropriate CSS unit string.
 * mobile: rpx, using 750rpx baseline (standard UniApp convention).
 * bigscreen: px (kept as-is, viewport scaling applied via JS).
 */
function toCss(px, mode, baseW) {
  if (mode === 'bigscreen') return `${Math.round(px)}px`
  // mobile rpx: scale to 750rpx baseline
  const rpxPerPx = 750 / (baseW || 750)
  return `${Math.round(px * rpxPerPx)}rpx`
}

// ─── CSS helpers ─────────────────────────────────────────────────────────────

function parseCssDecls(cssStr) {
  const result = {}
  let depth = 0
  let buf = ''
  for (const ch of (cssStr || '')) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      _flushDecl(buf.trim(), result); buf = ''
    } else { buf += ch }
  }
  if (buf.trim()) _flushDecl(buf.trim(), result)
  return result
}
function _flushDecl(decl, out) {
  const ci = decl.indexOf(':')
  if (ci < 1) return
  out[decl.slice(0, ci).trim()] = decl.slice(ci + 1).trim()
}

/**
 * Rewrite any px dimension values in a CSS value string to rpx/px.
 * E.g. "8px solid #fff" → "16rpx solid #fff" (on 375px base → 750rpx).
 * Leaves non-dimension tokens unchanged.
 */
function rewritePxInValue(val, mode, baseW) {
  if (mode === 'bigscreen') return val
  return val.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => toCss(parseFloat(n), mode, baseW))
}

/**
 * Build a UniApp scoped CSS rule string for a node.
 * Returns: `.className { ... }`
 */
function buildCssRule(className, node, mode, baseW) {
  const r = node.rect
  const props = [
    `  position: absolute`,
    `  left: ${toCss(r.x, mode, baseW)}`,
    `  top: ${toCss(r.y, mode, baseW)}`,
    `  width: ${toCss(r.w, mode, baseW)}`,
    `  height: ${toCss(r.h, mode, baseW)}`,
    `  z-index: ${node.z}`,
  ]
  // Extra visual CSS from attrs
  const extraCss = (node.attrs.css || []).join('')
  const parsed = parseCssDecls(extraCss)
  for (const [prop, val] of Object.entries(parsed)) {
    if (['position', 'left', 'top', 'width', 'height', 'z-index'].includes(prop)) continue
    props.push(`  ${prop}: ${rewritePxInValue(val, mode, baseW)}`)
  }
  return `.${className} {\n${props.join(';\n')};\n}`
}

// ─── Class name helpers ───────────────────────────────────────────────────────

/**
 * Derive a safe CSS class name from a node ID.
 * Strips non-alphanumeric chars, prefixes with 'n' to ensure valid identifier.
 */
function toClassName(id) {
  const safe = id.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '')
  return 'n_' + safe
}

/** Escape text content for template output */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── UniApp image mode mapping ────────────────────────────────────────────────

/**
 * Map CSS object-fit to UniApp image mode attribute.
 */
function getImageMode(node) {
  const css = (node.attrs.css || []).join('')
  if (css.includes('object-fit:cover') || css.includes('object-fit: cover')) return 'aspectFill'
  if (css.includes('object-fit:contain') || css.includes('object-fit: contain')) return 'aspectFit'
  return 'scaleToFill'
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate UniApp SFC output from a typed scene graph.
 *
 * @param {object} graph   - Output of buildSceneGraph()
 * @param {object} opts
 * @param {string} opts.host        - 'mobile' | 'fullscreen' (alias: 'bigscreen')
 * @param {Array}  opts.chartZones  - Chart zone descriptors
 * @param {string} opts.pageName    - Page/component name
 * @returns {{ vue, chartOptions, pagesJsonSnippet, chartPlaceholderHints }}
 */
export function genUniAppFromSceneGraph(graph, opts = {}) {
  const hostArg = opts.host || 'mobile'
  const board   = graph.meta.board    // { x, y, w, h }
  const mode    = (hostArg === 'fullscreen' || hostArg === 'bigscreen')
    ? 'bigscreen'
    : detectMode(board)
  const baseW   = board.w || 750
  const zones   = opts.chartZones || []
  const pageName = opts.pageName || 'SceneGraphPage'

  // Sort nodes by z-index
  const nodes = [...graph.nodes].sort((a, b) => a.z - b.z)

  // ── Collect render-slice nodes for asset paths ────────────────────────────
  const sliceNodes = nodes.filter(n => n.disposition?.kind === 'render-slice')

  // ── Build template lines + CSS rules ─────────────────────────────────────
  const templateLines = []
  const cssRules = []
  const usedClasses = new Set()

  function addClass(node) {
    const cls = toClassName(node.id)
    if (!usedClasses.has(node.id)) {
      usedClasses.add(node.id)
      cssRules.push(buildCssRule(cls, node, mode, baseW))
    }
    return cls
  }

  for (const n of nodes) {
    const k = n.disposition?.kind
    if (!k) continue
    if (k === 'container' || k === 'chart-series-member') continue
    if (k.startsWith('exclude:')) {
      templateLines.push(`    <!-- EXCLUDED [${k}] layer="${esc(n.name)}" id=${n.id} -->`)
      continue
    }

    if (k === 'chart-zone') {
      // lime-echart component — ref named by zone id
      const refName = 'chart_' + n.id.replace(/[^a-zA-Z0-9]/g, '_')
      const cls = addClass(n)
      // lime-echart uses width/height via class (not inline style in mini-program)
      templateLines.push(`    <l-echart ref="${refName}" class="${cls}" />`)
      continue
    }

    if (k === 'render-slice') {
      const cls = addClass(n)
      // Asset path: UniApp uses /static/ prefix or relative path
      const filePath = n.attrs?.exports?.[0]?.path || (n.id + '.png')
      const imgMode  = getImageMode(n)
      templateLines.push(`    <image src="/static/assets/${filePath}" mode="${imgMode}" class="${cls}" />`)
      continue
    }

    if (k === 'render-vector') {
      const cls = addClass(n)
      templateLines.push(`    <view class="${cls}" />`)
      continue
    }

    if (k === 'live-text-static') {
      const cls = addClass(n)
      templateLines.push(`    <text class="${cls}">${esc(n.attrs.content || '')}</text>`)
      continue
    }

    if (k === 'live-text-dynamic') {
      const cls = addClass(n)
      templateLines.push(`    <text class="${cls}">{{ ${JSON.stringify(n.attrs.content || '')} /* TODO: bind to real data */ }}</text>`)
      continue
    }
  }

  // ── Build chart initialization methods (lime-echart) ─────────────────────
  const chartRefNames = zones.map(z => 'chart_' + z.anchorId.replace(/[^a-zA-Z0-9]/g, '_'))
  const chartInitBody = chartRefNames.length === 0 ? '' : `
    async initCharts() {
${chartRefNames.map((refName, i) => {
  const z = zones[i]
  return `      // Chart: ${z.anchorId} (${z.chartType || 'bar'})
      try {
        const inst${i} = await this.$refs.${refName}.init()
        inst${i}.setOption(this.chartOptions[${JSON.stringify(z.anchorId)}])
      } catch (e) { console.warn('[sketch-to-vue] chart init error', e) }`
}).join('\n')}
    },`

  // ── Viewport scale method (bigscreen / H5) ────────────────────────────────
  const scaleMethod = mode === 'bigscreen' ? `
    applyScale() {
      // #ifdef H5
      const s = Math.min(window.innerWidth / ${board.w}, window.innerHeight / ${board.h})
      this.scaleStyle = \`transform:scale(\${s});transform-origin:top left;\`
      // #endif
    },` : ''

  // ── Root CSS (bigscreen uses px + transform, mobile uses rpx) ────────────
  const rootCss = mode === 'bigscreen'
    ? `.root {\n  position: relative;\n  width: ${board.w}px;\n  height: ${board.h}px;\n  overflow: hidden;\n}`
    : `.root {\n  position: relative;\n  width: 750rpx;\n  overflow: hidden;\n}`

  const rootAttr = mode === 'bigscreen' ? ` :style="scaleStyle"` : ''

  // ── Compose the full .vue file ────────────────────────────────────────────
  const vue = `<!-- AUTO-GENERATED by emit-uniapp.mjs — edit with caution -->
<!-- Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue -->
<!-- Target: UniApp (Vue 2 Options API) — mode: ${mode} -->
<template>
  <view class="root"${rootAttr}>
${templateLines.join('\n')}
  </view>
</template>

<script>
${zones.length > 0 ? "import { chartOptions } from './chartOptions.js'" : ''}

export default {
  name: '${pageName}',
  data() {
    return {
${zones.length > 0 ? '      chartOptions,' : ''}
${mode === 'bigscreen' ? "      scaleStyle: ''," : ''}
    }
  },

  onLoad() {
    this.$nextTick(() => {
${mode === 'bigscreen' ? '      this.applyScale()' : ''}
${zones.length > 0 ? '      this.initCharts()' : ''}
    })
  },

${mode === 'bigscreen' ? `
  onResize() {
    this.applyScale()
  },
` : ''}

  methods: {
${scaleMethod}
${chartInitBody}
  },
}
</script>

<style scoped>
${rootCss}

${cssRules.join('\n\n')}
</style>
`

  // ── chartOptions.js ───────────────────────────────────────────────────────
  const chartOptionsSrc = `// AUTO-GENERATED — replace placeholder data with real API responses.
export const chartOptions = {
${zones.map(z => {
    const xData = z.series.map((_, i) => `Cat ${i + 1}`)
    return `  ${JSON.stringify(z.anchorId)}: {
    backgroundColor: 'transparent',
    xAxis: { type: 'category', data: ${JSON.stringify(xData)}, axisLabel: { color: '#8b949e' } },
    yAxis: { type: 'value', axisLabel: { color: '#8b949e' } },
    series: [{ type: ${JSON.stringify(z.chartType || 'bar')}, data: ${JSON.stringify(z.series)}, itemStyle: { color: '#58a6ff' } }],
  },`
  }).join('\n')}
}
`

  // ── pages.json snippet ────────────────────────────────────────────────────
  const pagesJsonSnippet = JSON.stringify({
    path: `pages/${pageName}/index`,
    style: {
      navigationBarTitleText: pageName,
      navigationBarBackgroundColor: '#0d1117',
      navigationBarTextStyle: 'white',
      backgroundColor: '#0d1117',
    },
  }, null, 2)

  // ── chartPlaceholderHints ─────────────────────────────────────────────────
  const chartPlaceholderHints = zones.map(z => ({
    chartZone: z.anchorId,
    chartType: z.chartType || 'bar',
    framework: 'uniapp',
    TODO: [
      'Replace series[0].data with real API data',
      'Replace xAxis.data with real labels',
      'lime-echart: ensure @dcloudio/uni-app + lime-echart installed',
      'easycom in pages.json must register l-echart',
    ],
    placeholderSeries: z.series,
  }))

  return { vue, chartOptions: chartOptionsSrc, pagesJsonSnippet, chartPlaceholderHints }
}

// ─── CLI entry ────────────────────────────────────────────────────────────────
if (process.argv[2]) {
  const graphFile = process.argv[2]
  const zonesFile = process.argv[3] && fs.existsSync(process.argv[3]) ? process.argv[3] : null
  const outDir    = process.argv[4] || '.'
  const host      = process.argv.includes('--host')
    ? process.argv[process.argv.indexOf('--host') + 1]
    : 'mobile'
  const pageName  = process.argv.includes('--name')
    ? process.argv[process.argv.indexOf('--name') + 1]
    : 'SceneGraphPage'

  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
  const zones = zonesFile
    ? (JSON.parse(fs.readFileSync(zonesFile, 'utf8')).zones || [])
    : []

  const out = genUniAppFromSceneGraph(graph, { host, chartZones: zones, pageName })

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.generated.vue'),  out.vue, 'utf8')
  fs.writeFileSync(path.join(outDir, 'chartOptions.js'),      out.chartOptions, 'utf8')
  fs.writeFileSync(path.join(outDir, 'pages.json.snippet'),   out.pagesJsonSnippet, 'utf8')

  if (out.chartPlaceholderHints.length) {
    const hintsPath = path.join(outDir, '_chart_placeholder_hints.json')
    fs.writeFileSync(hintsPath, JSON.stringify(out.chartPlaceholderHints, null, 2), 'utf8')
    console.log(`⚠️  ${out.chartPlaceholderHints.length} chart zone(s) with placeholder data — see ${hintsPath}`)
  }

  console.log(`✅ UniApp output written to: ${outDir}`)
  console.log(`   index.generated.vue  (${out.vue.length} chars, mode=${host})`)
  console.log(`   chartOptions.js`)
  console.log(`   pages.json.snippet   (append to your project's pages.json pages array)`)
  console.log()
  console.log(`📦 Required dependencies:`)
  if (zones.length > 0) {
    console.log(`   npm install lime-echart`)
    console.log(`   # Also register in pages.json easycom:`)
    console.log(`   # "^l-echart$": "lime-echart/components/l-echart/l-echart"`)
  }
}
