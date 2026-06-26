// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// React 18 JSX + CSS Modules emitter — deterministic codegen from scene graph.
// CLI: node emit-react.mjs <scene-graph.json> [chart-zones.json] [outDir] [--host fullscreen|basic-layout]
import fs from 'node:fs'
import path from 'node:path'

// ─── CSS helpers ────────────────────────────────────────────────────────────

/**
 * Parse a raw CSS declaration block string into {prop: value} pairs.
 * Handles complex values that contain `:` or `;` inside function calls,
 * e.g. `background:linear-gradient(135deg,#000 0%,#fff 100%);border-radius:8px`
 */
function parseCssDecls(cssStr) {
  const result = {}
  let depth = 0
  let buf = ''
  for (const ch of (cssStr || '')) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      _flushDecl(buf.trim(), result)
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) _flushDecl(buf.trim(), result)
  return result
}

function _flushDecl(decl, out) {
  const ci = decl.indexOf(':')
  if (ci < 1) return
  const prop = decl.slice(0, ci).trim()
  const val = decl.slice(ci + 1).trim()
  if (prop && val) out[prop] = val
}

/** Convert kebab-case CSS property to React camelCase */
function toCamel(prop) {
  if (prop === 'float') return 'cssFloat'
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * Convert a node's positional data + CSS attrs array to a React style object.
 * Returns a JS object (not a string) so caller can serialize to JSX.
 */
function buildStyleObj(node) {
  const r = node.rect
  const obj = {
    position: 'absolute',
    left: r.x,
    top: r.y,
    width: r.w,
    height: r.h,
    zIndex: node.z,
  }
  // Merge extra CSS from attrs (backgrounds, shadows, border-radius, etc.)
  const extraCss = (node.attrs.css || []).join('')
  const parsed = parseCssDecls(extraCss)
  for (const [prop, val] of Object.entries(parsed)) {
    // Skip positional props already handled above
    if (['position', 'left', 'top', 'width', 'height', 'z-index'].includes(prop)) continue
    obj[toCamel(prop)] = val
  }
  return obj
}

/**
 * Serialize a style object to a JSX inline style string.
 * Numbers are output as-is (React adds 'px' for length properties automatically).
 * Strings are JSON-quoted.
 */
function styleToJSX(obj) {
  const entries = Object.entries(obj).map(([k, v]) => {
    return typeof v === 'number' ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`
  })
  return `{{ ${entries.join(', ')} }}`
}

// ─── Identifier helpers ──────────────────────────────────────────────────────

/**
 * Convert an arbitrary node ID to a safe JS identifier for use as a ref name.
 * Example: "abc-123" → "ref_abc_123"
 */
function toRefName(id) {
  return 'chartRef_' + id.replace(/[^a-zA-Z0-9]/g, '_')
}

/**
 * Convert a node ID / slice path to a safe JS import identifier.
 * Example: "panel-bg.png" → "asset_panel_bg"
 */
function toAssetVar(id) {
  return 'asset_' + id.replace(/[^a-zA-Z0-9]/g, '_')
}

/** Escape HTML entities in text content */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Main generator ──────────────────────────────────────────────────────────

/**
 * Generate React + CSS Modules output from a typed scene graph.
 *
 * @param {object} graph   - Output of buildSceneGraph()
 * @param {object} opts
 * @param {string} opts.host        - 'fullscreen' | 'basic-layout'
 * @param {Array}  opts.chartZones  - Chart zone descriptors [{anchorId, chartType, series, rect}]
 * @param {string} opts.pageName    - Component name (default 'SceneGraphPage')
 * @returns {{ jsx, css, chartOptions, chartPlaceholderHints }}
 */
export function genReactFromSceneGraph(graph, opts = {}) {
  const host = opts.host || 'fullscreen'
  const zones = opts.chartZones || []
  const pageName = opts.pageName || 'SceneGraphPage'
  const board = graph.meta.board    // { x, y, w, h }

  // Sort nodes by z-index (painter's order)
  const nodes = [...graph.nodes].sort((a, b) => a.z - b.z)

  // ── Collect render-slice nodes for asset imports ──────────────────────────
  const sliceNodes = nodes.filter(n => n.disposition?.kind === 'render-slice')
  const assetImports = sliceNodes.map(n => {
    const filePath = n.attrs?.exports?.[0]?.path || (n.id + '.png')
    const varName = toAssetVar(n.id)
    return { id: n.id, varName, filePath }
  })

  // ── Build JSX body lines ──────────────────────────────────────────────────
  const jsxLines = []
  for (const n of nodes) {
    const k = n.disposition?.kind
    if (!k) continue

    // Skip containers and chart sub-members (visual handled by chart-zone or parent)
    if (k === 'container' || k === 'chart-series-member') continue

    // Excluded nodes: leave comment so designer can investigate
    if (k.startsWith('exclude:')) {
      jsxLines.push(`      {/* EXCLUDED [${k}] layer="${esc(n.name)}" id=${n.id} */}`)
      continue
    }

    // ECharts chart zone → attach ref, render as empty div
    if (k === 'chart-zone') {
      const refName = toRefName(n.id)
      const sty = styleToJSX(buildStyleObj(n))
      jsxLines.push(`      <div ref={${refName}} style=${sty} />`)
      continue
    }

    // Image slice
    if (k === 'render-slice') {
      const assetEntry = assetImports.find(a => a.id === n.id)
      const srcExpr = assetEntry ? `{${assetEntry.varName}}` : '""'
      const sty = styleToJSX(buildStyleObj(n))
      jsxLines.push(`      <img src=${srcExpr} style=${sty} alt="" />`)
      continue
    }

    // Vector shape (background color, gradient, border, etc.)
    if (k === 'render-vector') {
      const sty = styleToJSX(buildStyleObj(n))
      jsxLines.push(`      <div style=${sty} />`)
      continue
    }

    // Static or dynamic text
    if (k === 'live-text-static' || k === 'live-text-dynamic') {
      const sty = styleToJSX(buildStyleObj(n))
      const content = k === 'live-text-dynamic'
        ? `{${JSON.stringify(n.attrs.content || '')}/* TODO: bind to real data */}`
        : esc(n.attrs.content || '')
      jsxLines.push(`      <div style=${sty}>${content}</div>`)
      continue
    }
  }

  // ── Build useRef declarations (one per chart zone) ────────────────────────
  const refDecls = zones.map(z => `  const ${toRefName(z.anchorId)} = useRef(null)`)

  // ── Build useEffect for ECharts (one per chart zone) ─────────────────────
  const chartEffects = zones.map(z => {
    const refName = toRefName(z.anchorId)
    return `
  // ECharts: chart zone "${z.anchorId}"
  useEffect(() => {
    if (!${refName}.current) return
    const inst = echarts.init(${refName}.current)
    inst.setOption(chartOptions[${JSON.stringify(z.anchorId)}])
    const ro = new ResizeObserver(() => inst.resize())
    ro.observe(${refName}.current)
    return () => { inst.dispose(); ro.disconnect() }
  }, [])`.trimEnd()
  })

  // ── Big-screen scaling effect (fullscreen only) ───────────────────────────
  const scaleEffect = host === 'fullscreen' ? `
  // Big-screen viewport scaling — maintains design dimensions at any window size
  useEffect(() => {
    const applyScale = () => {
      const s = Math.min(window.innerWidth / BOARD_W, window.innerHeight / BOARD_H)
      const el = rootRef.current
      if (el) el.style.transform = \`scale(\${s})\`
    }
    applyScale()
    window.addEventListener('resize', applyScale)
    return () => window.removeEventListener('resize', applyScale)
  }, [])` : ''

  const rootRefDecl = host === 'fullscreen' ? `  const rootRef = useRef(null)` : ''
  const rootRefAttr = host === 'fullscreen' ? ` ref={rootRef}` : ''

  // ── Asset import lines ─────────────────────────────────────────────────────
  const assetImportLines = assetImports.map(
    a => `import ${a.varName} from './assets/${a.filePath}'`
  )

  // ── Determine which hooks are needed ──────────────────────────────────────
  const needsUseRef = zones.length > 0 || host === 'fullscreen'
  const needsUseEffect = zones.length > 0 || host === 'fullscreen'
  const reactImports = ['React']
  if (needsUseRef) reactImports.push('useRef')
  if (needsUseEffect) reactImports.push('useEffect')
  const reactImportLine = `import ${reactImports.length === 1 ? 'React' : `{ ${reactImports.slice(1).join(', ')} }`} from 'react'`

  // ── Compose full JSX file ─────────────────────────────────────────────────
  const jsx = `// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// AUTO-GENERATED by emit-react.mjs — edit with caution.
import React${needsUseRef || needsUseEffect ? `, { ${[needsUseRef ? 'useRef' : null, needsUseEffect ? 'useEffect' : null].filter(Boolean).join(', ')} }` : ''} from 'react'
${zones.length > 0 ? "import * as echarts from 'echarts'" : ''}
import styles from './index.module.css'
${assetImportLines.length > 0 ? '\n// Asset imports — resolved deterministically from scene graph\n' + assetImportLines.join('\n') : ''}
${zones.length > 0 ? "\nimport { chartOptions } from './chartOptions.js'" : ''}

${host === 'fullscreen' ? `const BOARD_W = ${board.w}\nconst BOARD_H = ${board.h}` : ''}

export default function ${pageName}() {
${rootRefDecl}
${refDecls.join('\n')}
${scaleEffect}
${chartEffects.join('\n')}

  return (
    <div className={styles.root}${rootRefAttr}>
${jsxLines.join('\n')}
    </div>
  )
}
`

  // ── CSS Modules stylesheet ────────────────────────────────────────────────
  const rootStyles = host === 'fullscreen'
    ? `  width: ${board.w}px;\n  height: ${board.h}px;\n  position: relative;\n  overflow: hidden;\n  transform-origin: top left;`
    : `  position: relative;\n  width: 100%;\n  overflow: hidden;`

  const css = `/* AUTO-GENERATED by emit-react.mjs */
.root {
${rootStyles}
}
`

  // ── chartOptions.js (same structure as Vue emitter) ───────────────────────
  const chartOptionsSrc = `// AUTO-GENERATED — replace placeholder data with real API responses.
// See _chart_placeholder_hints.json for guidance on each chart's semantic context.
export const chartOptions = {
${zones.map(z => {
    const xData = z.series.map((_, i) => `Category ${i + 1}`)
    return `  ${JSON.stringify(z.anchorId)}: {
    backgroundColor: 'transparent',
    xAxis: { type: 'category', data: ${JSON.stringify(xData)}, axisLabel: { color: '#8b949e' } },
    yAxis: { type: 'value', axisLabel: { color: '#8b949e' } },
    series: [{ type: ${JSON.stringify(z.chartType || 'bar')}, data: ${JSON.stringify(z.series)}, itemStyle: { color: '#58a6ff' } }],
  },`
  }).join('\n')}
}
`

  // ── chartPlaceholderHints ─────────────────────────────────────────────────
  const chartPlaceholderHints = zones.map(z => ({
    chartZone: z.anchorId,
    chartType: z.chartType || 'bar',
    framework: 'react',
    TODO: [
      'Replace series[0].data with real API data (currently normalized height placeholder values)',
      'Replace xAxis.data with time/category labels (currently index placeholders)',
      'Check _render_gaps_report.json > chartSectionTitles for semantic context',
      'Dispose chart in useEffect cleanup (already scaffolded)',
    ],
    placeholderSeries: z.series,
  }))

  return { jsx, css, chartOptions: chartOptionsSrc, chartPlaceholderHints }
}

// ─── CLI entry ───────────────────────────────────────────────────────────────
if (process.argv[2]) {
  const graphFile = process.argv[2]
  const zonesFile = process.argv[3] && fs.existsSync(process.argv[3]) ? process.argv[3] : null
  const outDir    = process.argv[4] || '.'
  const host      = process.argv.includes('--host')
    ? process.argv[process.argv.indexOf('--host') + 1]
    : 'fullscreen'
  const pageName  = process.argv.includes('--name')
    ? process.argv[process.argv.indexOf('--name') + 1]
    : 'SceneGraphPage'

  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
  const zones = zonesFile
    ? (JSON.parse(fs.readFileSync(zonesFile, 'utf8')).zones || [])
    : []

  const out = genReactFromSceneGraph(graph, { host, chartZones: zones, pageName })

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'Index.generated.jsx'), out.jsx, 'utf8')
  fs.writeFileSync(path.join(outDir, 'index.module.css'),    out.css, 'utf8')
  fs.writeFileSync(path.join(outDir, 'chartOptions.js'),     out.chartOptions, 'utf8')

  if (out.chartPlaceholderHints.length) {
    const hintsPath = path.join(outDir, '_chart_placeholder_hints.json')
    fs.writeFileSync(hintsPath, JSON.stringify(out.chartPlaceholderHints, null, 2), 'utf8')
    console.log(`⚠️  ${out.chartPlaceholderHints.length} chart zone(s) with placeholder data — see ${hintsPath}`)
  }

  console.log(`✅ React output written to: ${outDir}`)
  console.log(`   Index.generated.jsx  (${out.jsx.length} chars)`)
  console.log(`   index.module.css     (${out.css.length} chars)`)
  console.log(`   chartOptions.js      (${out.chartOptions.length} chars)`)
}
