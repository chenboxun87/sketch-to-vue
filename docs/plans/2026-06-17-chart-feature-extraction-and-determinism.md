# 图表特征提取 + 确定性渲染管线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 design-to-vue 中"靠模型临场推断"的高方差环节（图表类型/配色/数据、退化路径、黑白底切片、多画板合并）前移为确定性脚本产出 + 模板消费，让低阶模型也能稳定达到高阶还原效果，同时不限制高阶模型。

**Architecture:** 在现有 A 轨道提取管线上增量扩展：① 新增 `extract-chart-features.mjs` 产出 `_chart_zones.json`；② 在 `extract-all-elements.mjs` 的 `buildRenderGapsReport` 内追加退化描边路径 + 黑白底 blend 检测；③ 新增 `merge-artboards.mjs` + 多画板检测；④ 新增 `templates/echarts/` 模板库与 `templates/shared/colorParse.mjs` 通用层；⑤ 强化 `_consume_audit.json`；⑥ 文档闸门 + 回归夹具。脚本是"质量地板"，闸门只校验结果不限实现。

**Tech Stack:** Node ESM (`.mjs`)、已内置 `pngjs`、项目侧 echarts 5.x、node 自写 assert 测试脚本（沿用 `test-text-style.mjs` 模式）。

**约定：**
- 所有路径基于 skill 根 `~/.claude\skills\design-to-vue\`（下文用 `skill/` 前缀）。
- 测试运行：`node skill/scripts/<test>.mjs`，失败 `process.exit(1)`。
- 每个任务完成后 commit（skill 仓库自身的 git；若 skill 目录非 git 仓库则跳过 commit 步骤，改为在任务末尾运行 `sync/verify-sync.ps1` 前的暂存）。
- 完成全部任务后统一执行 Task 12 同步到 Cursor 副本。

---

## Task 1: 健壮颜色解析器（共享通用层）

**Files:**
- Create: `skill/templates/shared/colorParse.mjs`
- Test: `skill/scripts/test-color-parse.mjs`

修复踩坑 #5：`borders[].color` 跨画板形态不一致（字符串 / `{rgb:{r,g,b}}` 对象 / 带 `%` 尾缀）。

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-color-parse.mjs
import { parseColor } from '../templates/shared/colorParse.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

assert(parseColor('#2C5EE0') === '#2C5EE0', 'hex passthrough')
assert(parseColor('rgba(44,94,224,1)') === 'rgba(44,94,224,1)', 'rgba passthrough')
assert(parseColor('#7AF4FF 100%') === '#7AF4FF', 'strip percent suffix')
assert(parseColor({ rgb: { r: 44, g: 94, b: 224 } }) === 'rgba(44,94,224,1)', 'rgb object')
assert(parseColor({ rgb: { r: 44, g: 94, b: 224 }, alpha: 0.5 }) === 'rgba(44,94,224,0.5)', 'rgb object alpha')
assert(parseColor({ r: 0.2, g: 0.4, b: 0.8, a: 1 }).startsWith('rgba('), 'normalized 0-1 rgba')
assert(parseColor(null) === null, 'null safe')
assert(parseColor(undefined) === null, 'undefined safe')
assert(parseColor('') === null, 'empty safe')

if (failed) process.exit(1)
console.log('All colorParse tests passed')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node skill/scripts/test-color-parse.mjs`
Expected: FAIL（模块不存在 / parseColor undefined）

- [ ] **Step 3: 写实现**

```js
// skill/templates/shared/colorParse.mjs
// 统一颜色解析：兼容 MeaXure / MasterGo 多种颜色形态，输出 CSS 颜色字符串或 null。

function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))) }

/**
 * @param {string|Object|null} c
 *   - "#RRGGBB" / "rgba(...)" / "#hex 100%"（带百分号尾缀）
 *   - { rgb: { r, g, b }, alpha? }   （MeaXure artboard 结构化，r/g/b 为 0-255）
 *   - { r, g, b, a? }                （MasterGo，r/g/b 为 0-1）
 * @returns {string|null} CSS 颜色 或 null
 */
export function parseColor(c) {
  if (c == null) return null
  if (typeof c === 'string') {
    const s = c.trim()
    if (!s) return null
    // 去掉 "#7AF4FF 100%" 这类尾缀百分比
    const m = s.match(/^(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))\s*\d*\.?\d*%?$/)
    if (m) return m[1]
    return s
  }
  if (typeof c === 'object') {
    // { rgb: { r,g,b }, alpha? }，r/g/b 0-255
    if (c.rgb && typeof c.rgb.r === 'number') {
      const { r, g, b } = c.rgb
      const a = c.alpha != null ? c.alpha : (c.rgb.a != null ? c.rgb.a : 1)
      return `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${a})`
    }
    // { r,g,b,a }，r/g/b 0-1
    if (typeof c.r === 'number') {
      const a = c.a != null ? c.a : 1
      return `rgba(${clamp255(c.r * 255)},${clamp255(c.g * 255)},${clamp255(c.b * 255)},${a})`
    }
  }
  return null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node skill/scripts/test-color-parse.mjs`
Expected: PASS（All colorParse tests passed）

- [ ] **Step 5: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add templates/shared/colorParse.mjs scripts/test-color-parse.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): 健壮颜色解析器 colorParse（兼容跨画板 color 形态）"
```

---

## Task 2: 退化描边路径检测

**Files:**
- Create: `skill/templates/shared/vectorGuards.mjs`
- Test: `skill/scripts/test-vector-guards.mjs`
- Modify: `skill/scripts/extract-all-elements.mjs`（`buildRenderGapsReport` 内追加 `degenerateBorderPaths`）

修复踩坑 #2：`border:Npx solid` 套小盒子 → 实心大色块。

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-vector-guards.mjs
import { isDegenerateBorderPath } from '../templates/shared/vectorGuards.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// border 90px 套 5x1 盒子 → 退化
assert(isDegenerateBorderPath(['border: 90px solid #2C5EE0;'], { x: 0, y: 0, w: 5, h: 1 }) === true, '90px on 5x1 degenerate')
// border 134px 套 210x31 → 退化（134*2 > 31）
assert(isDegenerateBorderPath(['opacity: 0.4;', 'border: 134px solid #2C5EE0;'], { w: 210, h: 31 }) === true, '134px on 210x31 degenerate')
// 1px 细线 → 正常保留
assert(isDegenerateBorderPath(['border: 1px solid #32C5FF;'], { w: 1, h: 103 }) === false, '1px line kept')
// 2px → 正常保留
assert(isDegenerateBorderPath(['border: 2px solid #fff;'], { w: 2, h: 80 }) === false, '2px line kept')
// 大盒子正常 border → 保留
assert(isDegenerateBorderPath(['border: 4px solid #fff;'], { w: 300, h: 200 }) === false, 'normal border on big box kept')
// 无 border → false
assert(isDegenerateBorderPath(['background: #fff;'], { w: 5, h: 1 }) === false, 'no border false')
// border-radius 不误判
assert(isDegenerateBorderPath(['border-radius: 24px;'], { w: 5, h: 1 }) === false, 'border-radius not matched')

if (failed) process.exit(1)
console.log('All vectorGuards tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-vector-guards.mjs`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```js
// skill/templates/shared/vectorGuards.mjs
// 矢量层退化/伪装判定（A 轨道 MeaXure 渲染缺口）

/**
 * 退化描边路径：MeaXure 用 `border:Npx solid` 表示 Sketch 描边路径，
 * 当 border 厚度 ≫ 自身 rect 尺寸时，CSS 渲染成远超原位的实心大色块。
 * 保留 ≤2px 的正常细线/描边。
 * @param {string[]} cssArr layer.source.css
 * @param {{w:number,h:number}} rect
 * @returns {boolean} true=应跳过渲染
 */
export function isDegenerateBorderPath(cssArr, rect) {
  if (!rect) return false
  const arr = cssArr || []
  const borderCss = arr.find((c) => /^border\s*:\s*\d/i.test(c) && !/border-radius/i.test(c))
  if (!borderCss) return false
  const m = borderCss.match(/border\s*:\s*(\d+)px/i)
  if (!m) return false
  const borderW = parseInt(m[1], 10)
  if (borderW <= 2) return false
  const w = rect.w || 0
  const h = rect.h || 0
  return (borderW * 2 > w || borderW * 2 > h) && (w < 60 || h < 60)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node skill/scripts/test-vector-guards.mjs`
