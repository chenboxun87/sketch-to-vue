# render-gaps-consumption.md

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

**目标读者**：正在写 `Index.vue` 的模型或开发者。  
**解决的核心问题**：手上有 `_render_gaps_report.json`、`_chart_zones.json`、`_artboard_merge_plan.json`，现在该在 `Index.vue` 里写什么？

---

## Section 1：总览 — 四份报告文件与它们的角色

| 文件 | 产生自 | 告诉你 |
|------|--------|--------|
| `_artboard_merge_plan.json` | `detect-artboard-merge.mjs` | 是否需要合并多画板；哪个是 base 板、哪个是 overlay 板 |
| `_render_gaps_report.json` | `extract-all-elements.mjs` | 哪些层有问题（退化路径 / 黑白底 / 重复文字 / 图标缺口）|
| `_chart_zones.json` | `extract-chart-features.mjs` | 哪些区域是图表区；每个图表的类型 / 类目 / 轴 / 配色 |
| `_artboard_coverage.json` | `measure-artboard-coverage.mjs` | 各画板的中心 / 边缘覆盖率（用于合并决策）|

**这四份文件是渲染前闸门的输入，必须全部消费完才能开始写 `Index.vue`。**

---

## Section 2：消费顺序（写 Index.vue 前必须完成）

```
第一步（提取期，写 Vue 前）
□ 1. 运行 measure-artboard-coverage.mjs → 得到 _artboard_coverage.json
□ 2. 运行 detect-artboard-merge.mjs     → 得到 _artboard_merge_plan.json
□ 3. 若 multiArtboard: true             → 运行 merge-artboards.mjs 合并画板数据
□ 4. 运行 extract-all-elements.mjs      → 得到 _render_gaps_report.json
□ 5. 运行 extract-chart-features.mjs + panels.json → 得到 _chart_zones.json

第二步（写 Index.vue）
□ 6. 读 _render_gaps_report.json → 构建过滤集合（3 个 Set/Map，见 Section 3）
□ 7. 读 _chart_zones.json        → 构建图表排除集合 + chartOverlays（见 Section 4）
□ 8. 逐层渲染时按 Section 5 的顺序应用所有过滤
□ 9. 渲染后运行 consume-audit → ok===true 才交付
```

⚠️ **禁止跳步**：直接从 `_all_elements.json` 渲染而不消费 `_render_gaps_report.json`，必然出现大色块遮挡或黑框突兀。

---

## Section 3：`_render_gaps_report.json` 字段 → Index.vue 代码（逐字段）

### 3.1 字段：`degenerateBorderPaths`

**含义**：MeaXure 用 `border: Npx` 表示 Sketch 描边路径时，border 厚度远大于元素尺寸，渲染成实心大色块。这些层**必须跳过**，否则会遮挡大量内容。

**读取（在 `<script>` 顶部或 `created` 钩子里执行一次）：**

```javascript
import renderGapsReport from './data/_render_gaps_report.json'

const degenerateIds = new Set(
  (renderGapsReport.degenerateBorderPaths || []).map(d => d.id)
)
```

**在 `renderItems` computed 或方法中使用（最先检查，优先退出）：**

```javascript
// renderItems 是遍历 _layer_stack.json 的 computed
renderItems() {
  const items = []
  for (const layer of this.layerStack) {
    // ① 最先检查：退化描边路径
    if (degenerateIds.has(layer.id)) continue  // 跳过，不渲染

    // ... 其他过滤（见 Section 5）
    items.push(layer)
  }
  return items
}
```

⚠️ **注意**：`degenerateBorderPaths` 里的 `id` 字段必须与 `_layer_stack.json` 里的 `id` 字段**完全一致**（UUID 格式）。如果 `id` 对不上，所有退化层都会被渲染出来变成大色块。调试方法：

```javascript
// 调试：打印前 3 个退化 id，与 layer_stack 里的 id 对比
console.log('degenerate ids:', [...degenerateIds].slice(0, 3))
console.log('stack ids sample:', layerStack.slice(0, 3).map(l => l.id))
```

---

### 3.2 字段：`blendHints`

**含义**：PNG 切片含不透明黑底（需 `screen`）或白底（需 `multiply`），直接叠在深色大屏背景上会突兀（黑框或白块）。

