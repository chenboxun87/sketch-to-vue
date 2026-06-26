// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// UniApp (Vue 2 Options API) emitter — deterministic codegen from scene graph.
// Targets: H5 / WeChat Mini Program / App (via UniApp compile-time conditionals).
// CLI: node emit-uniapp.mjs <scene-graph.json> [chart-zones.json] [outDir] [--host mobile|bigscreen] [--name PageName]
import fs from 'node:fs'
import path from 'node:path'

// ─── Unit helpers ─────────────────────────────────────────────────────────────

/**
 * Decide rendering mode from canvas width.
 * mobile  (≤ 1024px design width): all lengths in rpx, 750rpx baseline.
 * bigscreen (> 1024px): keep px, apply JS viewport scale for H5.
 */
function detectMode(board) {
  return (board.w || 750) > 1024 ? 'bigscreen' : 'mobile'
}

/**
 * Convert a design-space pixel value to the output unit string.
 * Mobile: rpx scaled to 750rpx baseline (standard UniApp convention).
 * Bigscreen: px kept as-is (JS scale applied separately).
 */
function toCss(px, mode, baseW) {
  if (mode === 'bigscreen') return `${Math.round(px)}px`
  return `${Math.round(px * 750 / (baseW || 750))}rpx`
}

/**
 * Rewrite "Npx" tokens inside an already-computed CSS value string.
 * Used to convert px → rpx in values like "8px solid #fff" or "0 4px 12px rgba(0,0,0,.4)".
 * Does NOT touch numbers without px units (e.g. opacity, z-index).
 */
function rewritePxInValue(val, mode, baseW) {
  if (mode === 'bigscreen') return val
  return val.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => toCss(parseFloat(n), mode, baseW))
}

// ─── CSS parsing helpers ──────────────────────────────────────────────────────

function parseCssDecls(cssStr) {
  const result = {}
  let depth = 0
  let buf = ''
  for (const ch of (cssStr || '')) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      _flush(buf.trim(), result); buf = ''
    } else { buf += ch }
  }
  if (buf.trim()) _flush(buf.trim(), result)
  return result
}

function _flush(decl, out) {
  const ci = decl.indexOf(':')
  if (ci < 1) return
  out[decl.slice(0, ci).trim()] = decl.slice(ci + 1).trim()
}

/**
 * Build a UniApp scoped CSS rule for a node.
 * Applies rpx/px conversion to all dimension values.
 *
 * Special rules:
 * - Ellipse detection: names matching 椭圆|oval|ellipse → border-radius 50%
 * - CSS var() → inline warning comment (not supported in Mini Program)
 * - object-fit → inline warning comment (not supported in Mini Program)
 */
function buildCssRule(className, node, mode, baseW) {
  const r = node.rect
  const lines = [
    `  position: absolute`,
    `  left: ${toCss(r.x, mode, baseW)}`,
    `  top: ${toCss(r.y, mode, baseW)}`,
    `  width: ${toCss(r.w, mode, baseW)}`,
    `  height: ${toCss(r.h, mode, baseW)}`,
    `  z-index: ${node.z}`,
  ]

  // Ellipse detection (hard-won rule: name-based, same as Vue/React emitters)
  if (/椭圆|oval|ellipse/i.test(node.name || '')) {
    lines.push(`  border-radius: 50%`)
  }

  const extraCss = (node.attrs.css || []).join('')
  const parsed   = parseCssDecls(extraCss)

  for (const [prop, val] of Object.entries(parsed)) {
    if (['position', 'left', 'top', 'width', 'height', 'z-index'].includes(prop)) continue
    // Skip border-radius if already set by ellipse detection
    if (prop === 'border-radius' && /椭圆|oval|ellipse/i.test(node.name || '')) continue

    const rewritten = rewritePxInValue(val, mode, baseW)

    // CSS var() not supported in WeChat Mini Program — warn, comment out
    if (rewritten.includes('var(')) {
      lines.push(`  /* ⚠️ CSS var() unsupported in Mini Program — replace with hardcoded value */`)
      lines.push(`  /* ${prop}: ${rewritten} */`)
      continue
    }

    // object-fit not supported in Mini Program — warn (keep for H5)
    if (prop === 'object-fit') {
      lines.push(`  /* ⚠️ object-fit unsupported in Mini Program; only effective on H5 */`)
      lines.push(`  ${prop}: ${rewritten}`)
      continue
    }

    lines.push(`  ${prop}: ${rewritten}`)
  }

  return `.${className} {\n${lines.join(';\n')};\n}`
}

/**
 * Detect if a node needs box-shadow (from attrs.css).
 * WeChat Mini Program cannot apply box-shadow to <image> — caller must wrap.
 */
function hasBoxShadow(node) {
  const css = (node.attrs.css || []).join('')
  return /box-shadow\s*:/.test(css)
}