Expected: PASS

- [ ] **Step 5: 接入 extract-all-elements.mjs**

在 `buildRenderGapsReport(shift)`（约 line 445）顶部 import 后增加退化路径收集，并加入返回对象。先在文件顶部 import 区加：

```js
import { isDegenerateBorderPath } from '../templates/shared/vectorGuards.mjs';
```

在 `buildRenderGapsReport` 内、`return {` 之前插入：

```js
  const degenerateBorderPaths = [];
  for (const e of allElements) {
    const css = (e.source && e.source.css) || e.css || [];
    if (e.rect && isDegenerateBorderPath(css, e.rect)) {
      degenerateBorderPaths.push({ id: e.id, name: e.name, rect: e.rect });
    }
  }
```

把 `degenerateBorderPaths` 加入 return 对象与 summary：

```js
    degenerateBorderPaths,
    // ...existing fields...
    summary: {
      iconGapCandidates: iconGapCandidates.length,
      duplicateTextGroups: duplicateTextGroups.length,
      fakeBarShapes: fakeBars.length,
      degenerateBorderPaths: degenerateBorderPaths.length,
    },
```

> 注：`allElements` 为该函数可见的全量元素数组；若变量名不同，按文件实际命名替换（读 line 445–505 确认）。

- [ ] **Step 6: 验证产出字段**

Run（用现成夹具数据，见 Task 11 前可临时用任一 MeaXure index.html）：
`node skill/scripts/extract-all-elements.mjs <index.html> <assetsDir> <tmpOut> 0`
Expected: `<tmpOut>/_render_gaps_report.json` 含 `degenerateBorderPaths` 数组与 `summary.degenerateBorderPaths` 计数。

