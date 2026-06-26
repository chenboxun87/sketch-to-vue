# ECharts 图表特征提取与重绘作战手册

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

> **适用场景**：A 轨道（Sketch MeaXure）大屏/驾驶舱页面，含静态假图表需替换为 ECharts。  
> **设计目标**：低阶 AI 照单执行 10 步即可达到足够好的还原效果；高阶 AI 可在步骤 7 深化配色和数据。

---

## 0. 五步流水线概览

```
① 识别假图表  →  ② 填 chartPanels.json  →  ③ 生成 chartZones.json
      ↓
④ 排除静态层  →  ⑤ 初始化 ECharts + 挂 option
```

每步都有明确的输入/输出文件和可运行命令。**禁止跳步**。

---

## 1. 识别假图表（人工 + 自动）

### 1.1 自动检测

```bash
# 先确保 _all_elements.json 和 _layer_stack.json 已生成
node <skill>/scripts/extract-all-elements.mjs <index.html> <assetsDir> <outDir>

# 读 _render_gaps_report.json，查 fakeBarShapes 数组
node -e "
const r = require('./<outDir>/_render_gaps_report.json')
console.log('假柱数量:', r.fakeBarShapes?.length)
r.fakeBarShapes?.slice(0,5).forEach(b =>
  console.log('  ', b.name, JSON.stringify(b.rect))
)
"
```

### 1.2 视觉识别（看设计稿截图，7 问决策树）

**问题序列**：

```
Q1: 区域内是否有等距小矩形 w≤18, h≥30（即假柱）？
  └─ 是 → Q2，否 → Q4

Q2: 每个 x 位置有几根不同颜色的柱？
  ├─ ≥2根不同色 → chartType = "groupBar"（多系列分组柱）
  └─ 1根（含渐变）→ chartType = "bar"（单系列柱图）

Q3: 柱图是否两侧 Y 轴（双轴）？
  └─ 是 → chartType = "dualAxisBar"

Q4: 是否有多边形线条区域 + 多个维度文字？
  └─ 是 → chartType = "radar"（雷达图，通常已是 png 切片，慎建 zone）

Q5: 是否有节点 + 流向曲线连接（能量流/资金流）？
  └─ 是 → chartType = "sankey"

Q6: 是否有折线 + 半透明面积填充？
  ├─ 仅 1 条线 → chartType = "area"
  ├─ 恰好 2 条颜色明显不同的线 → chartType = "dualLine"
  └─ 3 条或以上不同色线 → chartType = "multiLine"

Q7: 是否有圆形/扇形/环形？
  └─ 是 → chartType = "pie"

以上均否 → 不建 zone（是静态卡片或数据表格）
```

### 1.3 静态区域识别（禁止建 zone）

| 视觉特征 | 结论 |
|---------|------|
| 文字整齐排列成行列（表头+数据行） | 静态数据表，不建 zone |
| 只有 icon 图标 + 数字，无坐标轴 | 静态 KPI 卡片，不建 zone |
| 圆形进度条 + 中心固定文字 | 静态装饰，不建 zone |
| 雷达图已是 png 切片（非假柱组成） | 静态切片，不建 zone |

---

## 2. 填写 chartPanels.json（全字段参考）

`chartPanels.json` 是驱动整个图表区生成的配置文件，由人工（或 AI 分析设计稿后）填写。

### 2.1 字段说明

