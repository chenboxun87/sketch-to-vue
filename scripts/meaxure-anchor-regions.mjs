/**
 * MeaXure 锚区工具库（A 轨道通用）
 * =====================================================================
 * 从 Sketch MeaXure index.html 解析图层，并按「规则文件」自动推算
 * 大屏/驾驶舱页面的动态区域边界（cockpitAnchors / anchorRegions）。
 *
 * 工具函数（可单独 import）：
 *   extractLetDataJson(html)       → JSON 字符串（括号深度算法）
 *   loadMeaXureData(filePath)      → parse 后的 MeaXure data 根对象
 *   flattenTextAndSlices(layers, ox, oy, out) → 深度优先扁平化，累加父坐标
 *   unionRects(rects)              → 最小包围盒 {left,top,width,height}
 *   computeAnchorRegionsFromMeasure(meaData, rulesDoc) → {artboard, regions}
 *
 * 核心工作流（大屏项目）：
 *   1. 人工写 anchorMeasureRules.json（一次性，描述"哪些文字/切片围起来是某区域"）
 *   2. 每次设计稿更新时运行本脚本 → 自动重算 anchorRegions.json
 *   3. Vue 组件按 anchorRegions.json 定位各动态子组件
 *
 * 规则文件 anchorMeasureRules.json 格式（每个 region 一条规则）：
 * {
 *   "regions": {
 *     "leftPanel": {
 *       "unionTextKeywordAny": ["指标A", "分项"],  // text 层包含这些关键词之一
 *       "excludeTextKeywordAny": ["标题"],         // 排除含这些词的 text
 *       "textYMin": 200, "textYMax": 900,          // Y 范围过滤
 *       "textXMin": 0,   "textXMax": 1600,         // X 范围过滤
 *       "unionSliceFileSuffixAny": [".png"],       // slice 文件名后缀匹配
 *       "fixedRect": { "left": 0, "top": 200, "width": 1400, "height": 700 }, // 或强制覆盖
 *       "padding": { "left": 8, "top": 8, "right": 8, "bottom": 8 },          // 扩边
 *       "minWidth": 100, "minHeight": 100          // 最小尺寸保护
 *     }
 *   }
 * }
 *
 * 用法（CLI）：
 *   node meaxure-anchor-regions.mjs \
 *     --html  "<design-export>/index.html" \
 *     --rules "src/pages/xxx/anchorMeasureRules.json" \
 *     --out   "src/pages/xxx/anchorRegions.json"
 *   node meaxure-anchor-regions.mjs --self-test
 * =====================================================================
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// ── MeaXure HTML 解析 ──────────────────────────────────────────────────────

/**
 * 从 MeaXure index.html 中提取 `let data = {...}` 的 JSON 字符串。
 * 使用括号深度计数，兼容 JSON 值中有 { } 的情形。
 */
export function extractLetDataJson(html) {
  const marker = 'let data = '
  const i = html.indexOf(marker)
  if (i < 0) throw new Error('MeaXure: "let data = " not found')
  const start = html.indexOf('{', i)
  let depth = 0
  for (let j = start; j < html.length; j++) {
    const c = html[j]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return html.slice(start, j + 1)
    }
  }
  throw new Error('MeaXure: unclosed JSON object')
}

/** 从磁盘读取 MeaXure index.html 并解析为 data 对象。 */
export function loadMeaXureData(filePath) {
  const html = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(extractLetDataJson(html))
}

/**
 * 深度优先遍历，累加父级坐标偏移，收集 text 与 slice 绝对坐标。
 * MeaXure group 只做嵌套容器，不自身渲染，需要递归才能拿到真实子图层。
 *
 * @param {unknown[]} layers    artboard.layers（或 group.layers）
 * @param {number}    ox        父级累计 x 偏移
 * @param {number}    oy        父级累计 y 偏移
 * @param {{ kind: string, name: string, x: number, y: number, w: number, h: number, text?: string, file?: string }[]} out
 */
export function flattenTextAndSlices(layers, ox, oy, out) {
  if (!Array.isArray(layers)) return
  for (const layer of layers) {
    if (layer.visible === false) continue
    const r = layer.rect || {}
    const x = (r.x || 0) + ox
    const y = (r.y || 0) + oy
    const w = r.width || 0
    const h = r.height || 0
    const name = layer.name || ''

    if (layer.type === 'group' && Array.isArray(layer.layers)) {
      flattenTextAndSlices(layer.layers, x, y, out)  // 递归，累加偏移
      continue
    }
    if (layer.type === 'slice' && layer.exportable && layer.exportable[0]) {
      out.push({ kind: 'slice', name, x, y, w, h, file: layer.exportable[0].path })
      continue
    }
    if (layer.type === 'text' && layer.content != null) {
      out.push({ kind: 'text', name, x, y, w, h, text: String(layer.content) })
    }
  }
}

/**
 * 计算一组 rect 的最小包围盒。
 * 输入：{ x, y, w, h }[]（x/y 是左上角绝对坐标）
 * 输出：{ left, top, width, height } 或 null（空数组）
 */
