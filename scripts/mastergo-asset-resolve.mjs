/**
 * MasterGo 图片资源多源解析（对齐 Sketch A 轨道 resolveAsset + base64 扫描）
 *
 * MasterGo 预览加载规则（index.html 内嵌 viewer）：
 *   `./data/exports/${exportSettings.fileName}`  或  `./data/${id.replace(':','-')}.png`
 *
 * imageRef（如 194072873611231/.../hash.jpg）是云端资源键，不是本地路径；
 * 本地包须靠 data/exports/ 落盘，或导出时勾选「包含图片资源」。
 */
import fs from 'fs'
import path from 'path'
import { detectStyleGapsForElement } from './mastergo-style-gaps.mjs'

const B64_RE = /data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)/gi

/** FILE_DATA.exportSettings → nodeId → 优先 fileName；byName → fileName */
export function buildExportSettingsMap(fileData) {
  const byId = {}
  const byName = {}
  for (const row of fileData?.exportSettings || []) {
    if (!row?.fileName) continue
    const scale = row.constraint?.value || 1
    if (row.id) {
      const prev = byId[row.id]
      if (!prev || scale < prev.scale) {
        byId[row.id] = { fileName: row.fileName, scale, format: row.format, name: row.name }
      }
    }
    if (row.name) {
      const prev = byName[row.name]
      if (!prev || scale < prev.scale) {
        byName[row.name] = { fileName: row.fileName, scale, format: row.format, id: row.id, name: row.name }
      }
    }
  }
  return { byId, byName }
}

/** 遍历帧树，合并节点级 exportSettings（fileName 为空时用全局 map） */
export function buildNodeExportHints(frame, globalMaps) {
  const hints = { ...(globalMaps.byId || globalMaps) }
  function walk(node) {
    if (node.id && node.exportSettings?.length) {
      const withName = node.exportSettings.find((e) => e.fileName)
      if (withName) {
        hints[node.id] = {
          fileName: withName.fileName,
          scale: withName.constraint?.value || 1,
          format: withName.format,
          name: node.name,
          source: 'node',
        }
      } else if (!hints[node.id]) {
        hints[node.id] = {
          fileName: null,
          scale: node.exportSettings[0]?.constraint?.value || 1,
          format: node.exportSettings[0]?.format || 'PNG',
          name: node.name,
          source: 'node-empty-filename',
        }
      }
    }
    for (const c of node.children || []) walk(c)
  }
  walk(frame)
  return hints
}

function listExportFiles(exportsDir) {
  if (!exportsDir || !fs.existsSync(exportsDir)) return []
  return fs.readdirSync(exportsDir)
}

/** 精确名 → @2x → @3x → 去 @Nx（同 Sketch resolveAsset） */
export function resolveExportFileName(fileName, exportFiles) {
  if (!fileName || !exportFiles.length) return null
  const ext = path.extname(fileName)
  const base = fileName.slice(0, ext.length ? -ext.length : undefined)
  const baseNoScale = base.replace(/@\dx$/, '')
  const candidates = [
    fileName,
    `${baseNoScale}@1x${ext}`,
    `${baseNoScale}@2x${ext}`,
    `${baseNoScale}@3x${ext}`,
    `${baseNoScale}${ext}`,
  ]
  for (const c of candidates) {
    if (exportFiles.includes(c)) return c
  }
  return null
}

function hashFromImageRef(imageRef) {
  if (!imageRef) return null
  const base = path.basename(String(imageRef))
  return base.includes('.') ? base : `${base}.png`
}

function idFallbackFileName(nodeId) {
  return `${String(nodeId).replace(/:/g, '-')}.png`
}

/** 沿 parentId 向上查找 exportSettings 声明（MasterGo 常把切图绑在父 FRAME 上） */
function resolveFromAncestorExport(el, ctx) {
  const { exportHints = {}, exportFiles = [], elementsById = {} } = ctx
  let cur = el.parentId
  while (cur) {
    const hint = exportHints[cur]
    if (hint?.fileName) {
      const hit = resolveExportFileName(hint.fileName, exportFiles)
      if (hit) {
        const ancestor = elementsById[cur]
        return {
          file: hit,
          source: 'exportSettings-ancestor',
          exportFileName: hint.fileName,
          inheritedFrom: { id: cur, name: ancestor?.name || hint.name },
        }
      }
    }
    cur = elementsById[cur]?.parentId
  }
  return null
}