```jsonc
{
  "panels": [
    {
      // ─── 必填 ────────────────────────────────────────
      "id": "chart-panel-a",            // zone 的唯一 ID（CSS 兼容，用于 $refs/key）
      "titles": ["Panel Title Text"],   // _all_elements.json 里的 section 标题文字（用于锚定）
      "left": 138,                      // 画板 x 坐标（面板左边界）
      "width": 780,                     // zone 的像素宽度（不是面板整宽，是图表绘图区宽度）
      
      // ─── 强烈推荐填 ──────────────────────────────────
      "chartType": "groupBar",          // 见 §1.2 决策树；填错等于零还原度
      "zoneHeight": 320,                // 图表绘图区高度（不含标题/卡片/表格区）
      
      // ─── 可选 ────────────────────────────────────────
      "top": null,                      // 若不填：自动从标题文字 y + TITLE_HEIGHT 计算
      "palette": ["#00EAFF","#00C9A7"], // 从设计稿假柱颜色提取；不填则用主题默认色
      "categories": ["Jan","Feb","Mar"],// X 轴类目；不填则从元素文字自动提取
      "seriesNames": ["Series A","B"],  // 图例系列名；不填则用自动提取或占位符
      "yUnit": "万tCO₂",               // Y 轴单位（如有）
      "yMax": 500,                      // Y 轴最大值（如有刻度可反推）
      "keepLayerRe": "编组\\d+备份"     // 追加到 KEEP_IN_ZONE_RE，保留面板背景切片
    }
  ]
}
```

### 2.2 width/zoneHeight 边界规则（最重要）

```
规则：zone 的 width 和 zoneHeight 只能覆盖【纯图表绘图区】，
      右侧/下方若有静态内容（表格、KPI 卡片、icon 行），zone 必须止步于静态内容起始前。

检验方法：
  1. 对照设计稿截图，找到图表网格的右边界 x_right 和下边界 y_bottom
  2. width = x_right - left（不是面板整宽）
  3. zoneHeight = y_bottom - (titleY + TITLE_HEIGHT)（不含标题区）
  4. 如果面板内有"图表(ECharts) + 数据表格"两个子区域 → 只为图表部分建 zone，
     width 止步于表格左边界前
```

---

## 3. 生成 chartZones.json

```bash
# 标准命令（extract-chart-features.mjs）
node <skill>/scripts/extract-chart-features.mjs <dataDir> <chartPanels.json>
# 产出：<dataDir>/_chart_zones.json

# 验证：检查每个 zone 没有意外包含静态 slice 层
node -e "
const cz = require('./<dataDir>/_chart_zones.json')
const ls = require('./<dataDir>/_layer_stack.json')
const layers = Array.isArray(ls) ? ls : ls.layers
cz.zones.forEach(z => {
  const r = z.rect
  const covered = layers.filter(l => {
    const cx = l.rect.x + l.rect.w / 2, cy = l.rect.y + l.rect.h / 2
    return l.source?.kind === 'slice-file' &&
      cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
  })
  if (covered.length > 0) console.warn('zone', z.id, '覆盖了', covered.length, '个静态切片')
  else console.log('zone', z.id, '✓')
})
"
```

### 3.1 chartZones.json 结构（完整字段）

```jsonc
{
  "zones": [
    {
      "id": "chart-panel-a",           // CSS-safe 唯一 ID
      "title": "Panel Title Text",     // 对应的标题文字
      "chartType": "groupBar",         // 图表类型
      "confidence": "high",            // high | low
      "needsConfirm": false,
      "rect": { "x": 138, "y": 240, "w": 780, "h": 320 },  // 绘图区画板坐标
      "axis": { "yLeft": { "max": 500, "interval": 100, "unit": "万tCO₂" } },
      "categories": ["Jan","Feb","Mar","Apr"],
      "legend": [                      // 图例系列（name + color）
        { "name": "Series A", "color": "#00EAFF" },
        { "name": "Series B", "color": "#00C9A7" }
      ],
      "series": [],                    // 实际数据（目前为 mock）
      "sankey": null,                  // sankey 类型专用
      "radar": null,                   // radar 类型专用
      "palette": ["#00EAFF","#00C9A7"],
      "excludeLayerIds": ["layer-id-1","layer-id-2"]  // 需从 layer_stack 排除的层 ID
    }
  ]
}
```

---

## 4. 排除静态层 + 保留面板背景

### 4.1 核心逻辑（buildBoardRenderPlan 中）