**读取：**

```javascript
const blendMap = {}
for (const b of renderGapsReport.blendHints || []) {
  blendMap[b.id] = b.blendMode  // 值为 'screen' 或 'multiply'
}
```

**在 `renderItems` 中使用（仅对 `slice-file` 类型的层）：**

```javascript
// 在构建每个层的样式对象时
function buildLayerStyle(layer, rect) {
  const style = {
    position: 'absolute',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
    zIndex: layer.zIndex,
  }
  // ② blend 仅对切片层应用
  if (layer.kind === 'slice-file' && blendMap[layer.id]) {
    style.mixBlendMode = blendMap[layer.id]
  }
  return style
}
```

**模板中的切片渲染示例：**

```html
<template v-for="layer in renderItems">
  <img
    v-if="layer.kind === 'slice-file'"
    :key="layer.id"
    :src="resolveAssetPath(layer.file)"
    :style="buildLayerStyle(layer, layer.rect)"
    draggable="false"
  />
  <!-- ... 其他层类型 -->
</template>
```

⚠️ **注意**：`mixBlendMode` 只对 `kind='slice-file'` 的层应用，**不要**应用于矢量 shape 层或文字层，否则文字或矢量会出现意外的颜色混合效果。

---

### 3.3 字段：`duplicateTextGroups`

**含义**：多画板合并后，同一位置的文字出现两次（不同 `id`，但相同坐标 + 相同内容）。不去重则页面出现文字叠影（同一文字看起来加粗或模糊）。

**推荐去重方式（在 `renderItems` 开头建 Set，遇重则跳过）：**

```javascript
renderItems() {
  const textKeys = new Set()  // ← 在此方法作用域内，每次 computed 重新生成
  const items = []

  for (const layer of this.layerStack) {
    if (degenerateIds.has(layer.id)) continue
    // ... 其他过滤 ...

    // ③ 文字去重（只对 text 层做）
    if (layer.kind === 'text') {
      const content = layer.content || ''
      const key = `${content}|${Math.round(layer.rect.x / 4)}|${Math.round(layer.rect.y / 4)}`
      if (textKeys.has(key)) continue  // 跳过重复
      textKeys.add(key)
    }

    items.push(layer)
  }
  return items
}
```

⚠️ **注意**：坐标除以 4 是为了对齐到 4px 网格，容忍 MeaXure 的亚像素偏移（同一文字在不同画板里坐标可能相差 1~3px）。规则：**内容相同 + 坐标差 < 4px → 视为重复，保留先遇到的**（z-index 更高的层通常先在 layer_stack 里出现）。

**高级去重**（同行文字包含关系去重，处理 composite + fragment 同进 stack 的情况）：

```javascript
// 在 renderItems 过滤之后，再对 text 层做一次 dedupeTextLayers
function dedupeTextLayers(textLayers) {
  // 按内容长度降序：保留更长（更完整）的文字
  const sorted = [...textLayers].sort(
    (a, b) => String(b.content || '').length - String(a.content || '').length
  )
  const kept = []
  sorted.forEach((t) => {
    const tc = String(t.content || '')
    const dup = kept.some((k) => {
      const kc = String(k.content || '')
      // 同格子（坐标近似）
      const sameCell =
        Math.round(k.rect.y / 2) === Math.round(t.rect.y / 2) &&
        Math.round(k.rect.x / 2) === Math.round(t.rect.x / 2)
      if (sameCell) return true
      // 同行且内容包含且横向重叠
      if (Math.abs(k.rect.y - t.rect.y) > 2) return false
      if (kc.length <= tc.length || !kc.includes(tc)) return false
      const a = k.rect, b = t.rect
      return !(a.x + a.w < b.x || b.x + b.w < a.x)
    })
    if (!dup) kept.push(t)
  })
  return kept
}
```

---

### 3.4 字段：`iconGapCandidates`

**含义**：疑似图标缺口——设计里有图标但无对应切片，或切片文件磁盘不存在的区域。页面对应位置会出现空白或只有渐变色块（无图标图形）。

**`iconGapCandidates` 的数据结构示例：**

