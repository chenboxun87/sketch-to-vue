/**
 * MasterGo 导出包全量 extract（B 轨道）
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import {
  flattenMgFrame,
  buildClassification,
  buildMgGapsReport,
} from './mastergo-normalize.mjs'
import { buildStyleTokenMap } from './mastergo-style-tokens.mjs'
import { buildLayerStack, buildMgConsumeAudit, loadDynamicZones, skipRedundantDescendantsOfSliceParents } from './mastergo-layer-stack.mjs'
import { detectStyleGaps, detectStyleGapsForElement } from './mastergo-style-gaps.mjs'
import {
  buildExportSettingsMap,
  buildNodeExportHints,
  buildMgImageCatalog,
  resolveAllMgAssets,
} from './mastergo-asset-resolve.mjs'
import {
  loadDesignRootLayerFiles,
  validateLayersAgainstElements,
} from './mastergo-layers-txt.mjs'
import { enrichMgElements } from './enrich-mg-elements.mjs'

const args = process.argv.slice(2)
const getArg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

const designDir = getArg('--dir')
const designRoot = getArg('--design-root') || (designDir ? path.dirname(designDir) : null)
const frameName = getArg('--frame')
const dslPath = getArg('--dsl')
const fetchDsl = args.includes('--fetch-dsl')
const mgToken = getArg('--token') || process.env.MASTERGO_TOKEN
const fileIdArg = getArg('--file-id')
const noFramePng = args.includes('--no-frame-png')
const outDir = getArg('--out') || process.cwd()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function extractMgFileId(fd) {
  if (fileIdArg) return fileIdArg
  for (const bucket of Object.values(fd.styles || {})) {
    if (!Array.isArray(bucket) || !bucket[0]?.key) continue
    const id = String(bucket[0].key).split('+')[0]
    if (id && /^\d+$/.test(id)) return id
  }
  return null
}

function fetchDslToFile({ fileId, layerId, outPath, token }) {
  const pyScript = path.join(__dirname, 'mastergo_get_dsl.py')
  const pyArgs = [pyScript, '--file-id', fileId, '--layer-id', layerId, '--pretty']
  if (token) pyArgs.push('--token', token)
  const res = spawnSync('python', pyArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (res.status !== 0) {
    console.error('[ERROR] fetch DSL failed:', res.stderr || res.stdout)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, res.stdout)
  console.log('[OK] MCP DSL →', outPath)
  return outPath
}

if (!designDir || !frameName) {
  console.error('Usage: node extract-mastergo-all.mjs --dir "<dir>" --frame "<name>" [--out "<outDir>"]')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

const fdPath = path.join(designDir, 'FILE_DATA.json')
const fd = JSON.parse(fs.readFileSync(fdPath, 'utf8'))
const page1 = fd.document?.children?.find((p) => p.type === 'CANVAS') || fd.document?.children?.[0]
const frame = page1?.children?.find((f) => f.name === frameName)
if (!frame) {
  console.error('[ERROR] 找不到帧:', frameName)
  process.exit(1)
}

let effectiveDslPath = dslPath
if (fetchDsl) {
  const fileId = extractMgFileId(fd)
  if (!fileId) {
    console.error('[ERROR] --fetch-dsl 需要 --file-id 或 FILE_DATA.styles 中含 fileId')
    process.exit(1)
  }
  if (!mgToken) {
    console.error('[ERROR] --fetch-dsl 需要 MASTERGO_TOKEN 或 --token')
    process.exit(1)
  }
  effectiveDslPath =
    dslPath || path.join(outDir, `mg-dsl-${String(frame.id).replace(/:/g, '-')}.json`)
  if (!fs.existsSync(effectiveDslPath)) {
    fetchDslToFile({ fileId, layerId: frame.id, outPath: effectiveDslPath, token: mgToken })
  } else {
    console.log('[SKIP] 已有 DSL 文件:', effectiveDslPath)
  }
}

const b = frame.absoluteBoundingBox
const originX = b?.x || 0
const originY = b?.y || 0
const board = { w: Math.round(b?.width || 0), h: Math.round(b?.height || 0), name: frameName }

const styleTokenMap = buildStyleTokenMap(fd)
const exportsDir = path.join(designDir, 'data', 'exports')
const exportFiles = fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir) : []
const dataDir = path.join(designDir, 'data')

const manualMapPath = path.join(outDir, '_asset_map.manual.json')
const manualMap = fs.existsSync(manualMapPath)
  ? JSON.parse(fs.readFileSync(manualMapPath, 'utf8'))
  : {}

const globalExportMap = buildExportSettingsMap(fd)
const exportHints = buildNodeExportHints(frame, globalExportMap)

const elements = flattenMgFrame(frame, originX, originY, { styleTokenMap, assetMap: {} })
for (const el of elements) {
  const raw = {
    type: el.mgNodeType || el.type?.toUpperCase(),
    cornerRadius: el.mgCornerRadiusRaw,
    rectangleCornerRadii: el.mgRectangleCornerRadii,
    isMaskOutline: el.isMaskOutline,
    fills: el.fills,
  }
  const gaps = detectStyleGaps(raw)
  if (gaps.length) el.styleGaps = gaps
}

enrichMgElements({
  elements,
  designDir,
  outDir,
  board,
  frameId: frame.id,
  dslPath: effectiveDslPath,
  enableFramePng: !noFramePng,
})

for (const el of elements) {
  if (!el.styleGaps?.length) continue
  const gaps = detectStyleGapsForElement(el)
  el.styleGaps = gaps.length ? gaps : undefined
}

const elementsById = Object.fromEntries(elements.map((e) => [e.id, e]))

const { assetMap, catalog: resolveCatalog } = resolveAllMgAssets(elements, {
  exportHints,
  exportByName: globalExportMap.byName || {},
  exportFiles,
  exportsDir,
  dataDir,
  manualMap,
  elementsById,
  fileData: fd,
})

skipRedundantDescendantsOfSliceParents(elements)

const dynamicZones = loadDynamicZones(outDir)
const classification = buildClassification(elements)
const layerStack = buildLayerStack(elements, dynamicZones)

const imageCatalog = buildMgImageCatalog(elements, fd, frame, designDir, assetMap)

const missingAssets = elements
  .filter((e) => e.type === 'image' && !e.exportSlice)
  .map((e) => {
    const cat = imageCatalog.images.find((x) => x.id === e.id) || {}
    return {
      id: e.id,
      name: e.name,
      imageRef: e.imageRef,
      exportFileName: cat.exportFileName || null,
      expectedPaths: cat.expectedPaths || [],
      kind: 'missing-image',
      severity: 'high',
      hint: cat.exportFileName
        ? `重导出时勾选「包含图片」→ data/exports/${cat.exportFileName}`
        : '无 exportSettings 声明；可尝试 data/exports/' + (e.imageRef ? path.basename(e.imageRef) : `data/${e.id.replace(/:/g, '-')}.png`),
    }
  })

const renderGapsReport = buildMgGapsReport(elements, assetMap)
const consumeAudit = buildMgConsumeAudit(elements, layerStack, assetMap)

const layersTxt = loadDesignRootLayerFiles(designRoot, frameName)
const layersValidation = layersTxt.layers.length
  ? validateLayersAgainstElements(layersTxt.layers, elements, { x: originX, y: originY })
  : { ok: true, layerCount: 0, matchedCount: 0, mismatchCount: 0, note: 'no layers.txt' }

const MG_CONSUMED = new Set([
  'id', 'name', 'type', 'absoluteBoundingBox', 'children', 'fills', 'strokes',
  'effects', 'style', 'characters', 'opacity', 'layoutMode', 'itemSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'cornerRadius',
  'rectangleCornerRadii', 'strokeWeight', 'strokeAlign', 'blendMode', 'clipsContent',
  'rotation', 'isMixedText', 'textTable', 'characterStyleOverrides', 'styleOverrideTable',
  'exportSettings', 'isMaskOutline', 'bound', 'isVisible', 'visible',
])
const unmapped = {}
;(function scanNode(n) {
  for (const k of Object.keys(n)) {
    if (!MG_CONSUMED.has(k)) unmapped[k] = (unmapped[k] || 0) + 1
  }
  for (const c of n.children || []) scanNode(c)
})(frame)

const payload = {
  source: fdPath,
  board,
  origin: { x: originX, y: originY },
  count: elements.length,
  elements,
}

fs.writeFileSync(path.join(outDir, '_all_elements.json'), JSON.stringify(payload, null, 2))
fs.writeFileSync(path.join(outDir, '_classification.json'), JSON.stringify(classification, null, 2))
fs.writeFileSync(path.join(outDir, '_layer_stack.json'), JSON.stringify(layerStack, null, 2))
fs.writeFileSync(path.join(outDir, '_missing_assets.json'), JSON.stringify({ items: missingAssets }, null, 2))
fs.writeFileSync(path.join(outDir, '_asset_map.json'), JSON.stringify(assetMap, null, 2))
fs.writeFileSync(path.join(outDir, '_mg_image_catalog.json'), JSON.stringify(imageCatalog, null, 2))
fs.writeFileSync(path.join(outDir, '_render_gaps_report.json'), JSON.stringify(renderGapsReport, null, 2))
fs.writeFileSync(path.join(outDir, '_mg_consume_audit.json'), JSON.stringify(consumeAudit, null, 2))
fs.writeFileSync(
  path.join(outDir, '_layers_txt_validation.json'),
  JSON.stringify(
    {
      designRoot,
      sourceFile: layersTxt.sourceFile,
      frameRoot: layersTxt.frameRoot,
      validation: layersValidation,
    },
    null,
    2
  )
)
fs.writeFileSync(
  path.join(outDir, '_extraction_coverage.json'),
  JSON.stringify({ consumedFields: [...MG_CONSUMED], unmappedFields: unmapped, ok: Object.keys(unmapped).length === 0 }, null, 2)
)

console.log(`[OK] 帧 "${frameName}" ${board.w}×${board.h} → ${elements.length} 元素`)
console.log('  design root:', designRoot || '(none)')
if (effectiveDslPath) console.log('  dsl enrich:', effectiveDslPath, noFramePng ? '(no frame PNG)' : '')
console.log('  layers.txt:', layersTxt.sourceFile || '(none)', layersValidation.matchedCount != null ? `matched ${layersValidation.matchedCount}` : '')
console.log('  exports dir:', exportsDir, fs.existsSync(exportsDir) ? `(${exportFiles.length} files)` : '(missing)')
console.log('  slices resolved:', Object.keys(assetMap).length)
console.log('  stack decor:', layerStack.decorCount, 'audit ok:', consumeAudit.ok)
if (missingAssets.length) {
  console.log('  missing images:')
  for (const m of missingAssets) {
    console.log(`    ${m.id} ${m.name} → ${m.hint}`)
  }
}
if (consumeAudit.blockers.length) {
  console.log('  blockers:', consumeAudit.blockers.map((b) => b.code).join(', '))
}
console.log('  →', outDir)

if (!consumeAudit.ok) process.exitCode = 2