```javascript
import chartZonesData from './data/chartZones.json'

const chartZones   = chartZonesData.zones || []
const chartExcludeIds = new Set(chartZones.flatMap(z => z.excludeLayerIds || []))

// 面板背景/装饰切片白名单（正则，命中则永不排除）
// 根据实际设计稿中的面板背景层名称调整
const KEEP_IN_ZONE_RE = /编组\s*\d+备份|编组\s*\d+$|背景|BG备份|panel.?bg|frame.?bg/i

function overlapsChartZone(rect, zones) {
  if (!rect || !zones.length) return false
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2
  return zones.some(z => {
    const r = z.rect
    return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
  })
}

function isSketchClipMask(layer) {
  // Sketch 裁剪蒙版：导出为纯白 vector-css，不是可见元素（规则 68）
  if (!layer.name || !/^蒙版/.test(layer.name)) return false
  if (layer.source?.kind !== 'vector-css') return false
  const css = (layer.source?.css || []).join(' ')
  return /background\s*:\s*#[Ff]{3,6}\b|background\s*:\s*rgba?\(\s*255[\s,]/.test(css)
}

function shouldExclude(layer) {
  // ① 白名单最优先（规则 71：白名单必须先于 excludeIds 检查）
  if (KEEP_IN_ZONE_RE.test(layer.name || '')) return false
  // ② 精确排除（由 gen 脚本生成）
  if (chartExcludeIds.has(layer.id)) return true
  // ③ 几何中心兜底（捕漏）
  return overlapsChartZone(layer.rect, chartZones)
}

// 主循环最早处加过滤
for (const layer of layers) {
  if (isSketchClipMask(layer)) continue          // 规则 68
  if (shouldExclude(layer)) continue             // 规则 71 + 33
  // ... 正常渲染逻辑
}
```

### 4.2 KEEP_IN_ZONE_RE 维护规则

```
每次定义新 zone 后必须检查 zone 区内的所有 slice-file 层：
  1. 列出 zone rect 内的所有层：
     layers.filter(l => overlapsChartZone(l.rect, [zone]) && l.source?.kind === 'slice-file')
  2. 如果有面板背景切片（名字通常是「编组 X备份」「编组 X」「背景」），
     把它加入 KEEP_IN_ZONE_RE
  3. 只有「图例色块」「假柱」「轴线/刻度切片」才应被排除（不加白名单）
```

---

## 5. parseCssArray 尾分号剥离（规则 66）

**症状**：vector-css 层渐变背景全部消失，页面面板背景变透明。

```javascript
// ⛔ 错误：MeaXure 输出 "background-image: linear-gradient(...);", 末尾带分号
// ✅ 正确：必须剥离尾分号 + 替换 NaNpx
function parseCssArray(cssArr) {
  const style = {}
  for (const line of cssArr || []) {
    const m = line.match(/^([\w-]+)\s*:\s*(.+)$/)
    if (!m) continue
    const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    let val = m[2].trim()
      .replace(/;\s*$/, '')      // 剥离尾分号（规则 66）
      .replace(/\bNaNpx\b/g, '0') // 修复 NaNpx
    style[key] = val
  }
  return style
}
```

---

## 6. Vue 2 ECharts 初始化标准模板

### 6.1 Index.vue 模板（transform:scale 大屏模式）

```html
<!-- 图表区宿主（z-index 高于静态层） -->
<div
  v-for="zone in chartZonesList"
  :key="zone.id"
  :ref="`chart-${zone.id}`"
  class="d2v-chart-host"
  :style="{
    position: 'absolute',
    left: zone.rect.x + 'px',
    top: zone.rect.y + 'px',
    width: zone.rect.w + 'px',
    height: zone.rect.h + 'px',
    zIndex: 200,
    overflow: 'hidden',
    pointerEvents: 'none'
  }"
/>
```