```json
[
  {
    "id": "abc-123",
    "name": "零碳图标-规划",
    "rect": { "x": 120, "y": 450, "w": 40, "h": 40 },
    "reason": "empty-group"
  }
]
```

**消费方式（三选一）：**

**方案 A（推荐）：用 `_icon_gap_overlays.json` 映射已有 slice**

```json
// 新建文件 _icon_gap_overlays.json
{
  "comment": "MeaXure 未导出的 bitmap/空 group；按 elementId 在 group rect 贴已有 slice",
  "items": [
    {
      "elementId": "abc-123",
      "name": "零碳图标-规划",
      "file": "guihua-icon.png",
      "reason": "empty-group"
    }
  ]
}
```

```javascript
// 在 Index.vue 中读取并渲染
import iconGapOverlays from './data/_icon_gap_overlays.json'

computed: {
  iconGapLayers() {
    return iconGapOverlays.items.map(item => {
      const candidate = this.renderGapsReport.iconGapCandidates
        .find(c => c.id === item.elementId)
      if (!candidate) return null
      return {
        id: item.elementId,
        file: item.file,
        rect: candidate.rect,
      }
    }).filter(Boolean)
  }
}
```

```html
<!-- 模板中，在 renderItems 之后渲染图标补丁 -->
<img
  v-for="icon in iconGapLayers"
  :key="'gap-' + icon.id"
  :src="resolveAssetPath(icon.file)"
  :style="{
    position: 'absolute',
    left: `${icon.rect.x}px`,
    top: `${icon.rect.y}px`,
    width: `${icon.rect.w}px`,
    height: `${icon.rect.h}px`,
    zIndex: 1200,
  }"
  draggable="false"
/>
```

**方案 B：忽略，加入 consumedIds（仅当业务不需要图标时）**

```javascript
// 在 consume-audit 调用时，将 iconGapCandidates 的 id 加入 consumedIds
const consumedIds = new Set([
  ...renderedLayerIds,
  ...renderGapsReport.iconGapCandidates.map(c => c.id),  // ← 标记为"已确认缺口"
])
```

⚠️ **注意**：`iconGapCandidates` 是**提示，不是错误**，不影响页面其他部分的渲染。但如果设计稿里有明显图标而页面空白，用户一定会发现，请优先用方案 A 处理。

---

### 3.5 字段：`summary` / `counts`

**含义**：各类问题的数量汇总，用于**快速判断严重性**，决定哪些字段必须处理、哪些可以推迟。

**读取示例：**

```javascript
const counts = renderGapsReport.counts || renderGapsReport.summary || {}
console.log('渲染缺口统计：', counts)
// 输出示例：{ degenerateBorderPaths: 3, blendHints: 2, duplicateTextGroups: 5, iconGapCandidates: 4 }
```

**严重性判断规则（必须遵守）：**

| 字段 | 数量 > 0 时 | 处理优先级 |
|------|------------|-----------|
| `degenerateBorderPaths` | **必须处理**，否则大色块遮挡内容 | 🔴 阻断 |
| `blendHints` | **必须处理**，否则黑/白底突兀 | 🔴 阻断 |
| `duplicateTextGroups` | **建议处理**，否则文字叠影 | 🟡 强烈建议 |
| `iconGapCandidates` | **可选处理**，根据业务要求 | 🟢 可选 |

---

## Section 4：`_chart_zones.json` / `chartZones.json` 字段 → Index.vue 代码

> **推荐**：用 `scripts/gen-chart-zones.mjs` 从 `_render_gaps_report.json` + `chartPanels.json` 自动生成（规则 67），产出含 `excludeLayerIds` 的完整 zone 定义。手工维护仅作微调。

```bash
node <skill>/scripts/gen-chart-zones.mjs <dataDir> --panels chartPanels.json --out chartZones.json
```

### Step 1：构建排除集合

图表区域的**静态切片层**（假柱、网格线等）必须从 `renderItems` 里排除，由 ECharts 替代渲染。

```javascript
import chartZones from './data/_chart_zones.json'

// 构建排除集合（在 created 或 setup 里执行一次）
const chartExcludeIds = new Set()
for (const z of chartZones.zones || []) {
  for (const id of z.excludeLayerIds || []) {
    chartExcludeIds.add(id)
  }
}
```