export function unionRects(rects) {
  if (!rects || !rects.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rects) {
    const x = r.x != null ? r.x : (r.left || 0)
    const y = r.y != null ? r.y : (r.top  || 0)
    const w = r.w != null ? r.w : (r.width  || 0)
    const h = r.h != null ? r.h : (r.height || 0)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + w)
    maxY = Math.max(maxY, y + h)
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY }
}

// ── 规则驱动的锚区计算 ─────────────────────────────────────────────────────

/**
 * 按单条 rule 在扁平图层列表中匹配元素，返回包围盒（含 padding / minSize）。
 * rule 字段均可选，组合使用（text 匹配 + slice 匹配 + fixedRect 兜底，取 union）。
 */
function rectForRule(flat, rule) {
  const rects = []
  const yMin = Number(rule.textYMin), yMax = Number(rule.textYMax)
  const xMin = Number(rule.textXMin), xMax = Number(rule.textXMax)
  const kwAny     = rule.unionTextKeywordAny     // string[]
  const kwExclude = rule.excludeTextKeywordAny   // string[]

  // text 图层关键词匹配
  if (Array.isArray(kwAny) && kwAny.length) {
    for (const L of flat) {
      if (L.kind !== 'text' || !L.text) continue
      if (Number.isFinite(yMin) && L.y < yMin) continue
      if (Number.isFinite(yMax) && L.y > yMax) continue
      if (Number.isFinite(xMin) && L.x < xMin) continue
      if (Number.isFinite(xMax) && L.x > xMax) continue
      const t = L.text.replace(/\s+/g, ' ')
      if (Array.isArray(kwExclude) && kwExclude.some(k => t.includes(k))) continue
      if (kwAny.some(k => t.includes(k))) rects.push({ x: L.x, y: L.y, w: L.w, h: L.h })
    }
  }

  // slice 图层文件名后缀匹配
  const syMin = Number(rule.sliceYMin), syMax = Number(rule.sliceYMax)
  const sxMin = Number(rule.sliceXMin), sxMax = Number(rule.sliceXMax)
  const sliceSuffix = rule.unionSliceFileSuffixAny  // string[]
  if (Array.isArray(sliceSuffix) && sliceSuffix.length) {
    for (const L of flat) {
      if (L.kind !== 'slice' || !L.file) continue
      if (Number.isFinite(syMin) && L.y < syMin) continue
      if (Number.isFinite(syMax) && L.y > syMax) continue
      if (Number.isFinite(sxMin) && L.x < sxMin) continue
      if (Number.isFinite(sxMax) && L.x > sxMax) continue
      if (sliceSuffix.some(s => L.file.endsWith(s) || L.file.includes(s)))
        rects.push({ x: L.x, y: L.y, w: L.w, h: L.h })
    }
  }

  let box = unionRects(rects)

  // fixedRect 兜底（或与已有 box 取 union）
  const fixed = rule.fixedRect
  if (fixed && typeof fixed.left === 'number') {
    const fr = { x: fixed.left, y: fixed.top, w: fixed.width, h: fixed.height }
    if (!box) box = { left: fr.x, top: fr.y, width: fr.w, height: fr.h }
    else {
      const u = unionRects([
        { x: box.left, y: box.top, w: box.width, h: box.height }, fr,
      ])
      if (u) box = u
    }
  }

  if (!box) return null

  // padding 扩边
  const pad = rule.padding
  let pl = 0, pt = 0, pr = 0, pb = 0
  if (typeof pad === 'number') { pl = pt = pr = pb = pad }
  else if (pad && typeof pad === 'object') {
    pl = Number(pad.left) || 0; pt = Number(pad.top)    || 0
    pr = Number(pad.right) || 0; pb = Number(pad.bottom) || 0
  }
  let { left, top, width, height } = box
  left -= pl; top -= pt; width += pl + pr; height += pt + pb

  // 最小尺寸保护
  if (Number.isFinite(Number(rule.minWidth))  && width  < Number(rule.minWidth))  width  = Number(rule.minWidth)
  if (Number.isFinite(Number(rule.minHeight)) && height < Number(rule.minHeight)) height = Number(rule.minHeight)

  const rnd = n => Math.round(n * 100) / 100
  return { left: rnd(left), top: rnd(top), width: rnd(width), height: rnd(height) }
}

/**
 * 从 MeaXure data 对象 + 规则文件对象，计算所有锚区。
 * 若某 region 的规则匹配不到任何图层 → 抛出错误，帮助发现规则配置问题。
 *
 * @returns {{ version: 1, artboard: {width,height}, regions: Record<string,{left,top,width,height}> }}
 */