```javascript
import * as echarts from 'echarts'
import chartZonesRaw from './data/chartZones.json'
import { buildChartOptionsMap } from './chartOptions'

export default {
  data() {
    return {
      chartZonesList: chartZonesRaw.zones || [],
      chartInstances: {},
    }
  },

  mounted() {
    this.$nextTick(() => this.initChartZones())
  },

  beforeDestroy() {
    Object.values(this.chartInstances).forEach(c => c?.dispose())
    this.chartInstances = {}
  },

  methods: {
    initChartZones() {
      const optionsMap = buildChartOptionsMap()
      this.chartZonesList.forEach(zone => {
        const refKey = `chart-${zone.id}`
        const dom = this.$refs[refKey]
        const el = Array.isArray(dom) ? dom[0] : dom
        if (!el) return

        // 规则 72：transform:scale 大屏必须显式传 width/height 给 echarts.init
        // 否则 ECharts 自测 DOM 尺寸与 scale 后视觉不符
        const r = zone.rect
        el.style.width  = r.w + 'px'
        el.style.height = r.h + 'px'
        const chart = echarts.init(el, null, { width: r.w, height: r.h })
        const option = resolveGradients(optionsMap[zone.id])
        if (option) chart.setOption(option, true)
        this.chartInstances[zone.id] = chart
      })
    },

    // 规则 72 续：transform:scale 整体缩放，ECharts 不需要 resize
    // resizeCharts() { /* 不调用 chart.resize() */ }
  }
}
```

### 6.2 ECharts LinearGradient 转换（Vue 消费侧）

`templates/echarts/index.mjs` 中 `vGradient` 返回 `{__gradient:'v', stops:[from,to]}`，
Vue 组件中必须在调用 `setOption` 前转换：

```javascript
function resolveGradients(option) {
  if (!option) return null
  const json = JSON.stringify(option)
  const resolved = JSON.parse(json, (key, value) => {
    if (value && typeof value === 'object' && value.__gradient === 'v') {
      const [from, to] = value.stops
      return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: from },
        { offset: 1, color: to },
      ])
    }
    return value
  })
  return resolved
}
```

---

## 7. chartOptions.js 标准骨架

```javascript
// chartOptions.js（项目内，与 Index.vue 同目录）
import * as echarts from 'echarts'
import { buildOption } from '<skill>/templates/echarts/index.mjs'
import chartZonesRaw from './data/chartZones.json'

// ── 按 zone.id 精确分发（优先）——-----------------------------------------
// 当某个 zone 的视觉特征需要超出模板的定制时，在此添加对应函数
const ID_DISPATCH = {
  // 'chart-panel-a': myCustomGroupBarOption,
}

// ── ECharts 调色板（从设计稿假柱/图例色提取，优先于主题默认色）──────────────
// 使用 §8 颜色提取方法获得下面的值
const PALETTE = [
  '#00EAFF', '#00C9A7', '#F5C542', '#FF6B6B',  // 替换为实际项目色
]

export function buildChartOptionsMap() {
  const options = {}
  ;(chartZonesRaw.zones || []).forEach(zone => {
    // 注入调色板（优先使用 zone 自带 palette，否则用全局 PALETTE）
    const zoneWithPalette = { ...zone, palette: zone.palette || PALETTE }

    // ID 精确分发 → 模板兜底
    const customFn = ID_DISPATCH[zone.id]
    options[zone.id] = customFn
      ? customFn(zoneWithPalette)
      : buildOption(zoneWithPalette)
  })
  return options
}
```

---

## 8. 颜色提取程序（从设计稿假柱/图例）

不靠视觉猜测——从 `_layer_stack.json` 的 shape 层 CSS 提取：

```javascript
// 提取 zone 内假柱的颜色序列
function extractZonePalette(layers, zoneRect) {
  const bars = layers.filter(l => {
    if (!l.rect || l.source?.kind !== 'vector-css') return false
    const r = l.rect
    // 假柱尺寸特征：宽 4-18px，高 ≥30px
    if (r.w < 4 || r.w > 18 || r.h < 30) return false
    // 中心在 zone 内
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2
    const zr = zoneRect
    return cx >= zr.x && cx <= zr.x + zr.w && cy >= zr.y && cy <= zr.y + zr.h
  })

  const colors = []
  for (const bar of bars) {
    const css = (bar.source?.css || []).join(' ')
    // 纯色
    const solidM = css.match(/background\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/)
    if (solidM && !colors.includes(solidM[1])) {
      colors.push(solidM[1])
    }
    // 渐变（取起始色）
    const gradM = css.match(/linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/)
    if (gradM && !colors.includes(gradM[1])) {
      colors.push(gradM[1])
    }
  }
  return colors.slice(0, 6)  // 最多 6 色
}
```