**在 `renderItems` 中使用：**

```javascript
// ② 图表区排除（放在退化检查之后）
if (chartExcludeIds.has(layer.id)) continue  // 跳过，ECharts 负责渲染
```

⚠️ **注意**：`excludeLayerIds` 里可能同时包含假柱、假网格线、假图例等多种层的 id。全部都要排除，不要只排除假柱。

---

### Step 2：构建 chartOverlays

ECharts 图表需要一个绝对定位的 `<div>` 容器，坐标直接来自 `_chart_zones.json` 的 `rect` 字段。

```javascript
computed: {
  chartOverlays() {
    return (chartZones.zones || [])
      .filter(z => z.confidence === 'high')  // 只渲染高置信度图表区
      .map(z => ({
        key: z.id,
        chartType: z.chartType,  // 'bar' | 'line' | 'pie' | 'radar' 等
        zone: z,
        style: {
          position: 'absolute',
          left: `${z.rect.x}px`,
          top: `${z.rect.y}px`,
          width: `${z.rect.w}px`,
          height: `${z.rect.h}px`,
          zIndex: 1500,
        }
      }))
  }
}
```

**模板中渲染 ECharts 容器：**

```html
<div
  v-for="overlay in chartOverlays"
  :key="overlay.key"
  :ref="'chart-' + overlay.key"
  :style="overlay.style"
></div>
```

**在 `mounted` 里初始化 ECharts：**

```javascript
mounted() {
  this.$nextTick(() => {
    this.chartOverlays.forEach(overlay => {
      const el = this.$refs['chart-' + overlay.key]
      if (!el) return
      const chart = echarts.init(el)
      const rawOption = this.buildChartOption(overlay)
      const option = resolveGradients(rawOption)
      chart.setOption(option)
      this.chartInstances.push(chart)
    })
  })
},
beforeDestroy() {
  this.chartInstances.forEach(c => c.dispose())
  this.chartInstances = []
}
```

---

### Step 3：`needsConfirm` 置信度处理

```javascript
// 低置信度图表区（confidence === 'needsConfirm'）
// 不要直接渲染，需要人工裁决
const needsConfirm = (chartZones.zones || []).filter(z => z.confidence === 'needsConfirm')
if (needsConfirm.length > 0) {
  console.warn('以下图表区需要人工确认是否为真实图表：', needsConfirm.map(z => z.id))
  // 人工检查后，将确认为图表的加到 high，不是图表的从 excludeLayerIds 中移除
}
```

---

### Step 4：ECharts gradient 转换

`_chart_zones.json` 中的颜色渐变是占位对象 `{ __gradient: 'v', stops: [from, to] }`，必须在 `mounted` 里转换为真实的 `echarts.graphic.LinearGradient`。

```javascript
import * as echarts from 'echarts'

function resolveGradients(option) {
  const resolve = (v) => {
    if (v && v.__gradient === 'v') {
      return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: v.stops[0] },
        { offset: 1, color: v.stops[1] },
      ])
    }
    if (v && v.__gradient === 'h') {
      return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: v.stops[0] },
        { offset: 1, color: v.stops[1] },
      ])
    }
    return v
  }

  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return obj
    if (obj.__gradient) return resolve(obj)
    if (Array.isArray(obj)) return obj.map(walk)
    const out = {}
    for (const k of Object.keys(obj)) out[k] = walk(obj[k])
    return out
  }

  return walk(option)
}

// 使用示例（在 mounted 的 initChart 中）：
const rawOption = buildOption(zone)   // buildOption 来自 templates/echarts/index.mjs
const option = resolveGradients(rawOption)
chart.setOption(option)
```

⚠️ **注意**：如果不转换，ECharts 会把 `{ __gradient: 'v', stops: [...] }` 当普通对象处理，渐变不生效，柱子或折线变成默认蓝色。

---

## Section 5：renderItems 过滤顺序（必须按此顺序）

**顺序错误会导致某些过滤失效或性能变差。**