- [ ] **Step 7: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add templates/shared/vectorGuards.mjs scripts/test-vector-guards.mjs scripts/extract-all-elements.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): _render_gaps_report 追加退化描边路径检测"
```

---

## Task 3: 黑底/白底切片 blend 检测

**Files:**
- Create: `skill/scripts/detect-slice-blend.mjs`
- Test: `skill/scripts/test-slice-blend.mjs`（含生成临时 PNG 夹具）
- Modify: `skill/scripts/extract-all-elements.mjs`（产出 `blendHints` 进 `_render_gaps_report.json`）

修复踩坑 #3/#4：`编组.png` 黑底→screen，`雷达图.jpg` 白底→multiply。

- [ ] **Step 1: 写失败测试（含临时 PNG 生成）**

```js
// skill/scripts/test-slice-blend.mjs
import fs from 'fs'
import path from 'path'
import os from 'os'
import { PNG } from 'pngjs'
import { classifyBlend } from './detect-slice-blend.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blend-'))
function writePng(name, fill) {
  const png = new PNG({ width: 20, height: 20 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill.r; png.data[i + 1] = fill.g; png.data[i + 2] = fill.b; png.data[i + 3] = fill.a
  }
  const p = path.join(tmp, name)
  fs.writeFileSync(p, PNG.sync.write(png))
  return p
}

const black = writePng('black.png', { r: 5, g: 5, b: 8, a: 255 })
const white = writePng('white.png', { r: 252, g: 252, b: 255, a: 255 })
const trans = writePng('trans.png', { r: 0, g: 0, b: 0, a: 0 })
const color = writePng('color.png', { r: 30, g: 120, b: 200, a: 255 })

assert(classifyBlend(black) === 'screen', 'black bg → screen')
assert(classifyBlend(white) === 'multiply', 'white bg → multiply')
assert(classifyBlend(trans) === null, 'transparent → null')
assert(classifyBlend(color) === null, 'colored → null')

if (failed) process.exit(1)
console.log('All slice-blend tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-slice-blend.mjs`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```js
// skill/scripts/detect-slice-blend.mjs
// 采样切片四角+中心像素，判定黑底/白底，给出 mix-blend-mode 提示。
// 注：这是让真实切片正确显示（黑底透出背景 / 白底消融），非 CSS 模拟视觉（不违反禁令 #18）。
import fs from 'fs'
import { PNG } from 'pngjs'

function sampleAt(png, x, y) {
  const idx = (png.width * y + x) << 2
  return { r: png.data[idx], g: png.data[idx + 1], b: png.data[idx + 2], a: png.data[idx + 3] }
}

/**
 * @param {string} pngPath
 * @returns {'screen'|'multiply'|null}
 */
export function classifyBlend(pngPath) {
  let png
  try {
    png = PNG.sync.read(fs.readFileSync(pngPath))
  } catch {
    return null
  }
  const w = png.width, h = png.height
  if (w < 3 || h < 3) return null
  const pts = [
    sampleAt(png, 1, 1), sampleAt(png, w - 2, 1),
    sampleAt(png, 1, h - 2), sampleAt(png, w - 2, h - 2),
  ]
  // 任一角透明 → 切片本身已有 alpha，无需 blend
  if (pts.some((p) => p.a < 250)) return null
  const allBlack = pts.every((p) => p.r < 16 && p.g < 16 && p.b < 16)
  if (allBlack) return 'screen'
  const allWhite = pts.every((p) => p.r > 244 && p.g > 244 && p.b > 244)
  if (allWhite) return 'multiply'
  return null
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node skill/scripts/test-slice-blend.mjs`
Expected: PASS

- [ ] **Step 5: 接入 extract-all-elements.mjs**

在 import 区加：

```js
import { classifyBlend } from './detect-slice-blend.mjs';
```

在 `buildRenderGapsReport` 内收集（仅对 slice-file 类型、文件存在的）：

```js
  const blendHints = [];
  for (const e of allElements) {
    const src = e.source || {};
    if (src.kind !== 'slice-file') continue;
    const file = src.file || src.path || '';
    if (!file || !fs.existsSync(file)) continue;
    const blend = classifyBlend(file);
    if (blend) blendHints.push({ id: e.id, name: e.name, blendMode: blend });
  }
```

加入 return 与 summary：

```js
    blendHints,
    summary: {
      // ...existing...
      blendHints: blendHints.length,
    },
```

- [ ] **Step 6: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/detect-slice-blend.mjs scripts/test-slice-blend.mjs scripts/extract-all-elements.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): 黑底/白底切片 blend 检测进 _render_gaps_report"
```

---

## Task 4: 多画板覆盖检测 + 合并

**Files:**
- Create: `skill/scripts/merge-artboards.mjs`
- Create: `skill/scripts/detect-artboard-merge.mjs`
- Test: `skill/scripts/test-artboard-merge.mjs`

修复踩坑 #1：设计拆到多 artboard，需互补合并。

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-artboard-merge.mjs
import { planArtboardMerge } from './detect-artboard-merge.mjs'
import { mergeLayerStacks } from './merge-artboards.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 互补：board0 仅左右面板（中心空），board1 仅中心大背景
const cov = [
  { index: 0, coverage: 0.55, centerCoverage: 0.10, hasFullBg: false },
  { index: 1, coverage: 0.60, centerCoverage: 0.95, hasFullBg: true },
]
const plan = planArtboardMerge(cov)
assert(plan.multiArtboard === true, 'multiArtboard true')
assert(plan.strategy === 'complementary-merge', 'complementary strategy')
assert(plan.base === 1, 'base = full-bg board')
assert(plan.overlays[0].from === 0, 'overlay from panel board')

// 单画板完整 → 不合并
const single = planArtboardMerge([{ index: 0, coverage: 0.98, centerCoverage: 0.97, hasFullBg: true }])
assert(single.multiArtboard === false, 'single artboard no merge')

// 合并 layer_stack：overlay 层加 zOffset
const base = [{ id: 'b1', z: 0, zIndex: 0, rect: { x: 0, y: 0, w: 100, h: 100 } }]
const ov = [{ id: 'p1', z: 5, zIndex: 5, rect: { x: 0, y: 0, w: 50, h: 50 } }]
const merged = mergeLayerStacks(base, [{ layers: ov, zOffset: 2000 }])
assert(merged.length === 2, 'merged length')
assert(merged.find((l) => l.id === 'p1').zIndex === 2005, 'overlay zOffset applied')

if (failed) process.exit(1)
console.log('All artboard-merge tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-artboard-merge.mjs`
Expected: FAIL

- [ ] **Step 3: 写 detect-artboard-merge.mjs**

```js
// skill/scripts/detect-artboard-merge.mjs
// 多画板覆盖检测：识别"互补拆分"（一板有背景、一板有面板）。

/**
 * @param {Array<{index,coverage,centerCoverage,hasFullBg}>} coverages
 * @returns {Object} _artboard_merge_plan.json 内容
 */
export function planArtboardMerge(coverages) {
  if (!Array.isArray(coverages) || coverages.length <= 1) {
    return { multiArtboard: false, strategy: 'single', base: coverages?.[0]?.index ?? 0, overlays: [] }
  }
  // 找背景最全的板为底
  const base = [...coverages].sort((a, b) => (b.centerCoverage || 0) - (a.centerCoverage || 0))[0]
  // 其余板若中心覆盖低（缺背景）但整体有内容 → 作为面板 overlay
  const overlays = coverages
    .filter((c) => c.index !== base.index && (c.centerCoverage || 0) < (base.centerCoverage || 0) - 0.3)
    .map((c) => ({ from: c.index, filter: 'panels', zOffset: 2000 }))
  if (overlays.length === 0) {
    return { multiArtboard: true, strategy: 'pick-best', base: base.index, overlays: [] }
  }
  return {
    multiArtboard: true,
    strategy: 'complementary-merge',
    base: base.index,
    overlays,
    reason: `artboard${base.index} 中心背景最全；其余板缺中心背景但含面板内容`,
  }
}
```

- [ ] **Step 4: 写 merge-artboards.mjs**

```js
// skill/scripts/merge-artboards.mjs
// 按 merge plan 合并多画板 layer_stack 与 all_elements。
import fs from 'fs'
import path from 'path'

/**
 * @param {Array} baseLayers
 * @param {Array<{layers:Array, zOffset:number, filterFn?:Function}>} overlays
 * @returns {Array} 合并后的 layer 数组
 */
export function mergeLayerStacks(baseLayers, overlays) {
  const out = [...baseLayers]
  for (const ov of overlays) {
    const layers = (ov.layers || []).filter(ov.filterFn || (() => true))
    for (const l of layers) {
      const base = l.z || l.zIndex || 0
      out.push({ ...l, z: ov.zOffset + base, zIndex: ov.zOffset + base })
    }
  }
  return out
}

/**
 * 合并 all_elements，按 id 去重（base 优先）
 */
export function mergeElements(baseEls, overlayEls) {
  const ids = new Set(baseEls.map((e) => e.id))
  const extra = overlayEls.filter((e) => !ids.has(e.id))
  return [...baseEls, ...extra]
}

// CLI: node merge-artboards.mjs <dataDir> （dataDir 含 artboard0/ artboard1/ 与 _artboard_merge_plan.json）
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const dataDir = process.argv[2]
  if (!dataDir) { console.error('usage: merge-artboards.mjs <dataDir>'); process.exit(1) }
  const plan = JSON.parse(fs.readFileSync(path.join(dataDir, '_artboard_merge_plan.json'), 'utf8'))
  const readBoard = (i, f) => JSON.parse(fs.readFileSync(path.join(dataDir, `artboard${i}`, f), 'utf8'))
  const baseStackRaw = readBoard(plan.base, '_layer_stack.json')
  const baseStack = Array.isArray(baseStackRaw) ? baseStackRaw : (baseStackRaw.layers || [])
  const LEFT_MAX = 1600, RIGHT_MIN = 4700
  const overlays = plan.overlays.map((o) => {
    const raw = readBoard(o.from, '_layer_stack.json')
    const layers = Array.isArray(raw) ? raw : (raw.layers || [])
    return {
      layers,
      zOffset: o.zOffset,
      filterFn: (it) => {
        const cx = (it.rect.x || 0) + (it.rect.w || 0) / 2
        return o.filter === 'panels' ? (cx < LEFT_MAX || cx > RIGHT_MIN) : true
      },
    }
  })
  const mergedStack = mergeLayerStacks(baseStack, overlays)
  fs.writeFileSync(path.join(dataDir, '_layer_stack.json'), JSON.stringify(mergedStack, null, 2))

  const baseElDoc = readBoard(plan.base, '_all_elements.json')
  let mergedEls = baseElDoc.elements || []
  for (const o of plan.overlays) {
    const ovDoc = readBoard(o.from, '_all_elements.json')
    mergedEls = mergeElements(mergedEls, ovDoc.elements || [])
  }
  fs.writeFileSync(path.join(dataDir, '_all_elements.json'), JSON.stringify({ ...baseElDoc, elements: mergedEls }, null, 2))
  console.log('merged: layers', mergedStack.length, 'elements', mergedEls.length)
}
```

- [ ] **Step 5: 运行确认通过**

Run: `node skill/scripts/test-artboard-merge.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/detect-artboard-merge.mjs scripts/merge-artboards.mjs scripts/test-artboard-merge.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): 多画板互补合并检测 + merge-artboards 通用脚本"
```

---

## Task 5: 图表区检测 — 标题锚定 + 类型推断

**Files:**
- Create: `skill/scripts/chart-features/detect-zones.mjs`
- Test: `skill/scripts/test-chart-zones.mjs`

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-chart-zones.mjs
import { detectChartZones, inferChartType } from './chart-features/detect-zones.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 类型推断：jpg 切片 → radar
assert(inferChartType({ slices: [{ ext: 'jpg' }], texts: ['电', '氢气', '热', '油', '气'], vectors: [] }) === 'radar', 'jpg+dims → radar')
// 等距小柱 → bar
assert(inferChartType({ slices: [], texts: ['2020', '2021'], vectors: Array.from({ length: 8 }, () => ({ w: 12, h: 60 })) }) === 'bar', 'small bars → bar')
// 多色描边路径簇 → sankey
assert(inferChartType({ slices: [], texts: ['供电', '供热', '区域C'], vectors: Array.from({ length: 10 }, (_, i) => ({ w: 6, h: 1, borderPx: 90 })) }) === 'sankey', 'border paths → sankey')

// zone 检测：标题锚定
const els = [
  { type: 'text', content: '趋势分析', rect: { x: 181, y: 184, w: 148, h: 44 } },
  { type: 'text', content: '2020年', rect: { x: 214, y: 528, w: 60, h: 24 } },
]
const zones = detectChartZones(els, { panelTitles: ['趋势分析'], panelWidth: 1263, panelLeft: 138 })
assert(zones.length === 1, 'one zone from title')
assert(zones[0].title === '趋势分析', 'zone title')
assert(zones[0].confidence === 'high', 'title anchored = high')

if (failed) process.exit(1)
console.log('All chart-zones tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-chart-zones.mjs`
Expected: FAIL

- [ ] **Step 3: 写实现**

```js
// skill/scripts/chart-features/detect-zones.mjs
// 图表区检测：section 标题锚定（high）+ 假柱聚类兜底（low）+ 类型推断。

const TITLE_HEIGHT = 44
const ZONE_DEFAULT_H = 312

/**
 * 类型推断（确定性签名）。
 * @param {{slices:Array, texts:string[], vectors:Array}} sig
 * @returns {'radar'|'sankey'|'area'|'line'|'groupBar'|'bar'|'pie'|null}
 */
export function inferChartType(sig) {
  const slices = sig.slices || []
  const vectors = sig.vectors || []
  const texts = sig.texts || []
  // 雷达：面板内 jpg/png 多边形切片 + 维度文字
  if (slices.some((s) => /jpe?g|png/i.test(s.ext || '')) && texts.length >= 3 && texts.length <= 8) {
    return 'radar'
  }
  // 桑基：多个 border:Npx 描边路径
  const borderPaths = vectors.filter((v) => (v.borderPx || 0) > 5)
  if (borderPaths.length >= 6) return 'sankey'
  // 面积：底部大渐变 div
  if (vectors.some((v) => v.areaGradient)) return 'area'
  // 折线：折线点序列
  if (vectors.some((v) => v.polyline)) return 'line'
  // 柱：等距小柱
  const bars = vectors.filter((v) => v.w >= 4 && v.w <= 18 && v.h >= 30)
  if (bars.length >= 8) return 'groupBar'
  if (bars.length >= 4) return 'bar'
  return null
}

/**
 * 标题锚定图表区。
 * @param {Array} elements all_elements
 * @param {{panelTitles:string[], panelWidth:number, panelLeft:number}} opts
 * @returns {Array} zones（rect + title + confidence:'high'）
 */
export function detectChartZones(elements, opts) {
  const titles = opts.panelTitles || []
  const zones = []
  for (const t of titles) {
    const titleEl = elements.find(
      (e) => e.type === 'text' && (e.content || '').replace(/\s/g, '').includes(t.replace(/\s/g, ''))
    )
    if (!titleEl) continue
    zones.push({
      id: t,
      title: t,
      rect: {
        x: opts.panelLeft,
        y: titleEl.rect.y + TITLE_HEIGHT,
        w: opts.panelWidth,
        h: ZONE_DEFAULT_H,
      },
      confidence: 'high',
      needsConfirm: false,
    })
  }
  return zones
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node skill/scripts/test-chart-zones.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/chart-features/detect-zones.mjs scripts/test-chart-zones.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): 图表区标题锚定 + 类型推断"
```

---

## Task 6: 图表特征提取 — 轴/类目/图例/系列配色

**Files:**
- Create: `skill/scripts/chart-features/extract-features.mjs`
- Test: `skill/scripts/test-chart-extract-features.mjs`

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-chart-extract-features.mjs
import { extractAxis, extractCategories, extractLegend } from './chart-features/extract-features.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 轴刻度反推 max/interval
const yTicks = [
  { content: '0', rect: { x: 150, y: 520 } }, { content: '25', rect: { x: 150, y: 470 } },
  { content: '50', rect: { x: 150, y: 420 } }, { content: '150', rect: { x: 150, y: 240 } },
  { content: '万tce', rect: { x: 150, y: 220 } },
]
const axis = extractAxis(yTicks)
assert(axis.max === 150, 'axis max 150')
assert(axis.interval === 25, 'axis interval 25')
assert(axis.unit === '万tce', 'axis unit')

// 类目按 x 排序
const cats = extractCategories([
  { content: '2021年', rect: { x: 320, y: 528 } },
  { content: '2020年', rect: { x: 214, y: 528 } },
])
assert(cats[0] === '2020年' && cats[1] === '2021年', 'categories x-sorted')

// 图例：色块 + 邻近文字
const legend = extractLegend(
  [{ content: '指标总量', rect: { x: 200, y: 250, w: 120, h: 24 } }],
  [{ rect: { x: 180, y: 256, w: 12, h: 12 }, color: '#1DE4FF' }]
)
assert(legend[0].name === '指标总量' && legend[0].color === '#1DE4FF', 'legend name+color')

if (failed) process.exit(1)
console.log('All chart-extract-features tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-chart-extract-features.mjs`
Expected: FAIL

- [ ] **Step 3: 写实现**

```js
// skill/scripts/chart-features/extract-features.mjs
import { parseColor } from '../../templates/shared/colorParse.mjs'

const UNIT_RE = /^(万?t?ce|万?tCO|tco2|tCO₂|tce\/亿元|tco2\/亿元|tCO₂\/亿元|tco2e|tCO₂e|万tce|万tCO₂|%|次|tce\/万元)/i

/**
 * 从 Y 轴刻度 text 反推 max/interval/unit。
 * @param {Array<{content,rect}>} texts 区内（或轴附近）文字
 */
export function extractAxis(texts) {
  const nums = []
  let unit = null
  for (const t of texts) {
    const s = (t.content || '').trim()
    if (/^\d+(\.\d+)?$/.test(s)) nums.push({ v: parseFloat(s), y: t.rect.y })
    else if (UNIT_RE.test(s) && !unit) unit = s
  }
  if (nums.length < 2) return { max: null, interval: null, unit }
  const vals = [...new Set(nums.map((n) => n.v))].sort((a, b) => a - b)
  const max = vals[vals.length - 1]
  const diffs = []
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1])
  diffs.sort((a, b) => a - b)
  const interval = diffs[Math.floor(diffs.length / 2)] // 中位差
  return { max, interval, unit, ticks: vals }
}

/**
 * X 轴类目（按 x 排序，去重）。
 */
export function extractCategories(texts) {
  return texts
    .slice()
    .sort((a, b) => a.rect.x - b.rect.x)
    .map((t) => (t.content || '').trim())
    .filter(Boolean)
}

/**
 * 图例：色块（小矩形）与最近文字配对。
 * @param {Array<{content,rect}>} texts
 * @param {Array<{rect,color}>} swatches 小色块（带已解析或原始 color）
 */
export function extractLegend(texts, swatches) {
  const legend = []
  for (const sw of swatches) {
    const cx = sw.rect.x + sw.rect.w / 2
    const cy = sw.rect.y + sw.rect.h / 2
    let best = null, bestD = Infinity
    for (const t of texts) {
      const tx = t.rect.x
      const ty = t.rect.y + (t.rect.h || 0) / 2
      const d = Math.hypot(tx - cx, ty - cy)
      if (tx >= cx && Math.abs(ty - cy) < 30 && d < bestD) { best = t; bestD = d }
    }
    if (best) legend.push({ name: (best.content || '').trim(), color: parseColor(sw.color) })
  }
  return legend
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node skill/scripts/test-chart-extract-features.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/chart-features/extract-features.mjs scripts/test-chart-extract-features.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): 图表轴/类目/图例特征提取"
```

---

## Task 7: 几何数据反推（bar/line/area）

**Files:**
- Create: `skill/scripts/chart-features/derive-data.mjs`
- Test: `skill/scripts/test-derive-data.mjs`

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-derive-data.mjs
import { deriveBarData, deriveLineData } from './chart-features/derive-data.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// 柱高反推：baseline y=500, max=150 对应 100px 高
// 一根 h=100 的柱 → 值≈150；h=50 → 75
const bars = [
  { rect: { x: 200, y: 400, w: 12, h: 100 } },
  { rect: { x: 240, y: 450, w: 12, h: 50 } },
]
const d = deriveBarData(bars, { baselineY: 500, pxPerUnit: 100 / 150 })
assert(Math.round(d[0]) === 150, 'bar0 ≈ 150')
assert(Math.round(d[1]) === 75, 'bar1 ≈ 75')

// 折线点反推
const pts = [
  { x: 200, y: 400 }, { x: 300, y: 450 },
]
const ld = deriveLineData(pts, { baselineY: 500, pxPerUnit: 100 / 150 })
assert(Math.round(ld[0]) === 150 && Math.round(ld[1]) === 75, 'line points derived')

if (failed) process.exit(1)
console.log('All derive-data tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-derive-data.mjs`
Expected: FAIL

- [ ] **Step 3: 写实现**

```js
// skill/scripts/chart-features/derive-data.mjs
// 几何反推图表数据值（仅 bar/line/area，dataSource:"geom"）。
// 反推不可靠（雷达/桑基）时调用方应改用 mock，并标 dataSource:"mock"。

/**
 * 柱高 → 数值。value = barHeightPx / pxPerUnit
 * @param {Array<{rect}>} bars
 * @param {{baselineY:number, pxPerUnit:number}} cal  pxPerUnit = 轴像素跨度 / 轴量程
 */
export function deriveBarData(bars, cal) {
  return bars
    .slice()
    .sort((a, b) => a.rect.x - b.rect.x)
    .map((b) => b.rect.h / cal.pxPerUnit)
}

/**
 * 折线点 → 数值。value = (baselineY - pointY) / pxPerUnit
 * @param {Array<{x,y}>} pts
 * @param {{baselineY:number, pxPerUnit:number}} cal
 */
export function deriveLineData(pts, cal) {
  return pts
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((p) => (cal.baselineY - p.y) / cal.pxPerUnit)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node skill/scripts/test-derive-data.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/chart-features/derive-data.mjs scripts/test-derive-data.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): bar/line/area 几何数据反推"
```

---

## Task 8: ECharts 模板库

**Files:**
- Create: `skill/templates/echarts/theme.mjs`（dark 大屏 token）
- Create: `skill/templates/echarts/index.mjs`（buildOption 分发）
- Test: `skill/scripts/test-echarts-templates.mjs`

> 模板返回纯 option 对象（不 import echarts，渐变用占位对象 `{ __gradient: [from,to] }`，由消费侧 Vue 组件转 echarts.graphic.LinearGradient）。这样模板可在 node 下单测。

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-echarts-templates.mjs
import { buildOption } from '../templates/echarts/index.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const barZone = {
  chartType: 'dualAxisBar',
  categories: ['2020', '2021'],
  axis: { yLeft: { max: 150, unit: '万tce' }, yRight: { max: 150, unit: '万tCO₂' } },
  legend: [{ name: '指标A', color: '#1DE4FF' }, { name: '指标B', color: '#0BFFB6' }],
  series: [
    { name: '指标A', color: '#1DE4FF', yAxisIndex: 0, data: [98, 112] },
    { name: '指标B', color: '#0BFFB6', yAxisIndex: 1, data: [76, 84] },
  ],
}
const bar = buildOption(barZone)
assert(bar.series.length === 2, 'bar 2 series')
assert(bar.series[0].type === 'bar', 'series type bar')
assert(bar.xAxis.data.length === 2, 'xAxis categories')
assert(Array.isArray(bar.yAxis) && bar.yAxis.length === 2, 'dual yAxis')

const radar = buildOption({ chartType: 'radar', radar: { indicators: [{ name: '电', max: 100 }] }, series: [{ data: [80] }] })
assert(radar.radar && radar.radar.indicator.length === 1, 'radar indicator')
assert(radar.series[0].type === 'radar', 'radar series type')

const sankey = buildOption({ chartType: 'sankey', sankey: { nodes: [{ name: 'A' }, { name: 'B' }], links: [{ source: 'A', target: 'B', value: 5 }] } })
assert(sankey.series[0].type === 'sankey', 'sankey type')
assert(sankey.series[0].data.length === 2, 'sankey nodes')

assert(buildOption({ chartType: 'unknownXYZ' }) === null, 'unknown type null')

if (failed) process.exit(1)
console.log('All echarts-template tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-echarts-templates.mjs`
Expected: FAIL

- [ ] **Step 3: 写 theme.mjs**

```js
// skill/templates/echarts/theme.mjs
// dark 大屏统一 token（字号为设计像素，组件在画板坐标内渲染后整体缩放）。
export const T = {
  axisLabel: { color: 'rgba(180,225,255,0.75)', fontSize: 22 },
  axisName: { color: 'rgba(170,210,255,0.6)', fontSize: 20 },
  axisLine: { lineStyle: { color: 'rgba(73,200,255,0.30)' } },
  splitLine: { lineStyle: { color: 'rgba(73,200,255,0.10)', type: 'dashed' } },
  legendText: { color: 'rgba(200,235,255,0.9)', fontSize: 22 },
  grid: { left: 8, right: 8, top: 64, bottom: 28, containLabel: true },
}
// 渐变占位：消费侧（Vue）转 echarts.graphic.LinearGradient(0,0,0,1,[...])
export function vGradient(from, to) {
  return { __gradient: 'v', stops: [from, to] }
}
```

- [ ] **Step 4: 写 index.mjs（分发 + 各类型 builder）**

```js
// skill/templates/echarts/index.mjs
import { T, vGradient } from './theme.mjs'

function fade(color) { return vGradient(color, 'rgba(255,255,255,0.05)') }

function barOption(zone, dual) {
  const yAxis = dual
    ? [
        { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine },
        { type: 'value', max: zone.axis?.yRight?.max, name: zone.axis?.yRight?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: { show: false } },
      ]
    : { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine }
  return {
    backgroundColor: 'transparent',
    grid: T.grid,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 8, left: 'center', itemWidth: 20, itemHeight: 12, itemGap: 24, textStyle: T.legendText, data: (zone.legend || []).map((l) => l.name) },
    xAxis: { type: 'category', data: zone.categories || [], axisLabel: T.axisLabel, axisLine: T.axisLine, axisTick: { show: false } },
    yAxis,
    series: (zone.series || []).map((s) => ({
      name: s.name, type: 'bar', barWidth: dual ? 18 : 14, yAxisIndex: s.yAxisIndex || 0,
      data: s.data || [], itemStyle: { color: fade(s.color), borderRadius: [3, 3, 0, 0] },
    })),
  }
}

function lineOption(zone, area) {
  return {
    backgroundColor: 'transparent', grid: T.grid, tooltip: { trigger: 'axis' },
    legend: { top: 8, left: 'center', itemWidth: 22, itemHeight: 12, itemGap: 28, textStyle: T.legendText, data: (zone.legend || []).map((l) => l.name) },
    xAxis: { type: 'category', boundaryGap: false, data: zone.categories || [], axisLabel: T.axisLabel, axisLine: T.axisLine, axisTick: { show: false } },
    yAxis: { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine },
    series: (zone.series || []).map((s) => ({
      name: s.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, connectNulls: false,
      data: s.data || [], lineStyle: { color: s.color, width: 3 }, itemStyle: { color: s.color },
      ...(area ? { areaStyle: { color: vGradient(s.color, 'rgba(255,255,255,0.02)') } } : {}),
    })),
  }
}

function radarOption(zone) {
  return {
    backgroundColor: 'transparent', tooltip: { trigger: 'item' },
    radar: {
      center: ['50%', '54%'], radius: '62%',
      indicator: (zone.radar?.indicators) || [],
      axisName: { color: 'rgba(200,235,255,0.9)', fontSize: 22 },
      axisLine: { lineStyle: { color: 'rgba(73,200,255,0.25)' } },
      splitLine: { lineStyle: { color: 'rgba(73,200,255,0.18)' } },
      splitArea: { areaStyle: { color: ['rgba(20,80,160,0.05)', 'rgba(20,80,160,0.12)'] } },
    },
    series: [{ type: 'radar', symbol: 'circle', symbolSize: 6, data: zone.series || [], lineStyle: { color: '#1DE4FF', width: 2 }, itemStyle: { color: '#47FF8C' }, areaStyle: { color: 'rgba(29,228,255,0.25)' } }],
  }
}

function sankeyOption(zone) {
  return {
    backgroundColor: 'transparent', tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type: 'sankey', left: 12, right: 120, top: 16, bottom: 16, nodeWidth: 16, nodeGap: 14,
      label: { color: 'rgba(210,240,255,0.95)', fontSize: 20 },
      lineStyle: { color: 'gradient', opacity: 0.4, curveness: 0.5 },
      data: zone.sankey?.nodes || [], links: zone.sankey?.links || [],
    }],
  }
}

function pieOption(zone) {
  return {
    backgroundColor: 'transparent', tooltip: { trigger: 'item' },
    legend: { bottom: 4, left: 'center', textStyle: T.legendText },
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '46%'], label: { color: 'rgba(210,240,255,0.9)', fontSize: 18 }, data: zone.series?.[0]?.data || [] }],
  }
}

const DISPATCH = {
  bar: (z) => barOption(z, false),
  dualAxisBar: (z) => barOption(z, true),
  groupBar: (z) => barOption(z, false),
  line: (z) => lineOption(z, false),
  area: (z) => lineOption(z, true),
  radar: radarOption,
  sankey: sankeyOption,
  pie: pieOption,
  gauge: pieOption, // gauge 暂复用环形；高阶模型可覆盖
}

/**
 * @param {Object} zone _chart_zones.json 的单个 zone
 * @returns {Object|null} ECharts option（渐变为 {__gradient} 占位，消费侧转换）
 */
export function buildOption(zone) {
  const fn = DISPATCH[zone && zone.chartType]
  return fn ? fn(zone) : null
}
```

- [ ] **Step 5: 运行确认通过**

Run: `node skill/scripts/test-echarts-templates.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add templates/echarts/ scripts/test-echarts-templates.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): ECharts 大屏模板库（9 类图表 + dark 主题 token）"
```

---

## Task 9: 主驱动脚本 extract-chart-features.mjs（串联 Task 5–8）

**Files:**
- Create: `skill/scripts/extract-chart-features.mjs`
- Test: `skill/scripts/test-extract-chart-features.mjs`

把 detect-zones + extract-features + derive-data 串成 CLI，输入 `_all_elements.json` + `_layer_stack.json`，产出 `_chart_zones.json`。

- [ ] **Step 1: 写失败测试（用最小合成数据）**

```js
// skill/scripts/test-extract-chart-features.mjs
import { buildChartZones } from './extract-chart-features.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const elements = [
  { id: 't', type: 'text', content: '趋势分析', rect: { x: 181, y: 184, w: 148, h: 44 } },
  { id: 'y1', type: 'text', content: '0', rect: { x: 150, y: 520, w: 20, h: 20 } },
  { id: 'y2', type: 'text', content: '150', rect: { x: 150, y: 240, w: 20, h: 20 } },
  { id: 'c1', type: 'text', content: '2020年', rect: { x: 214, y: 528, w: 60, h: 24 } },
  { id: 'c2', type: 'text', content: '2021年', rect: { x: 320, y: 528, w: 60, h: 24 } },
]
const zones = buildChartZones(elements, [], { panels: [{ titles: ['趋势分析'], left: 138, width: 1263 }] })
assert(zones.zones.length === 1, 'one zone')
assert(zones.zones[0].categories.length === 2, 'categories extracted')
assert(zones.zones[0].axis !== undefined, 'axis present')
assert(zones.zones[0].confidence === 'high', 'high confidence')

if (failed) process.exit(1)
console.log('All extract-chart-features tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-extract-chart-features.mjs`
Expected: FAIL

- [ ] **Step 3: 写实现**

```js
// skill/scripts/extract-chart-features.mjs
import fs from 'fs'
import path from 'path'
import { detectChartZones, inferChartType } from './chart-features/detect-zones.mjs'
import { extractAxis, extractCategories, extractLegend } from './chart-features/extract-features.mjs'

function inZone(rect, z) {
  if (!rect) return false
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2
  return cx >= z.rect.x && cx <= z.rect.x + z.rect.w && cy >= z.rect.y && cy <= z.rect.y + z.rect.h
}

/**
 * @param {Array} elements all_elements
 * @param {Array} layers layer_stack
 * @param {{panels:Array<{titles,left,width}>}} opts
 * @returns {{zones:Array}}
 */
export function buildChartZones(elements, layers, opts) {
  const allZones = []
  for (const panel of opts.panels || []) {
    const zones = detectChartZones(elements, { panelTitles: panel.titles, panelWidth: panel.width, panelLeft: panel.left })
    for (const z of zones) {
      const inEls = elements.filter((e) => inZone(e.rect, z))
      const texts = inEls.filter((e) => e.type === 'text')
      const xTexts = texts.filter((e) => /^\d{4}年?$|^[\u4e00-\u9fa5]{1,4}$/.test((e.content || '').trim()) && e.rect.y > z.rect.y + z.rect.h * 0.6)
      const yTexts = texts.filter((e) => e.rect.x < z.rect.x + 80)
      const slices = inEls.filter((e) => /slice/i.test((e.source && e.source.kind) || '')).map((e) => ({ ext: ((e.source.file || '').split('.').pop() || '').toLowerCase() }))
      const vectors = inEls.filter((e) => e.type === 'shape').map((e) => {
        const css = ((e.source && e.source.css) || e.css || []).join(' ')
        const bm = css.match(/border\s*:\s*(\d+)px/i)
        return { w: e.rect.w, h: e.rect.h, borderPx: bm ? parseInt(bm[1], 10) : 0 }
      })
      z.chartType = inferChartType({ slices, texts: texts.map((t) => (t.content || '').trim()), vectors }) || 'bar'
      z.axis = { yLeft: extractAxis(yTexts) }
      z.categories = extractCategories(xTexts)
      z.legend = extractLegend(texts, [])
      z.series = []
      z.excludeLayerIds = layers.filter((l) => inZone(l.rect, z)).map((l) => l.id)
      allZones.push(z)
    }
  }
  return { zones: allZones }
}

// CLI: node extract-chart-features.mjs <dataDir> <panelsJson>
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const dataDir = process.argv[2]
  const panelsJson = process.argv[3]
  if (!dataDir) { console.error('usage: extract-chart-features.mjs <dataDir> <panels.json>'); process.exit(1) }
  const elDoc = JSON.parse(fs.readFileSync(path.join(dataDir, '_all_elements.json'), 'utf8'))
  const stackRaw = JSON.parse(fs.readFileSync(path.join(dataDir, '_layer_stack.json'), 'utf8'))
  const layers = Array.isArray(stackRaw) ? stackRaw : (stackRaw.layers || [])
  const opts = panelsJson ? JSON.parse(fs.readFileSync(panelsJson, 'utf8')) : { panels: [] }
  const out = buildChartZones(elDoc.elements || [], layers, opts)
  fs.writeFileSync(path.join(dataDir, '_chart_zones.json'), JSON.stringify(out, null, 2))
  console.log('chart zones:', out.zones.length, '→', path.join(dataDir, '_chart_zones.json'))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node skill/scripts/test-extract-chart-features.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/extract-chart-features.mjs scripts/test-extract-chart-features.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): extract-chart-features 主驱动产出 _chart_zones.json"
```

---

## Task 10: 交付前消费审计强化

**Files:**
- Create: `skill/scripts/consume-audit.mjs`
- Test: `skill/scripts/test-consume-audit.mjs`

校验结果（不限实现）：每层已消费/排除/图表化、每 high zone 有 ECharts、blend 已加、无退化路径渲染、needsConfirm 已裁决。

- [ ] **Step 1: 写失败测试**

```js
// skill/scripts/test-consume-audit.mjs
import { auditConsumption } from './consume-audit.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const layers = [
  { id: 'a', rect: { x: 0, y: 0, w: 10, h: 10 } },
  { id: 'b', rect: { x: 0, y: 0, w: 10, h: 10 } }, // 在图表区
]
const zones = { zones: [{ id: 'bar', confidence: 'high', chartType: 'bar', excludeLayerIds: ['b'], rendered: true }] }
const gaps = { degenerateBorderPaths: [], blendHints: [{ id: 'a', blendMode: 'screen' }] }
const consumedIds = ['a'] // a 已渲染，b 被图表区排除
const r1 = auditConsumption({ layers, zones, gaps, consumedIds, appliedBlendIds: ['a'] })
assert(r1.ok === true, 'all consumed → ok')

// 漏渲染一层 → 不 ok
const r2 = auditConsumption({ layers, zones, gaps, consumedIds: [], appliedBlendIds: ['a'] })
assert(r2.ok === false, 'missing layer → not ok')
assert(r2.issues.some((i) => i.type === 'unconsumed-layer'), 'reports unconsumed')

// blend 未加 → 不 ok
const r3 = auditConsumption({ layers, zones, gaps, consumedIds: ['a'], appliedBlendIds: [] })
assert(r3.ok === false && r3.issues.some((i) => i.type === 'missing-blend'), 'missing blend reported')

// high zone 未渲染 → 不 ok
const zones2 = { zones: [{ id: 'bar', confidence: 'high', excludeLayerIds: ['b'], rendered: false }] }
const r4 = auditConsumption({ layers, zones: zones2, gaps, consumedIds: ['a'], appliedBlendIds: ['a'] })
assert(r4.ok === false && r4.issues.some((i) => i.type === 'chart-zone-no-echarts'), 'zone without echarts reported')

if (failed) process.exit(1)
console.log('All consume-audit tests passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node skill/scripts/test-consume-audit.mjs`
Expected: FAIL

- [ ] **Step 3: 写实现**

```js
// skill/scripts/consume-audit.mjs
// 交付前消费审计：校验结果，不限实现方式（地板非天花板）。

/**
 * @param {Object} p
 * @param {Array} p.layers          layer_stack
 * @param {{zones:Array}} p.zones   _chart_zones.json
 * @param {Object} p.gaps           _render_gaps_report.json（含 degenerateBorderPaths/blendHints）
 * @param {string[]} p.consumedIds  Index.vue 实际渲染的图层 id
 * @param {string[]} p.appliedBlendIds 实际加了 mix-blend-mode 的图层 id
 * @returns {{ok:boolean, issues:Array}}
 */
export function auditConsumption(p) {
  const issues = []
  const excluded = new Set()
  for (const z of p.zones?.zones || []) {
    for (const id of z.excludeLayerIds || []) excluded.add(id)
  }
  const consumed = new Set(p.consumedIds || [])
  const degenerate = new Set((p.gaps?.degenerateBorderPaths || []).map((d) => d.id))

  // 每层：已渲染 / 已排除（图表区）/ 退化跳过 —— 三选一
  for (const l of p.layers || []) {
    if (consumed.has(l.id) || excluded.has(l.id) || degenerate.has(l.id)) continue
    issues.push({ type: 'unconsumed-layer', id: l.id })
  }
  // 退化路径不应被渲染
  for (const id of degenerate) {
    if (consumed.has(id)) issues.push({ type: 'degenerate-rendered', id })
  }
  // high zone 必须已接 ECharts（rendered:true）
  for (const z of p.zones?.zones || []) {
    if (z.confidence === 'high' && !z.rendered) issues.push({ type: 'chart-zone-no-echarts', id: z.id })
    if (z.needsConfirm) issues.push({ type: 'zone-needs-confirm', id: z.id })
  }
  // blend 提示必须已应用
  const appliedBlend = new Set(p.appliedBlendIds || [])
  for (const b of p.gaps?.blendHints || []) {
    if (!appliedBlend.has(b.id)) issues.push({ type: 'missing-blend', id: b.id, blendMode: b.blendMode })
  }
  return { ok: issues.length === 0, issues }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node skill/scripts/test-consume-audit.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/consume-audit.mjs scripts/test-consume-audit.mjs
git -C "~/.claude/skills/design-to-vue" commit -m "feat(d2v): 交付前消费审计（结果校验，不限实现）"
```

---

## Task 11: 文档更新（SKILL.md + references）

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `skill/references/meaxure-track.md`
- Modify: `skill/references/element-recognition.md`
- Modify: `skill/references/hard-won-rules.md`

纯文档，无测试。每处改动要"可被低阶模型照做"，并标注"默认快路径 / 可增强点"。

- [ ] **Step 1: SKILL.md 加"地板非天花板"哲学段**

在 SKILL.md「三条铁律」之后插入：

```markdown
## 设计哲学：脚本与模板是地板，不是天花板

本 skill 的脚本（`extract-chart-features`、`merge-artboards`、`_render_gaps_report` 等）与
`templates/echarts/` 模板提供**保证基线（地板）**：低阶模型照单消费即可达标。
高阶模型可**覆盖模板 option、追加更高保真处理、自主裁决 needsConfirm 候选**——
闸门只校验**结果**（每层已消费/排除/图表化、每图表区有 ECharts、黑白底切片已 blend、无退化路径被渲染），
不规定唯一实现方式。用更优手段达成同样结果同样通过。
```

- [ ] **Step 2: SKILL.md 禁止事项追加 4 条**

在「禁止事项摘要」末尾追加：

```markdown
21. 禁止把图表区静态矢量/切片近似当最终渲染——必须按 `_chart_zones.json` 用 `templates/echarts` ECharts 自渲染（雷达/桑基/面积/折线/柱同理）
22. 禁止渲染 `_render_gaps_report.degenerateBorderPaths`——MeaXure `border:Npx` 描边路径套小盒子会成实心大色块，须跳过
23. 禁止忽略 `_render_gaps_report.blendHints`——黑底切片须 `mix-blend-mode:screen`、白底须 `multiply`（让真实切片正确显示，非 CSS 模拟）
24. 禁止多画板互补拆分时只取单板——必须按 `_artboard_merge_plan.json` 合并，未合并禁止渲染
```

- [ ] **Step 3: SKILL.md 脚本快捷参考追加**

在「脚本快捷参考」A 轨道块追加：

```bash
# A 轨道 - 多画板合并（_artboard_merge_plan.json 指示互补合并时）
node scripts/merge-artboards.mjs <dataDir>
# A 轨道 - 图表特征提取（产出 _chart_zones.json，消费 templates/echarts）
node scripts/extract-chart-features.mjs <dataDir> <panels.json>
```

- [ ] **Step 4: meaxure-track.md 加阶段闸门**

在 meaxure-track.md「0-B 渲染缺口」checklist（约 line 579）后追加渲染前/交付前两道闸门：

```markdown
### 渲染前闸门（写 Index.vue 前，三份报告必须已消费）
- [ ] `_artboard_merge_plan.json`：multiArtboard 时已 `merge-artboards.mjs` 合并
- [ ] `_render_gaps_report.json`：degenerateBorderPaths 已跳过、blendHints 已加 mix-blend-mode、duplicateTextGroups 已 dedupe、iconGapCandidates 已映射
- [ ] `_chart_zones.json`：high 置信区已从 layer_stack 排除 excludeLayerIds 并接 ECharts；low 置信（needsConfirm）已裁决

### 交付前闸门（硬阻断）
- [ ] 跑 `consume-audit`：ok===true（每层已消费/排除/图表化、每 high zone 有 ECharts、blend 已加、无退化渲染）
- [ ] 浏览器 CDP 校验（铁律 #4），不靠截图肉眼
```

- [ ] **Step 5: element-recognition.md 加图表类型签名表**

在 element-recognition.md「Fake Chart 识别特征」节后追加 `inferChartType` 签名表（雷达=jpg+维度文字、桑基=多 border 路径、面积=底部渐变 div、折线=点序列、柱/分组柱=等距小柱、饼/仪表=环弧），并指明产物 `_chart_zones.json` 与消费 `templates/echarts/buildOption(zone)`。

```markdown
## 图表类型推断签名表（_chart_zones.json，extract-chart-features 产出）

| chartType | 区内签名 | 数据来源 |
|-----------|---------|---------|
| radar | 面板内 jpg/png 多边形切片 + 3–6 维度文字 | indicators 取维度文字；值用 mock |
| sankey | ≥6 个 `border:Npx` 多色描边路径 + 分列节点文字 | nodes 取节点文字；links 用 mock |
| area | 底部 `linear-gradient(...0%,color 100%)` 大 div | 几何反推 |
| line | 折线点序列（点+连线） | 几何反推 |
| dualAxisBar / bar | 等距小柱（w 6–18,h≥30），双侧 Y 轴=dual | 柱高几何反推 |
| groupBar | 每类目 2–4 根循环色小柱 | 柱高几何反推 |
| pie / gauge | 环/弧 + 中心数值 | mock |

消费：`import { buildOption } from 'templates/echarts'` → `buildOption(zone)`。
**默认快路径**：直接套模板。**可增强点**：高阶模型深拷贝后局部覆盖或自写 option。
```

- [ ] **Step 6: hard-won-rules.md 追加本次 5 条踩坑**

在 hard-won-rules.md 末尾追加规则 25–29：

```markdown
## 规则 25–29（sampleDashboard 复盘，2026-06-17）

25. **多画板互补拆分**：设计可能拆到多个 artboard（一板背景、一板面板），单独都不完整。
    先逐板算覆盖率，`_artboard_merge_plan.json` 指示合并，`merge-artboards.mjs` 执行。
26. **退化描边路径**：MeaXure `border:Npx solid` 套 5×1 小盒子 = Sketch 描边路径，
    CSS 渲染成 (5+2N)×(1+2N) 实心大色块。`isDegenerateBorderPath` 检测并跳过，保留 ≤2px 细线。
27. **黑底/白底切片**：PNG 含不透明黑/白底时叠深色大屏会突兀。
    `detect-slice-blend` 采样四角 → 黑底 `screen`、白底 `multiply`。让真实切片正确显示，非 CSS 模拟。
28. **颜色形态跨画板不一致**：`borders[].color` 可能是字符串或 `{rgb:{r,g,b}}` 对象或带 `%` 尾缀。
    统一用 `templates/shared/colorParse.mjs#parseColor`，杜绝 `[object Object]`。
29. **图表必须 ECharts 重绘**：图表是动态数据，复刻静态近似无意义且必失真。
    按 `_chart_zones.json` 排除区内静态层 + `templates/echarts` 自渲染。
```

- [ ] **Step 7: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add SKILL.md references/meaxure-track.md references/element-recognition.md references/hard-won-rules.md
git -C "~/.claude/skills/design-to-vue" commit -m "docs(d2v): 阶段闸门 + 图表签名表 + 踩坑 25-29 + 地板非天花板哲学"
```

---

## Task 12: 回归夹具 + 总测试 + 同步 Cursor 副本

**Files:**
- Create: `skill/scripts/test-all.mjs`（串跑全部 test-*.mjs）
- Create: `skill/docs/fixtures/sampleDashboard/`（设计源精简快照 + 期望产物）
- Modify: `skill/sync/checksum.txt`（同步产物）

- [ ] **Step 1: 写总测试 runner**

```js
// skill/scripts/test-all.mjs
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const tests = fs.readdirSync(dir).filter((f) => /^test-.*\.mjs$/.test(f) && f !== 'test-all.mjs')
let failed = 0
for (const t of tests) {
  try {
    execSync(`node "${path.join(dir, t)}"`, { stdio: 'inherit' })
  } catch {
    console.error('TEST FILE FAILED:', t)
    failed++
  }
}
if (failed) { console.error(`${failed} test file(s) failed`); process.exit(1) }
console.log('ALL test files passed')
```

- [ ] **Step 2: 运行总测试确认全绿**

Run: `node skill/scripts/test-all.mjs`
Expected: PASS（ALL test files passed）

- [ ] **Step 3: 建回归夹具**

从 `sampleDashboard/data/` 复制精简快照到 `skill/docs/fixtures/sampleDashboard/`：`_all_elements.json`、`_layer_stack.json`、`panels.json`（声明左右面板标题/边界），并保存一份人工核对过的期望 `_chart_zones.expected.json`（6 个 zone，类型分别为 dualAxisBar/radar/area/sankey/groupBar/line）。

新增 `skill/scripts/test-fixture-chart-zones.mjs`：

```js
// skill/scripts/test-fixture-chart-zones.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildChartZones } from './extract-chart-features.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const fx = path.join(dir, '../docs/fixtures/sampleDashboard')
let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const els = JSON.parse(fs.readFileSync(path.join(fx, '_all_elements.json'), 'utf8')).elements
const stackRaw = JSON.parse(fs.readFileSync(path.join(fx, '_layer_stack.json'), 'utf8'))
const layers = Array.isArray(stackRaw) ? stackRaw : (stackRaw.layers || [])
const panels = JSON.parse(fs.readFileSync(path.join(fx, 'panels.json'), 'utf8'))

const out = buildChartZones(els, layers, panels)
assert(out.zones.length === 6, `6 zones (got ${out.zones.length})`)
const types = out.zones.map((z) => z.chartType).sort()
const expected = ['area', 'dualAxisBar', 'groupBar', 'line', 'radar', 'sankey'].sort()
assert(JSON.stringify(types) === JSON.stringify(expected), `zone types match (got ${types})`)

if (failed) process.exit(1)
console.log('Fixture chart-zones regression passed')
```

- [ ] **Step 4: 运行夹具回归**

Run: `node skill/scripts/test-fixture-chart-zones.mjs`
Expected: PASS（若类型不符，迭代调整 detect-zones/extract-features 的阈值——这正是夹具的价值）

- [ ] **Step 5: 同步到 Cursor 副本并校验**

Run:
```powershell
powershell -File "~/.claude/skills/design-to-vue/sync/sync-to-cursor.ps1"
powershell -File "~/.claude/skills/design-to-vue/sync/verify-sync.ps1"
```
Expected: verify 通过（两端 checksum 一致）

- [ ] **Step 6: Commit**

```bash
git -C "~/.claude/skills/design-to-vue" add scripts/test-all.mjs scripts/test-fixture-chart-zones.mjs docs/fixtures/ sync/checksum.txt
git -C "~/.claude/skills/design-to-vue" commit -m "test(d2v): 总测试 runner + sampleDashboard 回归夹具 + Cursor 同步"
```

---

## Self-Review（计划自检）

**Spec 覆盖核对：**
- 模块1（图表特征提取+模板）→ Task 5/6/7/8/9 ✅
- 模块2（退化路径+blend+颜色解析）→ Task 1/2/3 ✅
- 模块3（多画板合并）→ Task 4 ✅
- 模块4（闸门+checklist）→ Task 10（消费审计脚本）+ Task 11（文档闸门）✅
- 模块5（回归夹具）→ Task 12 ✅
- 设计哲学"地板非天花板"→ Task 11 Step 1 + Task 10（审计只校验结果）✅

**类型/命名一致性：**
- `parseColor`（Task 1）被 Task 6 extract-features 引用 ✅
- `isDegenerateBorderPath`（Task 2）被 Task 10 consume-audit 经 gaps 引用、被 extract-all-elements 引用 ✅
- `buildChartZones`（Task 9）被 Task 12 夹具测试引用 ✅
- `buildOption`（Task 8）被文档 Task 11 引用 ✅
- zone 字段（chartType/confidence/excludeLayerIds/rendered/needsConfirm）在 Task 5/8/9/10 间一致 ✅

**Placeholder 扫描：** 无 TBD/TODO（代码内 `// TODO: 接入接口` 是产物注释内容，非计划占位）✅

**已知后续校准点（非占位，留给执行时夹具驱动）：** Task 5/9 的阈值（zone 高度 312、桑基 borderPaths≥6、bar≥4）在 Task 12 夹具回归中校准到 6 zone 全中。