---

## 9. 模板 buildOption 消费指南（8 种图表类型）

| `chartType` | 模板函数 | 必须在 zone 提供的字段 | mock 数据说明 |
|-------------|---------|----------------------|--------------|
| `bar` | `barOption(z, false)` | `categories`, `series[].data` | 数组填伪随机整数 |
| `dualAxisBar` | `barOption(z, true)` | `categories`, `series[].yAxisIndex`, `axis.yLeft/yRight` | 两系列 yAxisIndex 0/1 |
| `groupBar` | `groupBarOption(z)` | `categories`, `series[]{name,color,data}` | 每系列独立颜色 |
| `line` | `lineOption(z, false)` | `categories`, `series[]{name,color,data}` | - |
| `area` | `lineOption(z, true)` | `categories`, `series[]{name,color,data}` | 自动加面积渐变 |
| `dualLine` | `dualLineOption(z)` | `categories`, `series` 恰好 2 条 | 第 2 条用虚线 |
| `multiLine` | `multiLineOption(z)` | `categories`, `series` 3+ 条 | 无面积填充 |
| `radar` | `radarOption(z)` | `radar.indicators[]`, `series[].data` | indicators 从文字提取 |
| `sankey` | `sankeyOption(z)` | `sankey.nodes[]`, `sankey.links[]` | nodes/links 从节点文字推断 |
| `pie` | `pieOption(z)` | `series[0].data[]` | {name,value} 数组 |

### Mock 数据填充规范

```javascript
// 当无法从设计稿反推真实数值时，用以下 mock 策略：
// 1. 柱图：各柱高度比例视觉近似（不要全等高）
// 2. 折线：呈现趋势感（不全平线）
// 3. 桑基：从设计稿节点文字列出 nodes，links 按视觉走向猜
// 4. 雷达：各维度赋 0.6–0.9 之间不等的比例值

// 示例：6 个类目的模拟柱图数据
const mockBarData = (n) => Array.from({length:n}, (_, i) =>
  Math.round(100 + Math.sin(i * 1.3) * 60 + i * 15)
)
```

---

## 10. 调试自检清单（出问题先逐条排查）

```
□ 1. chartPanels.json 的 id 字段与 chartZones.json 的 zone.id 一致？
□ 2. zone.rect 的 x/y/w/h 是否覆盖了相邻静态内容？（见 §2.2）
□ 3. KEEP_IN_ZONE_RE 是否包含了面板背景切片的名称？（见 §4.2）
□ 4. shouldExclude 中白名单是否在 excludeIds 之前检查？（规则 71）
□ 5. 是否有 isSketchClipMask 过滤 "蒙版" + 白色 vector-css？（规则 68）
□ 6. parseCssArray 是否剥离了尾分号？（规则 66）
□ 7. echarts.init 是否显式传了 width/height？（规则 72）
□ 8. setOption 前是否调用了 resolveGradients() 转换 __gradient？（见 §6.2）
□ 9. 图表容器是否设了足够高的 z-index（>静态层）+ overflow:hidden？
□ 10. 跨画板资产（artboard1/scene-graph.json）是否已单独检查并手动合入？（规则 70）
□ 11. 页面是否「只有 BG + 括号 + ECharts」？→ 见 §11 空页面分诊
□ 12. 交付前是否跑过 `verify-board-render-plan.mjs` 且 exit 0？（规则 74/76）
```

---

## 11. 空页面分诊（仅背景 + 括号 + 图表）

> 完整规则见 `hard-won-rules.md` 规则 74–76。本节供低阶模型逐步执行。

### 11.1 典型症状

- 全屏背景、硬编码括号装饰正常
- ECharts 六个 zone 正常
- **缺失**：所有 KPI 文字、面板渐变、中心地图切片、icon 缺口补图

### 11.2 第一步：Console 与 verify 脚本