/** exportSettings 已声明且磁盘存在、但未绑定到任何 IMAGE 元素的文件 */
export function findOrphanExportFiles(elements, fileData, exportFiles, assetMap) {
  const mapped = new Set(Object.values(assetMap))
  const orphans = []

  for (const row of fileData?.exportSettings || []) {
    if (!row.fileName || !row.id) continue
    const onDisk = resolveExportFileName(row.fileName, exportFiles)
    if (!onDisk) continue
    if (!mapped.has(onDisk)) {
      orphans.push({
        exportSettingsId: row.id,
        exportSettingsName: row.name,
        fileName: row.fileName,
        resolvedFile: onDisk,
      })
    }
  }
  return orphans
}

/** 按 exportSettings 解析切片（pen/shape；仅 id 精确匹配，避免「路径」等同名误绑） */
export function resolveMgExportSlice(el, ctx) {
  const {
    exportHints = {},
    exportFiles = [],
    dataDir,
    manualMap = {},
    elementsById = {},
    assignedFiles = new Set(),
  } = ctx

  const expectedPaths = []
  const hint = exportHints[el.id]
  const exportFileName = hint?.fileName || null

  if (exportFileName) expectedPaths.push(`data/exports/${exportFileName}`)
  expectedPaths.push(`data/${idFallbackFileName(el.id)}`)

  const manual = manualMap[el.id]
  if (manual && !String(manual).startsWith('css:')) {
    const hit = resolveExportFileName(manual, exportFiles) || (exportFiles.includes(manual) ? manual : null)
    if (hit && !assignedFiles.has(hit)) {
      return { file: hit, source: 'manual', expectedPaths, exportFileName: manual }
    }
  }

  if (exportFileName) {
    const hit = resolveExportFileName(exportFileName, exportFiles)
    if (hit && !assignedFiles.has(hit)) {
      return { file: hit, source: 'exportSettings-slice', expectedPaths, exportFileName }
    }
  }

  // 仅 IMAGE 子层可继承父 FRAME export（如 6493 ← 6492）
  if (el.type === 'image') {
    const inherited = resolveFromAncestorExport(el, ctx)
    if (inherited?.file && !assignedFiles.has(inherited.file)) {
      return { ...inherited, expectedPaths }
    }
  }

  const idFallback = idFallbackFileName(el.id)
  if (exportFiles.includes(idFallback) && !assignedFiles.has(idFallback)) {
    return { file: idFallback, source: 'id-fallback', expectedPaths, exportFileName: null }
  }

  if (dataDir && fs.existsSync(path.join(dataDir, idFallback)) && !assignedFiles.has(idFallback)) {
    return { file: path.join('..', 'data', idFallback), source: 'data-id-fallback', expectedPaths, exportFileName: null }
  }

  return { file: null, source: 'unresolved', expectedPaths, exportFileName }
}

function styleGapsForElement(el) {
  if (el.styleGaps?.length) return el.styleGaps
  return detectStyleGapsForElement(el)
}

/** 仅当 FILE_DATA 样式不完整（styleGaps）且存在 export 时才切图；完整 CSS 优先 div */
function shouldTryExportSlice(el, ctx) {
  const gaps = styleGapsForElement(el)
  if (!gaps.length) return false
  if (el.type === 'pen' || el.type === 'shape') return true
  return false
}

function shouldTryFrameExportSlice(el, ctx) {
  if (el.renderAs !== 'skip') return false
  if (el.type !== 'frame' && el.type !== 'group') return false
  const hint = ctx.exportHints?.[el.id]
  return !!(hint?.fileName)
}

function isDescendantOf(el, ancestorId, elementsById) {
  let cur = el.parentId
  while (cur) {
    if (cur === ancestorId) return true
    cur = elementsById[cur]?.parentId
  }
  return false
}