```javascript
renderItems() {
  const textKeys = new Set()  // 文字去重 Set，每次 computed 重置
  const items = []

  for (const layer of this.layerStack) {

    // ① 最先：退化描边路径（最廉价的检查，提前退出）
    //    原因：不检查就渲染，会出现大色块遮挡所有内容
    if (degenerateIds.has(layer.id)) continue

    // ② 图表区静态层排除（整体排除，不拆分处理）
    //    原因：图表区的所有静态层（假柱/假网格/假图例）必须整体排除，
    //          如果某层漏过去，ECharts 渲染后会与静态层叠加
    if (chartExcludeIds.has(layer.id)) continue

    // ③ 按下态切片过滤（名称含 pressed/active/hover 的切片）
    //    原因：MeaXure 导出的按下态切片会遮挡正常态，不应渲染
    const PRESSED_RE = /pressed|:active|\.active|hover/i
    if (layer.kind === 'slice-file' && PRESSED_RE.test(layer.name)) continue

    // ④ 蒙版形状过滤（名称含 mask 的 shape 层）
    //    原因：蒙版形状只在 Sketch 里用于裁剪，渲染到 HTML 里无意义，
    //          且可能出现意外的遮挡
    const MASK_RE = /^mask$/i
    if (layer.kind === 'vector' && MASK_RE.test(layer.name)) continue

    // ⑤ 矢量层的退化描边检测（补充 degenerateIds 的二次保障）
    //    原因：部分退化层可能 id 未被 _render_gaps_report 捕获，
    //          通过几何判断兜底：border 厚度 > 元素尺寸的一半即退化
    if (layer.kind === 'vector') {
      const css = (layer.css || []).join(' ')
      const borderMatch = css.match(/border:\s*(\d+)px/)
      if (borderMatch) {
        const borderPx = parseInt(borderMatch[1])
        const minDim = Math.min(layer.rect.w, layer.rect.h)
        if (borderPx > minDim / 2) continue  // 退化
      }
    }

    // ⑥ 切片层：应用 blend 模式（不提前退出，继续正常渲染，只是加样式）
    //    原因：blend 是样式修改，不是跳过，放在过滤之后处理
    //    （实际的 blendMap 应用在 buildLayerStyle 里，此处只是顺序说明）

    // ⑦ 文字层：去重（只对 text 层做）
    //    原因：文字去重需要收集 content+坐标 key，只对 text 层做；
    //          放在最后是因为前面已排除了大部分不需要的层
    if (layer.kind === 'text') {
      const content = layer.content || ''
      const key = `${content}|${Math.round(layer.rect.x / 4)}|${Math.round(layer.rect.y / 4)}`
      if (textKeys.has(key)) continue
      textKeys.add(key)
    }

    items.push(layer)
  }
  return items
}
```

---

## Section 6：CDP 浏览器验证配方

> 目标：**用代码验证像素对齐，不靠肉眼截图**。以下代码可直接粘贴到浏览器 DevTools Console 运行。

---

### 验证 1：检查画板尺寸是否正确

```javascript
// 粘贴到 DevTools Console
const board = document.querySelector('.d2v-board')
if (board) {
  const r = board.getBoundingClientRect()
  console.log('board rect:', r.width, 'x', r.height)
  // 期望：接近 BOARD_W * scale × BOARD_H * scale
  // 如果宽度是 0 或远小于期望，说明 scale 计算错误或父容器 overflow:hidden 截断了
} else {
  console.error('找不到 .d2v-board，检查模板 class 名是否正确')
}
```

---

### 验证 2：检查特定元素的绝对位置

```javascript
// 将 'your-layer-id' 替换为 _layer_stack.json 中某层的 id
const layerId = 'your-layer-id'
const el = document.querySelector(`[data-layer-id="${layerId}"]`)
if (el) {
  const r = el.getBoundingClientRect()
  // 获取当前 scale（从根板子的 transform 读取）
  const board = document.querySelector('.d2v-board')
  const match = board && getComputedStyle(board).transform.match(/matrix\(([^,]+)/)
  const scale = match ? parseFloat(match[1]) : 1
  console.log(`设计稿坐标（换算后）: x=${r.left / scale}, y=${r.top / scale}`)
  // 与 _layer_stack.json 里对应层的 rect.x, rect.y 对比，偏差应 < 2px
} else {
  console.warn('元素未找到，检查是否已在模板里加 :data-layer-id="layer.id"')
}
```

