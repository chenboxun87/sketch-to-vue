// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// React 18 JSX + CSS Modules emitter — deterministic codegen from scene graph.
// CLI: node emit-react.mjs <scene-graph.json> [chart-zones.json] [outDir] [--host fullscreen|basic-layout] [--name PageName]
import fs from 'node:fs'
import path from 'node:path'

// ─── CSS parsing helpers ──────────────────────────────────────────────────────

/**
 * Parse a raw CSS declaration block into {prop: value} pairs.
 * Paren-depth counter prevents `;` and `:` inside function calls
 * (linear-gradient, url('data:...')) from being treated as delimiters.
 */
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
  const prop = decl.slice(0, ci).trim()
  const val  = decl.slice(ci + 1).trim()
  if (prop && val) out[prop] = val
}

/** Convert CSS kebab-case property name to React camelCase. */
function toCamel(prop) {
  if (prop === 'float') return 'cssFloat'
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/**
 * Build a React style object for a node.
 *
 * Handles:
 * - Position + dimensions from node.rect (numbers — React appends 'px')
 * - All extra visual CSS from node.attrs.css (background, shadow, gradient…)
 * - Ellipse detection: names matching 椭圆|oval|ellipse → borderRadius '50%'
 * - object-fit → objectFit camelCase conversion (for render-slice images)
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

  // Ellipse detection (hard-won rule from production usage)
  if (/椭圆|oval|ellipse/i.test(node.name || '')) {
    obj.borderRadius = '50%'
  }

  // Merge extra visual CSS from scene graph attrs
  const extraCss = (node.attrs.css || []).join('')
  const parsed   = parseCssDecls(extraCss)
  for (const [prop, val] of Object.entries(parsed)) {
    // Skip positional props already set above
    if (['position', 'left', 'top', 'width', 'height', 'z-index'].includes(prop)) continue
    obj[toCamel(prop)] = val
  }
  return obj
}

/**
 * Serialize a style object to a JSX inline style expression string.
 * Numbers are emitted as-is (React appends 'px' for length properties).
 * Strings are JSON-quoted.
 * Returns a string ready to embed in JSX: `style=${styleToJSX(obj)}`
 */
function styleToJSX(obj) {
  const entries = Object.entries(obj).map(([k, v]) =>
    typeof v === 'number' ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`
  )
  return `{{ ${entries.join(', ')} }}`
}

// ─── Identifier helpers ───────────────────────────────────────────────────────

function toRefName(id)   { return 'chartRef_' + id.replace(/[^a-zA-Z0-9]/g, '_') }
function toAssetVar(id)  { return 'asset_'    + id.replace(/[^a-zA-Z0-9]/g, '_') }
function toStateVar(id)  { return 'text_'     + id.replace(/[^a-zA-Z0-9]/g, '_') }

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate React 18 JSX + CSS Modules output from a typed scene graph.
 * This function is fully re-entrant (no module-level mutable state).
 *
 * @param {object} graph
 * @param {object} opts
 * @param {string} opts.host        - 'fullscreen' | 'basic-layout'
 * @param {Array}  opts.chartZones  - [{anchorId, chartType, series}]
 * @param {string} opts.pageName    - PascalCase component name
 * @returns {{ jsx, css, chartOptions, chartPlaceholderHints }}
 */
export function genReactFromSceneGraph(graph, opts = {}) {
  const host     = opts.host || 'fullscreen'
  const zones    = opts.chartZones || []
  const pageName = opts.pageName || 'SceneGraphPage'
  const board    = graph.meta.board   // { x, y, w, h }

  // Sort nodes by z-index (painter's order — lower z drawn first)
  const nodes = [...graph.nodes].sort((a, b) => a.z - b.z)

  // ── Asset import map (render-slice nodes) ─────────────────────────────────
  // Map<nodeId, { varName, filePath }>
  const assetImportMap = new Map()
  for (const n of nodes) {
    if (n.disposition?.kind === 'render-slice') {
      const filePath = n.attrs?.exports?.[0]?.path || (n.id + '.png')
      assetImportMap.set(n.id, { varName: toAssetVar(n.id), filePath })
    }
  }

  // ── Chart zone lookup for safe ref matching ───────────────────────────────
  // Ensures we use z.anchorId as the canonical ref name even if n.id matches
  const zoneByAnchorId = new Map(zones.map(z => [z.anchorId, z]))

  // ── Build JSX body + dynamic text state registry ──────────────────────────
  // dynamicTextVars: Map<stateVarName, initValueJSON> — populated during loop
  const dynamicTextVars = new Map()
  const jsxLines = []

  for (const n of nodes) {
    const k = n.disposition?.kind
    if (!k) continue
    if (k === 'container' || k === 'chart-series-member') continue

    if (k.startsWith('exclude:')) {
      // Use JSON.stringify(n.name) so any special chars in the name are safe in comments
      jsxLines.push(`      {/* EXCLUDED [${k}] layer: ${JSON.stringify(n.name)} id: ${n.id} */}`)
      continue
    }

    if (k === 'chart-zone') {
      const refId   = zoneByAnchorId.has(n.id) ? n.id : n.id  // anchorId === n.id by convention
      const refName = toRefName(refId)
      jsxLines.push(`      <div ref={${refName}} style=${styleToJSX(buildStyleObj(n))} />`)
      continue
    }

    if (k === 'render-slice') {
      const asset   = assetImportMap.get(n.id)
      // Deterministic asset reference — never a string guess, never a dynamic path
      const srcExpr = asset
        ? `{${asset.varName}}`
        : `{"" /* MISSING ASSET: id=${n.id} — add file to assets/ */}`
      jsxLines.push(`      <img src=${srcExpr} style=${styleToJSX(buildStyleObj(n))} alt="" />`)
      continue
    }

    if (k === 'render-vector') {
      jsxLines.push(`      <div style=${styleToJSX(buildStyleObj(n))} />`)
      continue
    }

    if (k === 'live-text-static') {
      // Use JSX expression {text} — React auto-escapes XSS, handles all unicode.
      // JSON.stringify produces a safe JS string literal (quotes, backslash, special chars).
      const text = JSON.stringify(n.attrs.content || '')
      jsxLines.push(`      <div style=${styleToJSX(buildStyleObj(n))}>{${text}}</div>`)
      continue
    }

    if (k === 'live-text-dynamic') {
      // Register as a useState variable so the consumer can bind real data.
      const varName = toStateVar(n.id)
      const initVal = JSON.stringify(n.attrs.content || '')
      dynamicTextVars.set(varName, initVal)
      jsxLines.push(`      {/* TODO: update ${varName} with real data source */}`)
      jsxLines.push(`      <div style=${styleToJSX(buildStyleObj(n))}>{${varName}}</div>`)
      continue
    }
  }

  // ── useState declarations for dynamic text vars ───────────────────────────
  // One useState per unique dynamic text node, initial value from design attrs.
  const stateDecls = [...dynamicTextVars.entries()].map(([varName, initVal]) => {
    const setter = 'set' + varName[0].toUpperCase() + varName.slice(1)
    return `  const [${varName}, ${setter}] = useState(${initVal})`
  })

  // ── useRef declarations ───────────────────────────────────────────────────
  const rootRefDecl = host === 'fullscreen' ? `  const rootRef = useRef(null)\n` : ''
  const refDecls    = zones.map(z => `  const ${toRefName(z.anchorId)} = useRef(null)`)

  // ── useEffect: big-screen viewport scaling ────────────────────────────────
  // position: fixed; top: 0; left: 0 in CSS + transform: scale() here
  // gives proper full-viewport coverage at any browser size.
  const scaleEffect = host === 'fullscreen' ? `
  // Big-screen viewport scaling: maintains design dimensions at any window size.
  useEffect(() => {
    const applyScale = () => {
      const s = Math.min(window.innerWidth / BOARD_W, window.innerHeight / BOARD_H)
      if (rootRef.current) rootRef.current.style.transform = \`scale(\${s})\`
    }
    applyScale()
    window.addEventListener('resize', applyScale)
    return () => window.removeEventListener('resize', applyScale)
  }, [])` : ''

  // ── useEffect: ECharts (one per chart zone) ───────────────────────────────
  const chartEffects = zones.map(z => {
    const refName = toRefName(z.anchorId)
    return `
  // ECharts zone: "${z.anchorId}" (type: ${z.chartType || 'bar'})
  useEffect(() => {
    if (!${refName}.current) return
    const inst = echarts.init(${refName}.current)
    inst.setOption(chartOptions[${JSON.stringify(z.anchorId)}])
    const ro = new ResizeObserver(() => inst.resize())
    ro.observe(${refName}.current)
    return () => {
      inst.dispose()
      ro.disconnect()
    }
  }, [])`.trimEnd()
  })

  // ── Compute which hooks to import ─────────────────────────────────────────
  const needsUseRef    = zones.length > 0 || host === 'fullscreen'
  const needsUseEffect = zones.length > 0 || host === 'fullscreen'
  const needsUseState  = dynamicTextVars.size > 0

  const hooks = [
    needsUseRef    ? 'useRef'    : null,
    needsUseEffect ? 'useEffect' : null,
    needsUseState  ? 'useState'  : null,
  ].filter(Boolean)

  const importLine = hooks.length > 0
    ? `import React, { ${hooks.join(', ')} } from 'react'`
    : `import React from 'react'`

  // ── Asset import lines ─────────────────────────────────────────────────────
  const assetImportLines = [...assetImportMap.values()].map(
    ({ varName, filePath }) => `import ${varName} from './assets/${filePath}'`
  )

  // ── Compose final JSX file ────────────────────────────────────────────────
  const rootRefAttr = host === 'fullscreen' ? ` ref={rootRef}` : ''

  const jsx = `// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// AUTO-GENERATED by emit-react.mjs — safe to edit; re-running will overwrite.
${importLine}
${zones.length > 0 ? "import * as echarts from 'echarts'" : ''}
import styles from './index.module.css'
${assetImportLines.length > 0
  ? '\n// Asset imports — resolved deterministically from scene graph (never guessed)\n' +
    assetImportLines.join('\n')
  : ''}
${zones.length > 0 ? "\nimport { chartOptions } from './chartOptions.js'" : ''}
${host === 'fullscreen' ? `\nconst BOARD_W = ${board.w}\nconst BOARD_H = ${board.h}` : ''}

export default function ${pageName}() {
${rootRefDecl}${refDecls.join('\n')}${refDecls.length ? '\n' : ''}${stateDecls.join('\n')}${stateDecls.length ? '\n' : ''}${scaleEffect}
${chartEffects.join('\n')}

  return (
    <div className={styles.root}${rootRefAttr}>
${jsxLines.join('\n')}
    </div>
  )
}
`

  // ── CSS Modules stylesheet ────────────────────────────────────────────────
  // fullscreen: position fixed at top-left so transform-scale math is correct.
  // basic-layout: relative width, embedded in layout shell.
  const rootCssLines = host === 'fullscreen'
    ? [
        '  position: fixed',
        '  top: 0',
        '  left: 0',
        `  width: ${board.w}px`,
        `  height: ${board.h}px`,
        '  overflow: hidden',
        '  transform-origin: top left',
      ]
    : [
        '  position: relative',
        '  width: 100%',
        '  overflow: hidden',
      ]

  const css = `/* AUTO-GENERATED by emit-react.mjs */
.root {
${rootCssLines.join(';\n')};
}
`

  // ── chartOptions.js ───────────────────────────────────────────────────────
  const chartOptionsSrc = `// AUTO-GENERATED — replace placeholder data with real API responses.
// See _chart_placeholder_hints.json for each chart zone's semantic context.
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

  // ── Chart placeholder hints ───────────────────────────────────────────────
  const chartPlaceholderHints = zones.map(z => ({
    chartZone: z.anchorId,
    chartType: z.chartType || 'bar',
    framework: 'react',
    TODO: [
      'Replace series[0].data with real API data (currently normalized placeholder values)',
      'Replace xAxis.data with real time/category labels',
      'Check _render_gaps_report.json > chartSectionTitles for semantic context',
      'echarts.dispose() is already in useEffect cleanup — do not add a duplicate',
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
  fs.writeFileSync(path.join(outDir, 'Index.generated.jsx'), out.jsx,          'utf8')
  fs.writeFileSync(path.join(outDir, 'index.module.css'),    out.css,          'utf8')
  fs.writeFileSync(path.join(outDir, 'chartOptions.js'),     out.chartOptions, 'utf8')

  if (out.chartPlaceholderHints.length) {
    const hp = path.join(outDir, '_chart_placeholder_hints.json')
    fs.writeFileSync(hp, JSON.stringify(out.chartPlaceholderHints, null, 2), 'utf8')
    console.log(`⚠️  ${out.chartPlaceholderHints.length} chart zone(s) with placeholder data → see ${hp}`)
  }

  console.log(`✅ React output → ${outDir}`)
  console.log(`   Index.generated.jsx  (${out.jsx.length} chars, host=${host})`)
  console.log(`   index.module.css`)
  console.log(`   chartOptions.js      (${zones.length} chart zone(s))`)
}