/** 孤儿 export 补绑（exportSettings.id 不在树内、或 pen 无声明时） */
function tryBindOrphanExport(el, ctx, assignedFiles) {
  const { fileData, exportFiles, elementsById = {} } = ctx
  for (const row of fileData?.exportSettings || []) {
    if (!row.fileName) continue
    const hit = resolveExportFileName(row.fileName, exportFiles)
    if (!hit || assignedFiles.has(hit)) continue

    if (row.id === el.id) {
      return { file: hit, source: 'exportSettings-slice', exportFileName: row.fileName }
    }

    // 发送按钮：export 声明在已删除节点 11:9098，实际 pen 为 11:8992
    if (row.name === '发送' && el.name === '路径' && isDescendantOf(el, '11:8995', elementsById)) {
      return { file: hit, source: 'orphan-export-send-icon', exportFileName: row.fileName }
    }
  }
  return null
}

/**
 * 为单个 IMAGE 元素解析资源
 * @returns {{ file: string|null, source: string, expectedPaths: string[], exportFileName: string|null }}
 */
export function resolveMgImageAsset(el, ctx) {
  const {
    exportHints = {},
    exportByName = {},
    exportFiles = [],
    exportsDir,
    dataDir,
    manualMap = {},
    elementsById = {},
  } = ctx

  const expectedPaths = []
  let hint = exportHints[el.id]
  let exportFileName = hint?.fileName || null

  if (!exportFileName && el.name && exportByName[el.name]) {
    const entry = exportByName[el.name]
    if (entry.id === el.id || (el.type === 'image' && entry.name === el.name)) {
      exportFileName = entry.fileName
      hint = { ...entry, source: 'exportSettings-by-name' }
    }
  }

  if (exportFileName) {
    expectedPaths.push(`data/exports/${exportFileName}`)
  }
  expectedPaths.push(`data/${idFallbackFileName(el.id)}`)
  if (el.imageRef) {
    expectedPaths.push(`data/exports/${hashFromImageRef(el.imageRef)}`)
  }

  // 父级 export 路径也列入 expected（便于审计）
  let p = el.parentId
  while (p) {
    const ph = exportHints[p]
    if (ph?.fileName) expectedPaths.push(`data/exports/${ph.fileName} (ancestor ${p})`)
    p = elementsById[p]?.parentId
  }

  const manual = manualMap[el.id]
  if (manual && !String(manual).startsWith('css:')) {
    const hit = resolveExportFileName(manual, exportFiles) || (exportFiles.includes(manual) ? manual : null)
    if (hit) return { file: hit, source: 'manual', expectedPaths, exportFileName }
  }

  if (exportFileName) {
    const hit = resolveExportFileName(exportFileName, exportFiles)
    if (hit) {
      return {
        file: hit,
        source: hint?.source === 'exportSettings-by-name' ? 'exportSettings-by-name' : 'exportSettings',
        expectedPaths,
        exportFileName,
      }
    }
  }

  if (el.imageRef) {
    const hashName = hashFromImageRef(el.imageRef)
    const byHash = exportFiles.find(
      (f) => f === hashName || f.includes(path.basename(hashName, path.extname(hashName)))
    )
    if (byHash) return { file: byHash, source: 'imageRef-hash', expectedPaths, exportFileName }
  }

  const inherited = resolveFromAncestorExport(el, ctx)
  if (inherited) {
    return { ...inherited, expectedPaths }
  }

  const idFallback = idFallbackFileName(el.id)
  if (exportFiles.includes(idFallback)) {
    return { file: idFallback, source: 'id-fallback', expectedPaths, exportFileName }
  }

  if (dataDir && fs.existsSync(path.join(dataDir, idFallback))) {
    return { file: path.join('..', 'data', idFallback), source: 'data-id-fallback', expectedPaths, exportFileName }
  }

  return { file: null, source: 'unresolved', expectedPaths, exportFileName }
}

