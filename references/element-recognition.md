# 元素识别 + Fake Chart 识别

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：datav-dashboard + sketch-meaxure-to-vue（整合）

---

## UI 区域/元素识别特征表

根据切图数据**动态检测**，不要假设页面有几列。

| UI 元素 | 识别特征 | 优先级 |
|---------|---------|--------|
| **顶部标题栏** | 大标题文字 `top < 150`，大字号（≥20px）| 高 |
| **左侧面板** | 大背景 slice 的 `left < 500` | 高 |
| **中间面板** | 大背景 slice 的 `500 ≤ left < 1400` | 高 |
| **右侧面板** | 大背景 slice 的 `left ≥ 1400` | 高 |
| **表格区** | 包含表头文字（14px Medium）+ 数据行（多列对齐文字）| 高 |
| **图表区** | 包含 Y 轴刻度文字（数字垂直排列）+ X 轴时间标签 | 高 |
| **查询输入框** | 矩形背景（`w>150, h≈32`）+ 紧邻左侧文字标签 + 内部文字值 | 高 |
| **日期选择器** | 矩形背景（`w≈220, h≈32`）+ "日期"关键词标签 + 日期格式文字（如 2026-05-20）+ 日历图标组（20×20）| 高 |
| **分页区** | 包含数字按钮（32×32）+ 箭头 + "共有N条" | 中 |
| **统计卡片** | 包含翻牌器数字 + 标签 + 单位 | 中 |
| **排名列表** | 包含序号图标 + 名称 + 数值 + 条形图 | 中 |
| **Tab 切换** | 临近位置上 2-3 个紧挨的文字标签（等宽/等高）| 中 |

---

## 识别结论 → 实现方式映射

| 识别结论 | 实现方式 |
|---------|---------|
| 表格（有分页） | `ls-table` + `ls-pagination`（Vue 2）/ 自定义表格组件（Vue 3） |
| 表格（无分页） | `div` + CSS 样式，不用表格组件 |
| ECharts 图表区 | `Echarts` 组件（Vue 2）/ `ChartBox.vue` + `useECharts`（Vue 3） |
| 查询输入框 | `ls-input`（Vue 2）/ `el-input`（Vue 3）|
| 日期选择器 | `ls-date-picker`（Vue 2）/ `el-date-picker`（Vue 3）|
| 分页 | `ls-pagination`（Vue 2）|
| Tab 切换 | `ls-tabs`（Vue 2）/ 自定义 Tab 组件 |
| 统计卡片数字 | 翻牌器组件 / 普通 `<span>` |
| 排名列表 | `v-for` 列表 + 百分比宽度条形图 |

---

## Fake Chart 识别特征（MeaXure 的 4 种静态假图表）

| 假图表类型 | 源数据中的特征 |
|-----------|-------------|
| **柱状图** | 一排宽度相近（≈6–18px）、高度不同（h≥30）、等距的小 `shape`，带渐变 **或纯色** `background: #399EE6` 等（sampleCockpitV2：纯色假柱更常见） |
| **面积图/折线图** | 一个宽 `<div>` 带 `linear-gradient(0deg, ... 0%, color 100%)` 放在图表底部；上方有匹配颜色的点（图例） |
| **分类图例/饼图** | 多个 `<span>` 带 `transform: rotate(-360deg)`（=0°）+ 多行 `\n` 连接的文字 + 附近 7×7 点状 `<div>`（图例色块）|
| **坐标轴刻度** | `<span>` 行如 `12:00 12:30 13:00`；或垂直 `1500\n1200\n800\n0` 带 `text-align:right` |

> **§3.9 路径**：假柱识别后须 (1) 定义 chart zone (2) `overlapsChartZone` 从 `_layer_stack` **排除**区内 slice/vector/text (3) ECharts 接管。只识别假柱但不排除 stack → 仍会叠影。

---

## Chart Zone 检测（§3.9 优先顺序）

```
1. 标题锚定（推荐）
   在 _all_elements.json 找 section 标题 text（如「功能A趋势」「指标趋势」）
   zone.rect = 标题下方 offset（y + 28px）+ 固定 h（≈280–320px）+ 面板宽

2. 假柱聚类（兜底）
   isFakeBarShape 筛 shape → 按 cx/cy 聚类 → bars.length >= 4 的簇 bounding box + pad

3. 排除规则
   renderLayers 中 slice / vector-css / live-text-* 若 overlapsChartZone(rect) → skip
   保留：卡片背景 slice（通常在 zone 外或 shouldKeep 名单内）
```