/**
 * Map CSS object-fit to UniApp image mode attribute.
 * <image> in UniApp requires explicit mode= for correct proportions.
 */
function getImageMode(node) {
  const css = (node.attrs.css || []).join('')
  if (/object-fit\s*:\s*cover/.test(css))   return 'aspectFill'
  if (/object-fit\s*:\s*contain/.test(css)) return 'aspectFit'
  if (/object-fit\s*:\s*none/.test(css))    return 'center'
  return 'scaleToFill'
}

// ─── Identifier helpers ───────────────────────────────────────────────────────

/** CSS class name: prefix 'n_' ensures valid identifier even for numeric IDs. */
function toClassName(id) {
  return 'n_' + id.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '')
}

/** Safe asset path: URL-encode non-ASCII characters in file names. */
function encodeSrcPath(filePath) {
  // Encode each path segment individually to preserve slashes
  return filePath.split('/').map(seg => encodeURIComponent(seg)).join('/')
}

/** Escape content for Vue template text (NOT inside {{ }} — plain text nodes). */
function escTpl(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // {{ and }} in plain text would trigger Vue interpolation — escape them
    .replace(/\{\{/g, '{ {')
    .replace(/\}\}/g, '} }')
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate UniApp SFC output from a typed scene graph.
 * Fully re-entrant — no module-level mutable state.
 *
 * @param {object} graph
 * @param {object} opts
 * @param {string} opts.host        - 'mobile' | 'bigscreen' (alias: 'fullscreen')
 * @param {Array}  opts.chartZones  - [{anchorId, chartType, series}]
 * @param {string} opts.pageName    - page/component name
 * @returns {{ vue, chartOptions, pagesJsonSnippet, easycomSnippet, chartPlaceholderHints }}
 */
export function genUniAppFromSceneGraph(graph, opts = {}) {
  const hostArg  = opts.host || 'mobile'
  const board    = graph.meta.board   // { x, y, w, h }
  const mode     = (hostArg === 'fullscreen' || hostArg === 'bigscreen')
    ? 'bigscreen'
    : detectMode(board)
  const baseW    = board.w || 750
  const zones    = opts.chartZones || []
  const pageName = opts.pageName || 'SceneGraphPage'

  // Sort nodes by z-index
  const nodes = [...graph.nodes].sort((a, b) => a.z - b.z)

  // ── Dynamic text data registry ────────────────────────────────────────────
  // Map<dataKey, initVal> — populated during node loop, used for data()
  const dynamicDataVars = new Map()

  // ── Build template lines + CSS rules ─────────────────────────────────────
  const templateLines = []
  const cssRules      = []
  const usedIds       = new Set()

  // Register a node's CSS rule once (dedup by id) and return its class name.
  function registerClass(node) {
    const cls = toClassName(node.id)
    if (!usedIds.has(node.id)) {
      usedIds.add(node.id)
      cssRules.push(buildCssRule(cls, node, mode, baseW))
    }
    return cls
  }

  // Wrapper class for image nodes that need box-shadow (Mini Program limitation)
  function registerWrapperClass(node) {
    const wrapId  = node.id + '_wrap'
    const wrapCls = toClassName(wrapId)
    if (!usedIds.has(wrapId)) {
      usedIds.add(wrapId)
      // Synthesize a wrapper node with the same rect, z-index, and only shadow/border attrs
      const r = node.rect
      const extraCss = (node.attrs.css || []).join('')
      const parsed   = parseCssDecls(extraCss)
      const wrapProps = [
        `  position: absolute`,
        `  left: ${toCss(r.x, mode, baseW)}`,
        `  top: ${toCss(r.y, mode, baseW)}`,
        `  width: ${toCss(r.w, mode, baseW)}`,
        `  height: ${toCss(r.h, mode, baseW)}`,
        `  z-index: ${node.z}`,
      ]
      for (const [prop, val] of Object.entries(parsed)) {
        if (['position', 'left', 'top', 'width', 'height', 'z-index'].includes(prop)) continue
        if (/box-shadow|border|border-radius|background/.test(prop)) {
          wrapProps.push(`  ${prop}: ${rewritePxInValue(val, mode, baseW)}`)
        }
      }
      cssRules.push(`.${wrapCls} {\n${wrapProps.join(';\n')};\n}`)

      // Image inside wrapper: full width/height, no positioning (relative to wrapper)
      const imgCls = toClassName(node.id)
      if (!usedIds.has(node.id)) {
        usedIds.add(node.id)
        const imgProps = [
          '  position: relative',
          `  width: ${toCss(r.w, mode, baseW)}`,
          `  height: ${toCss(r.h, mode, baseW)}`,
        ]
        cssRules.push(`.${imgCls} {\n${imgProps.join(';\n')};\n}`)
      }
    }
    return { wrapCls, imgCls: toClassName(node.id) }
  }

  for (const n of nodes) {
    const k = n.disposition?.kind
    if (!k) continue
    if (k === 'container' || k === 'chart-series-member') continue

    if (k.startsWith('exclude:')) {
      templateLines.push(`    <!-- EXCLUDED [${k}] layer: ${JSON.stringify(n.name)} id: ${n.id} -->`)
      continue
    }

    if (k === 'chart-zone') {
      const cls     = registerClass(n)
      const refName = 'chart_' + n.id.replace(/[^a-zA-Z0-9]/g, '_')
      // l-echart dimensions come from the CSS class; Mini Program doesn't support inline style on custom components
      templateLines.push(`    <l-echart ref="${refName}" class="${cls}" />`)
      continue
    }

    if (k === 'render-slice') {
      const filePath   = n.attrs?.exports?.[0]?.path || (n.id + '.png')
      const encodedSrc = '/static/assets/' + encodeSrcPath(filePath)
      const imgMode    = getImageMode(n)
      const needsWrap  = hasBoxShadow(n)

      if (needsWrap) {
        // Wrap in <view> so box-shadow renders on Mini Program
        const { wrapCls, imgCls } = registerWrapperClass(n)
        templateLines.push(`    <view class="${wrapCls}">`)
        templateLines.push(`      <image src="${encodedSrc}" mode="${imgMode}" class="${imgCls}" />`)
        templateLines.push(`    </view>`)
      } else {
        const cls = registerClass(n)
        templateLines.push(`    <image src="${encodedSrc}" mode="${imgMode}" class="${cls}" />`)
      }
      continue
    }

    if (k === 'render-vector') {
      const cls = registerClass(n)
      templateLines.push(`    <view class="${cls}" />`)
      continue
    }

    if (k === 'live-text-static') {
      const cls = registerClass(n)
      // escTpl neutralizes HTML entities AND prevents accidental {{ }} interpolation
      templateLines.push(`    <text class="${cls}">${escTpl(n.attrs.content || '')}</text>`)
      continue
    }

    if (k === 'live-text-dynamic') {
      const cls     = registerClass(n)
      const dataKey = 'dyn_' + n.id.replace(/[^a-zA-Z0-9]/g, '_')
      const initVal = JSON.stringify(n.attrs.content || '')
      dynamicDataVars.set(dataKey, initVal)
      // Use proper Vue interpolation (no JS comment inside {{ }} — that's a syntax error)
      templateLines.push(`    <!-- TODO: update ${dataKey} with real data -->`)
      templateLines.push(`    <text class="${cls}">{{ ${dataKey} }}</text>`)
      continue
    }
  }

  // ── Chart ref names ───────────────────────────────────────────────────────
  const chartRefNames = zones.map(z => 'chart_' + z.anchorId.replace(/[^a-zA-Z0-9]/g, '_'))

  // ── Chart init method body (lime-echart) ──────────────────────────────────
  const chartInitBody = chartRefNames.length === 0 ? '' :
    `    async initCharts() {\n` +
    chartRefNames.map((refName, i) => {
      const z = zones[i]
      return [
        `      // Zone: ${z.anchorId} (${z.chartType || 'bar'})`,
        `      if (this.$refs.${refName}) {`,
        `        try {`,
        `          const inst${i} = await this.$refs.${refName}.init()`,
        `          inst${i}.setOption(this.chartOptions[${JSON.stringify(z.anchorId)}])`,
        `        } catch (e) { console.warn('[sketch-to-vue] chart init failed:', ${JSON.stringify(z.anchorId)}, e) }`,
        `      }`,
      ].join('\n')
    }).join('\n') +
    `\n    },`

  // ── Viewport scale method (bigscreen H5 only) ─────────────────────────────
  // Wrapped in conditional compile so it's removed for Mini Program / App targets.
  // onResize is a UniApp page lifecycle only for H5 (2.9.5+) — conditional compile guards it.
  const scaleMethod = mode === 'bigscreen' ? `
    applyScale() {
      // #ifdef H5
      const s = Math.min(window.innerWidth / ${board.w}, window.innerHeight / ${board.h})
      this.scaleStyle = \`transform:scale(\${s});transform-origin:top left;\`
      // #endif
    },` : ''

  // ── data() object ─────────────────────────────────────────────────────────
  const dataEntries = []
  if (zones.length > 0)       dataEntries.push('      chartOptions,')
  if (mode === 'bigscreen')   dataEntries.push("      scaleStyle: '',")
  for (const [key, val] of dynamicDataVars) {
    dataEntries.push(`      ${key}: ${val},`)
  }

  // ── onLoad body ───────────────────────────────────────────────────────────
  const onLoadBody = []
  if (mode === 'bigscreen') onLoadBody.push('      this.applyScale()')
  if (zones.length > 0)     onLoadBody.push('      this.initCharts()')

  // ── Root CSS ──────────────────────────────────────────────────────────────
  const rootCss = mode === 'bigscreen'
    ? `.root {\n  position: relative;\n  width: ${board.w}px;\n  height: ${board.h}px;\n  overflow: hidden;\n}`
    : `.root {\n  position: relative;\n  width: 750rpx;\n  min-height: 100vh;\n  overflow: hidden;\n}`

  const rootAttr = mode === 'bigscreen' ? ` :style="scaleStyle"` : ''

  // ── Compose the full .vue SFC ─────────────────────────────────────────────
  const vue = `<!-- AUTO-GENERATED by emit-uniapp.mjs — safe to edit; re-running will overwrite. -->
<!-- Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue -->
<!-- Target: UniApp (Vue 2 Options API) — mode: ${mode} -->
<!-- Targets: H5 / WeChat Mini Program / App                                       -->
<template>
  <view class="root"${rootAttr}>
${templateLines.join('\n')}
  </view>
</template>

<script>
${zones.length > 0 ? "import { chartOptions } from './chartOptions.js'\n" : ''}
export default {
  name: '${pageName}',

  data() {
    return {
${dataEntries.join('\n') || '      // no dynamic data'}
    }
  },

  onLoad() {
    this.$nextTick(() => {
${onLoadBody.join('\n') || '      // nothing to initialize'}
    })
  },

${mode === 'bigscreen' ? `  // #ifdef H5
  onResize() {
    // Called by UniApp on H5 window resize (v2.9.5+)
    this.applyScale()
  },
  // #endif\n` : ''}
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
// See _chart_placeholder_hints.json for each zone's semantic context.
export const chartOptions = {
${zones.map(z => {
    const xData = z.series.map((_, i) => `Cat ${i + 1}`)
    return `  ${JSON.stringify(z.anchorId)}: {
    backgroundColor: 'transparent',
    xAxis: { type: 'category', data: ${JSON.stringify(xData)}, axisLabel: { color: '#8b949e' } },
    yAxis: { type: 'value',    axisLabel: { color: '#8b949e' } },
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

  // ── easycom snippet (for lime-echart) ─────────────────────────────────────
  // Append to the "easycom" section of pages.json when using charts.
  const easycomSnippet = zones.length > 0
    ? JSON.stringify({
        'easycom-note': 'Add to pages.json "easycom" section:',
        '^l-echart$': 'lime-echart/components/l-echart/l-echart',
      }, null, 2)
    : null

  // ── Chart placeholder hints ───────────────────────────────────────────────
  const chartPlaceholderHints = zones.map(z => ({
    chartZone: z.anchorId,
    chartType: z.chartType || 'bar',
    framework: 'uniapp',
    TODO: [
      'Replace series[0].data with real API data',
      'Replace xAxis.data with real labels',
      'Run: npm install lime-echart',
      'Add easycom entry to pages.json (see easycom.snippet.json)',
      'lime-echart init is async — await this.$refs.x.init() is already scaffolded',
    ],
    placeholderSeries: z.series,
  }))

  return { vue, chartOptions: chartOptionsSrc, pagesJsonSnippet, easycomSnippet, chartPlaceholderHints }
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
  fs.writeFileSync(path.join(outDir, 'index.generated.vue'),  out.vue,                          'utf8')
  fs.writeFileSync(path.join(outDir, 'chartOptions.js'),      out.chartOptions,                 'utf8')
  fs.writeFileSync(path.join(outDir, 'pages.json.snippet'),   out.pagesJsonSnippet,             'utf8')
  if (out.easycomSnippet) {
    fs.writeFileSync(path.join(outDir, 'easycom.snippet.json'), out.easycomSnippet, 'utf8')
  }

  if (out.chartPlaceholderHints.length) {
    const hp = path.join(outDir, '_chart_placeholder_hints.json')
    fs.writeFileSync(hp, JSON.stringify(out.chartPlaceholderHints, null, 2), 'utf8')
    console.log(`⚠️  ${out.chartPlaceholderHints.length} chart zone(s) with placeholder data → see ${hp}`)
  }

  console.log(`✅ UniApp output → ${outDir}  (mode: ${host})`)
  console.log(`   index.generated.vue  (${out.vue.length} chars)`)
  console.log(`   chartOptions.js      (${zones.length} chart zone(s))`)
  console.log(`   pages.json.snippet   → append to project pages.json "pages" array`)
  if (out.easycomSnippet) {
    console.log(`   easycom.snippet.json → append to project pages.json "easycom" section`)
    console.log()
    console.log(`📦 Run: npm install lime-echart`)
  }
}