```bash
# 必须在 dataDir（含 _layer_stack.json）上跑
node <skill>/scripts/verify-board-render-plan.mjs ./src/pages/<module>/data
```

| 结果 | 含义 | 动作 |
|------|------|------|
| exit **2** + `ReferenceError` / `resolveAssetUrl` | plan 构建抛错 | 检查 boardRender 是否遗留 `getMonitorLayerPublicPath` 等旧函数名（规则 74） |
| exit **1** + `plan too small` | 过滤过狠或未 enrich | 查 chart zone exclude、KEEP_IN_ZONE_RE、enrichTextSource |
| exit **0** 但浏览器仍空 | Vue 侧吞错或渲染顺序错 | Index.vue try/catch 是否 return `[]`；文字是否在 ECharts 之下（规则 75） |

### 11.3 第二步：grep 复制残留

```bash
# 在项目 boardRender / Index.vue 中应为 0 命中
rg "getMonitorLayerPublicPath|getCockpitLayerPublicPath|getProjectALayerPath" src/pages/<module>/
```

### 11.4 第三步：采用共享 boardRender（推荐）

```javascript
// pageDir/boardRender.js — 薄包装，禁止复制 300 行实现
import { buildBoardRenderPlan, indexElements } from '<skill>/templates/shared/boardRender.mjs'
import { getLayerPublicPath } from './layerUrl.js'

export { indexElements }
export function buildPageRenderPlan(opts) {
  return buildBoardRenderPlan({
    ...opts,
    resolveAssetUrl: (file) => getLayerPublicPath(STATIC_BASE, file, resolveStaticPublicUrl),
  })
}
```

### 11.5 Index.vue 渲染顺序模板

```html
<!-- ① slice + vector -->
<template v-for="layer in staticLayers" ... />
<!-- ② ECharts z-index: 5000 -->
<div v-for="zone in chartZones" :style="{ zIndex: 5000, ... }" />
<!-- ③ text z-index: 9000+ -->
<template v-for="layer in textLayers" ... />
```

`created()` 中构建 plan 时：
```javascript
try {
  this.renderLayers = buildPageRenderPlan({ ... })
} catch (e) {
  console.error('[boardRender] buildBoardRenderPlan failed:', e)
  this.renderLayers = []
}
```

---

## 附录 A：快速颜色提取命令

```bash
# 列出 zone 内所有假柱的 CSS background 颜色
node -e "
const ls = require('./<dataDir>/_layer_stack.json')
const layers = Array.isArray(ls) ? ls : ls.layers
// 把 zone rect 替换为实际值
const ZONE = { x: 138, y: 240, w: 780, h: 320 }
layers
  .filter(l => {
    const r = l.rect; if (!r) return false
    const cx = r.x+r.w/2, cy = r.y+r.h/2
    return l.source?.kind==='vector-css' && r.w<=18 && r.h>=30 &&
      cx>=ZONE.x && cx<=ZONE.x+ZONE.w && cy>=ZONE.y && cy<=ZONE.y+ZONE.h
  })
  .forEach(l => {
    const css = (l.source?.css||[]).join(' ')
    const m = css.match(/background\s*:\s*([^;]+)/)
    if (m) console.log(l.name, '->', m[1].trim())
  })
"
```

## 附录 B：KEEP_IN_ZONE_RE 快速扫描命令

```bash
# 列出 zone 区内所有 slice-file 层（用于判断哪些需要加白名单）
node -e "
const ls = require('./<dataDir>/_layer_stack.json')
const layers = Array.isArray(ls) ? ls : ls.layers
const ZONE = { x: 138, y: 240, w: 780, h: 320 }
layers
  .filter(l => {
    const r = l.rect; if (!r) return false
    const cx = r.x+r.w/2, cy = r.y+r.h/2
    return l.source?.kind==='slice-file' &&
      cx>=ZONE.x && cx<=ZONE.x+ZONE.w && cy>=ZONE.y && cy<=ZONE.y+ZONE.h
  })
  .forEach(l => console.log(l.id, l.name, JSON.stringify(l.rect)))
"
```