---

### 验证 3：检查 mix-blend-mode 是否生效

```javascript
// 检查有 blendHints 的切片是否正确应用了 mix-blend-mode
const imgs = document.querySelectorAll('.d2v-board img')
const blendIssues = [...imgs].filter(img => {
  const cs = window.getComputedStyle(img)
  // 这里列举了已知应该有 blend 的图片 alt 或 src 关键字，根据项目修改
  const shouldHaveBlend = /雷达图|黑底|白底|编组\s*\d/.test(img.alt || img.src)
  return shouldHaveBlend && cs.mixBlendMode === 'normal'
})
if (blendIssues.length > 0) {
  console.error('以下图片 blend 未生效：', blendIssues.map(img => img.src))
} else {
  console.log('blend 检查通过')
}
```

---

### 验证 4：检查 ECharts 是否已初始化（图表区不为空白）

```javascript
// 检查 ECharts canvas 数量
const chartDivs = document.querySelectorAll('.d2v-board canvas')
console.log('ECharts canvases found:', chartDivs.length)
// 期望：>= _chart_zones.json 中 confidence==='high' 的 zones 数量
// 如果是 0，说明 mounted 里的 echarts.init 没有执行，或 ref 没找到对应 DOM

// 进一步检查：看每个 canvas 的父容器尺寸
chartDivs.forEach((canvas, i) => {
  const parent = canvas.parentElement
  const r = parent.getBoundingClientRect()
  console.log(`chart-${i}: parent ${r.width}x${r.height}`)
  // 如果 width 或 height 是 0，说明坐标计算有问题
})
```

---

### 验证 5：检查渲染层总数

```javascript
// 统计画板内的渲染元素数
const layers = document.querySelectorAll('.d2v-board > img, .d2v-board > div, .d2v-board > span')
console.log('rendered layers:', layers.length)
// 与 _layer_stack.json 的总条数 - 已过滤条数 对比
// 如果差距很大（>10），说明某个过滤条件过于激进或某类层没有被渲染
```

---

### 验证 6：检查文字叠影（同坐标多个文字元素）

```javascript
// 检查是否有同位置的重复文字
const texts = [...document.querySelectorAll('.d2v-board [data-kind="text"], .d2v-board span')]
const posMap = {}
texts.forEach(t => {
  const r = t.getBoundingClientRect()
  const key = `${Math.round(r.x)},${Math.round(r.y)}`
  posMap[key] = (posMap[key] || 0) + 1
})
const dups = Object.entries(posMap).filter(([, v]) => v > 1)
if (dups.length > 0) {
  console.error('发现文字叠影位置：', dups)
  // 对每个重复位置，检查对应的文字内容
  dups.forEach(([pos]) => {
    const [x, y] = pos.split(',').map(Number)
    const dupsAt = texts.filter(t => {
      const r = t.getBoundingClientRect()
      return Math.abs(r.x - x) < 2 && Math.abs(r.y - y) < 2
    })
    console.log(`位置 ${pos} 的重复文字：`, dupsAt.map(t => t.textContent?.trim()))
  })
} else {
  console.log('无文字叠影，通过')
}
```

---

### 使用 Cursor IDE browser MCP 工具运行相同验证

在 Cursor IDE 中，可以通过 MCP browser 工具执行相同的验证，无需手动打开 DevTools：

```
// 在 Cursor Chat 里对 AI 说：
// "用 browser CDP 工具执行以下验证并返回结果"

// 1. 检查画板尺寸
browser_cdp: Runtime.evaluate
  expression: "document.querySelector('.d2v-board')?.getBoundingClientRect()"
  returnByValue: true

// 2. 检查 ECharts 数量
browser_cdp: Runtime.evaluate
  expression: "document.querySelectorAll('.d2v-board canvas').length"
  returnByValue: true

// 3. 文字叠影检查（复制上方验证 6 的完整代码）
browser_cdp: Runtime.evaluate
  expression: "<验证 6 的代码>"
  returnByValue: true
```