export function buildMgImageCatalog(elements, fileData, frame, designDir, assetMap = {}) {
  const exportsDir = path.join(designDir, 'data', 'exports')
  const dataDir = path.join(designDir, 'data')
  const exportFiles = listExportFiles(exportsDir)
  const globalMaps = buildExportSettingsMap(fileData)
  const exportHints = buildNodeExportHints(frame, globalMaps)
  const elementsById = Object.fromEntries(elements.map((e) => [e.id, e]))
  const ctxBase = {
    exportHints,
    exportByName: globalMaps.byName || {},
    exportFiles,
    exportsDir,
    dataDir,
    manualMap: {},
    elementsById,
  }

  const htmlPath = path.join(designDir, 'index.html')
  const jsPath = path.join(designDir, 'static', 'js', 'main.ea5ea239.js')
  const b64Sources = []
  if (fs.existsSync(htmlPath)) b64Sources.push({ label: 'index.html', text: fs.readFileSync(htmlPath, 'utf8') })
  if (fs.existsSync(jsPath)) b64Sources.push({ label: 'main.js', text: fs.readFileSync(jsPath, 'utf8') })
  const embeddedBase64 = scanEmbeddedBase64(b64Sources)

  const images = elements
    .filter((e) => e.type === 'image' && e.imageRef)
    .map((el) => {
      const resolved = resolveMgImageAsset(el, ctxBase)
      return {
        id: el.id,
        name: el.name,
        parentId: el.parentId,
        imageRef: el.imageRef,
        exportFileName: resolved.exportFileName,
        inheritedFrom: resolved.inheritedFrom || null,
        expectedPaths: resolved.expectedPaths,
        resolved: resolved.file,
        resolveSource: resolved.source,
        exportsDirExists: fs.existsSync(exportsDir),
        exportFilesOnDisk: exportFiles.length,
      }
    })

  const orphanExports = findOrphanExportFiles(elements, fileData, exportFiles, assetMap)

  return {
    comment: 'MasterGo 预览用 ./data/exports/{fileName}；切图常绑父 FRAME（exportSettings.id≠子 IMAGE id）。',
    exportsDir,
    exportsDirExists: fs.existsSync(exportsDir),
    exportFilesOnDisk: exportFiles.length,
    exportSettingsCount: (fileData.exportSettings || []).length,
    embeddedBase64Count: embeddedBase64.length,
    embeddedBase64Note: embeddedBase64.length
      ? '仅为 viewer UI 图标，非设计图层 bitmap'
      : '无可用 base64 设计图',
    orphanExports,
    images,
  }
}

export function resolveAllMgAssets(elements, ctx) {
  const elementsById = ctx.elementsById || Object.fromEntries(elements.map((e) => [e.id, e]))
  const fullCtx = { ...ctx, elementsById }
  const assetMap = {}
  const catalog = []
  const assignedFiles = new Set()

  function apply(el, r) {
    catalog.push({ id: el.id, ...r })
    if (r.file) {
      const base = path.basename(r.file)
      assetMap[el.id] = base
      el.exportSlice = base
      el.assetSource = r.source
      el.renderAs = 'img'
      if (r.inheritedFrom) el.assetInheritedFrom = r.inheritedFrom.id
      assignedFiles.add(base)
    }
  }

  for (const el of elements) {
    if (el.type === 'image' && el.imageRef) {
      apply(el, resolveMgImageAsset(el, fullCtx))
    }
  }

  for (const el of elements) {
    if (assetMap[el.id]) continue
    if (shouldTryFrameExportSlice(el, fullCtx)) {
      apply(el, resolveMgExportSlice(el, { ...fullCtx, assignedFiles }))
      continue
    }
    if (el.renderAs === 'skip') continue
    if (el.type === 'pen' || shouldTryExportSlice(el, fullCtx)) {
      apply(el, resolveMgExportSlice(el, { ...fullCtx, assignedFiles }))
    }
  }

  for (const el of elements) {
    if (assetMap[el.id] || el.type !== 'pen') continue
    if (!styleGapsForElement(el).length) continue
    const orphan = tryBindOrphanExport(el, fullCtx, assignedFiles)
    if (orphan) apply(el, orphan)
  }

  return { assetMap, catalog }
}

/** 扫描 HTML/JS 中的 base64（MasterGo 包内通常只有 UI chrome，非设计图） */
export function scanEmbeddedBase64(sources) {
  const found = []
  for (const { label, text } of sources) {
    if (!text) continue
    let m
    B64_RE.lastIndex = 0
    while ((m = B64_RE.exec(text)) !== null) {
      const buf = Buffer.from(m[2], 'base64')
      if (buf.length < 128) continue
      found.push({ label, mime: m[1], bytes: buf.length, payloadPrefix: m[2].slice(0, 24) })
    }
  }
  return found
}