export function computeAnchorRegionsFromMeasure(meaData, rulesDoc) {
  const board = meaData.artboards && meaData.artboards[0]
  if (!board) throw new Error('MeaXure: no artboards[0]')

  const flat = []
  flattenTextAndSlices(board.layers || [], 0, 0, flat)

  const artboard = { width: board.width || 1920, height: board.height || 1080 }
  const regions  = {}

  for (const [key, rule] of Object.entries(rulesDoc.regions || {})) {
    const r = rectForRule(flat, rule)
    if (!r) throw new Error(
      `Region "${key}": 无匹配图层 / 空 union。请检查 anchorMeasureRules.json 的关键词/范围设置`
    )
    regions[key] = r
  }

  return { version: 1, artboard, regions }
}

// ── CLI ───────────────────────────────────────────────────────────────────

function selfTest() {
  let pass = 0, fail = 0
  const eq = (got, want, label) => {
    const ok = JSON.stringify(got) === JSON.stringify(want)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
    ok ? pass++ : fail++
    if (!ok) console.log(`   got=${JSON.stringify(got)}  want=${JSON.stringify(want)}`)
  }

  // extractLetDataJson
  const html = `<script>let data = {"a":{"b":1},"c":2};</script>`
  eq(extractLetDataJson(html), '{"a":{"b":1},"c":2}', 'extractLetDataJson 括号深度')

  // flattenTextAndSlices - group 递归
  const layers = [
    { type: 'group', name: 'g', rect: { x: 10, y: 10, width: 100, height: 100 }, layers: [
      { type: 'text', name: 't', rect: { x: 5, y: 5, width: 50, height: 20 }, content: '指标A' },
    ]},
    { type: 'slice', name: 's', rect: { x: 20, y: 20, width: 30, height: 30 }, exportable: [{ path: 'a.png' }] },
    { visible: false, type: 'text', name: 'hidden', rect: { x: 0, y: 0, width: 10, height: 10 }, content: 'x' },
  ]
  const out = []
  flattenTextAndSlices(layers, 0, 0, out)
  eq(out.length, 2, 'flattenTextAndSlices: group 递归 + 隐藏层过滤 = 2个')
  eq(out[0], { kind: 'text', name: 't', x: 15, y: 15, w: 50, h: 20, text: '指标A' }, 'text 坐标累加父偏移')
  eq(out[1].kind, 'slice', 'slice 直接收集')

  // unionRects
  eq(unionRects([]), null, 'unionRects 空=null')
  // rect1: right=40, bottom=60 | rect2: right=35, bottom=60 → union: left=10,top=10,w=30,h=50
  eq(unionRects([{ x: 10, y: 20, w: 30, h: 40 }, { x: 15, y: 10, w: 20, h: 50 }]),
    { left: 10, top: 10, width: 30, height: 50 }, 'unionRects 两个 rect')

  // computeAnchorRegionsFromMeasure
  const meaData = {
    artboards: [{
      width: 1920, height: 1080,
      layers: [
        { type: 'text', name: 'title', rect: { x: 100, y: 50, width: 200, height: 40 }, content: '数据分析' },
        { type: 'slice', name: 'bg', rect: { x: 0, y: 0, width: 600, height: 400 }, exportable: [{ path: 'bg.png' }] },
      ],
    }],
  }
  const rules = {
    regions: {
      titleArea: { unionTextKeywordAny: ['数据'], padding: { left: 10, top: 10, right: 10, bottom: 10 } },
      fullBg:    { fixedRect: { left: 0, top: 0, width: 600, height: 400 } },
    },
  }
  const result = computeAnchorRegionsFromMeasure(meaData, rules)
  eq(result.artboard, { width: 1920, height: 1080 }, 'artboard 正确')
  eq(result.regions.titleArea, { left: 90, top: 40, width: 220, height: 60 }, 'titleArea 含 padding')
  eq(result.regions.fullBg,    { left: 0,  top: 0,  width: 600, height: 400 }, 'fullBg fixedRect')

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) { selfTest(); return }

  const get = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
  const htmlPath  = get('--html')
  const rulesPath = get('--rules')
  const outPath   = get('--out')
  const dryRun    = args.includes('--dry-run')

  if (!htmlPath || !rulesPath) {
    console.error([
      '用法:',
      '  node meaxure-anchor-regions.mjs \\',
      '    --html  <MeaXure index.html 路径> \\',
      '    --rules <anchorMeasureRules.json 路径> \\',
      '    --out   <输出 anchorRegions.json 路径>',
      '  node meaxure-anchor-regions.mjs --self-test',
    ].join('\n'))
    process.exit(2)
  }

  const meaData  = loadMeaXureData(htmlPath)
  const rulesDoc = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))
  const result   = computeAnchorRegionsFromMeasure(meaData, rulesDoc)

  const json = JSON.stringify(result, null, 2) + '\n'
  if (dryRun) {
    console.log(json)
    console.error('(dry-run，未写入文件)')
    return
  }

  const dest = outPath || path.join(path.dirname(rulesPath), 'anchorRegions.json')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, json, 'utf8')
  console.error(`written ${dest}`)
  console.error(`  artboard: ${result.artboard.width}×${result.artboard.height}  regions: ${Object.keys(result.regions).join(', ')}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)
if (isMain) main()