⚠️ **注意**：MCP browser 工具执行 CDP 时，确保页面已完全加载（ECharts 初始化是异步的，需等待 `mounted` 完成后再执行验证 4）。

---

## Section 7：常见故障排查表

| 现象 | 最可能原因 | 检查方法 | 修复 |
|------|-----------|---------|------|
| 页面空白 | `BOARD_W/H` 错误或 `scale=0` | `console.log(this.scale)` 和 `this.stageW` | 检查 `$refs.viewport` 的实际宽度；确认 `ResizeObserver` 已绑定 |
| 大色块遮挡内容 | 退化描边路径未过滤 | 查看 `_render_gaps_report.degenerateBorderPaths` 数量 | 加 `degenerateIds.has(layer.id)` 过滤（Section 5 第①步）|
| 黑框 / 白块浮在图上 | blend 未应用 | 查看 `_render_gaps_report.blendHints` 数量；用验证 3 检查 | 加 `blendMap[layer.id]` 混合模式（Section 3.2）|
| 图表区空白（无图表） | ECharts 未初始化 | 用验证 4 检查 canvas 数量 | 确认 `mounted` 里 `echarts.init` 已执行；检查 `$refs['chart-xxx']` 是否取到 DOM |
| 图表区只有静态层（假柱） | `excludeLayerIds` 未加入 `chartExcludeIds` | 对比 `_chart_zones.json` 的 `excludeLayerIds` 与 `renderItems` 的过滤 | 补充 `chartExcludeIds` 的填充逻辑（Section 4 Step 1）|
| 文字叠影（加粗感） | 多画板合并后重复文字未去重 | 用验证 6 检查同坐标文字 | 实现 `textKeys` Set 去重（Section 3.3）|
| ECharts 颜色是纯色而非渐变 | `__gradient` 占位未转换为真实 `LinearGradient` | 检查 `chart.getOption()` 里的 color 字段 | 在 `chart.setOption` 前调用 `resolveGradients`（Section 4 Step 4）|
| 内容整体偏右/偏下 | `CONTENT_SHIFT_X/Y` 设置错误 | 用验证 2 对比某已知元素的坐标 | 从 `_host_layout_hint.json` 重新读取 `contentShift` |
| 路由 404 | 路由注册方式错误（嵌入 vs 顶层） | 检查 `routerInfo.js` 里此页面的路由定义 | 嵌入 BasicLayout 用 `children` 嵌套路由；全屏用顶层路由（二者不混用）|
| 渲染层数远少于期望 | 某个过滤条件过于激进（如 PRESSED_RE 误匹配正常层） | `console.log` 每个 `continue` 的命中数 | 缩窄正则或改为精确匹配，逐步排查 |
| consume-audit ok===false | 某些层既未渲染也未标记跳过 | 运行 `node scripts/consume-audit.mjs` 看输出的 `unkeptIds` | 将这些 id 明确加入渲染或加入 `consumedIds`（acknowledge） |

---

## 自检：低能力模型读完本文，能否确切知道该写什么？

读完本文后，以下问题应能回答：

- [x] `degenerateBorderPaths` → 建 `Set<id>` → 在 `renderItems` 第一步 `if has continue`
- [x] `blendHints` → 建 `Map<id, mode>` → 在 `buildLayerStyle` 对 `slice-file` 加 `mixBlendMode`
- [x] `duplicateTextGroups` → 建 `Set<content|x|y>` → 在 `renderItems` 对 `text` 层 `if has continue`
- [x] `iconGapCandidates` → 建 `_icon_gap_overlays.json` → 渲染 `iconGapLayers`
- [x] `chartZones.zones[*].excludeLayerIds` → 建 `chartExcludeIds Set` → 在 `renderItems` 第二步 `if has continue`
- [x] `chartZones.zones[*].rect` → 构建 `chartOverlays` computed → `mounted` 里 `echarts.init`
- [x] `__gradient` 占位 → `resolveGradients()` → `chart.setOption(option)` 前调用
- [x] 过滤顺序：① degenerate → ② chartExclude → ③ pressed → ④ mask → ⑤ vector degenerate → ⑥ blend style → ⑦ text dedupe
- [x] 验证方法：6 条 CDP 配方，可直接粘贴 DevTools 运行