`isFakeBarShape` 须同时识别 **gradient 柱** 与 **纯色柱**（w≤18, h≥30, `background: #...`）。

---

## 重复文本识别（composite + fragment）

MeaXure 常对同一数值输出多层 text：`1200tCO2e`（composite）+ `1200` + `tCO2e`（fragments）。

| 模式 | 识别 | 处理 |
|------|------|------|
| 同坐标格 | 相同 `round(y/2)_round(x/2)` | 保留 `content` 最长 |
| 同行重叠 | `|y差|≤2` 且较长 content **包含**较短 且 rect 横向重叠 | 去掉 fragment |

`_render_gaps_report.json` 的 `duplicateTextGroups` 列出候选；Implement 层在 `renderLayers` 合并 texts 后调用 `dedupeTextLayers`。

额外：`color` 字段可能为 `#7AF4FF 100%` → 用 `colorRgba` 或 `normalizeTextColor()` 去尾缀 `%`。

---

## Fake Chart 替换步骤

### 第 1 步：定义图表区域

在 band-relative 坐标中定义区域矩形（left, top, width, height）。

**§3.9 推荐**：优先用 section 标题 text 锚定（见上文「Chart Zone 检测」），比纯假柱聚类更稳（假柱少或纯色柱分散时聚类会失败）。

### 第 2 步：清除区域，保留外框

```javascript
// 按区域过滤，保留关键元素
function isInChartRegion(layer, region) {
  const cx = layer.rect.x + layer.rect.w / 2;
  const cy = layer.rect.y + layer.rect.h / 2;
  return cx >= region.left && cx <= region.left + region.width &&
         cy >= region.top  && cy <= region.top  + region.height;
}

// 保留列表：卡片背景图 + section 标题
const keepList = ['card-bg', 'section-title', 'panel-bg'];
const shouldKeep = (layer) => keepList.some(k => layer.name.includes(k));

// 隐藏区域内的静态元素（不删除，保留布局引用）
const hiddenLayers = layers.filter(l =>
  isInChartRegion(l, chartRegion) && !shouldKeep(l)
);
```

### 第 3 步：嫁接图表容器

在区域盒子的坐标和 z-index 上放置图表容器（ChartBox.vue）。

### 第 4 步：接 mock 数据

```javascript
// mock 数据层：mockFetch 模拟延迟
async function mockFetch(data, delayMs = 800) {
  return new Promise(resolve => setTimeout(() => resolve(data), delayMs));
}

// 使用：与真实 fetch 相同签名，后续直接替换
const chartData = await mockFetch(mockChartData);
this.chartOption = buildChartOption(chartData);
```

### 第 5 步：确认颜色来源

使用从 MeaXure JSON 按坐标提取的精确颜色（见 meaxure-track.md 精确颜色提取），不从截图采样。

### 第 6 步：ECharts 轴与图例处理

ECharts 渲染自己的轴/图例——删除静态的 Y 轴标签 span 和图例色块，不要叠加在 ECharts 上方。

---

## 必须提取的样式信息

| 样式属性 | 用途 |
|---------|------|
| `fontFace`、`fontSize`、`color`、`letterSpacing`、`lineHeight` | 文字样式 |
| `fills` 中的 Gradient 类型（含 `colorStops`）| 渐变色背景/文字 |
| `shadows` 数组中的 `type`、`offset`、`blur` | 阴影 |
| `exportable` 数组中的 `path` | 图片资源路径 |
| `opacity` | 透明度 |
| `rotation` | 旋转角度 |

---

## 图表类型推断签名表（_chart_zones.json，extract-chart-features 产出）

| chartType | 区内签名 | 数据来源 |
|-----------|---------|---------|
| radar | 面板内 jpg/png 多边形切片 + 3–6 维度文字 | indicators 取维度文字；值用 mock |
| sankey | ≥6 个 `border:Npx` 多色描边路径 + 分列节点文字 | nodes 取节点文字；links 用 mock |
| area | 底部 `linear-gradient(...0%,color 100%)` 大 div | 几何反推 |
| line | 折线点序列（点+连线） | 几何反推 |
| dualAxisBar / bar | 等距小柱（w 6–18,h≥30），双侧 Y 轴=dual | 柱高几何反推 |
| groupBar | 每类目 2–4 根循环色小柱（≥12 根总计） | 柱高几何反推 |
| pie / gauge | 环/弧 + 中心数值 | mock |

消费：`import { buildOption } from 'templates/echarts'` → `buildOption(zone)`。
**默认快路径**：直接套模板。**可增强点**：高阶模型深拷贝后局部覆盖或自写 option。
