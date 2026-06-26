# 转译配方手册（Translate Recipe）

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

> **定位**：本文档将 `meaxure-track.md` 阶段 3「静态基线 → 可维护 Vue」的 6 步重构，
> 转化为**机械可执行的配方表**。
>
> 适用范围：A 轨道（Sketch MeaXure）；B 轨道 group 识别逻辑类似。
>
> **前置工具**：运行 `gen-component-skeleton.mjs <outDir>` 产出 `_group_analysis.json`，
> 阅读其 `groups[]` 确定组件清单和骨架代码，再按本手册填充细节。

---

## 使用工作流

```
extract-all-elements → _all_elements.json
       ↓
gen-component-skeleton → _group_analysis.json  （自动，可直接取用骨架）
       ↓
按配方手册逐 pattern 填充细节
       ↓
按 meaxure-track.md 阶段3 Step 2-6 做 CSS/坐标/资源整理
```

---

## 配方索引

| pattern | 触发条件 | 布局 | 主模板 |
|---------|---------|------|--------|
| [kpi-row](#kpi-row-kpi指标行) | 名含 kpi/指标 或 ≥3 等宽子 group | flex-row | KpiRow.vue |
| [list](#list-列表) | 名含 list/列表/排行 或 文字>切片×2 | flex-col | ListPanel.vue |
| [chart-container](#chart-container-图表容器) | 名含 chart/图表/折线/柱状 | absolute | ChartContainer.vue |
| [card](#card-卡片) | 名含 card/卡片/panel/面板 | absolute | CardPanel.vue |
| [title](#title-标题) | 名含 title/标题/header | flex-row | SectionTitle.vue |
| [generic](#generic-通用-group) | 无特征匹配 | absolute/flex | 按实际结构填充 |

---

## kpi-row（KPI指标行）

### 识别特征
- `name` 含 kpi / 指标 / 统计 / 数据卡
- 子 group ≥ 3 个，且各子 group 宽度接近（误差 ≤ 20px）
- 各子 group 通常含 1 个数值文字 + 1 个单位/标签文字

### 骨架模板

```vue
<template>
  <div class="kpi-row" :style="containerStyle">
    <div
      v-for="(item, i) in kpiItems"
      :key="i"
      class="kpi-cell"
    >
      <div class="kpi-value">{{ item.value }}<span class="kpi-unit">{{ item.unit }}</span></div>
      <div class="kpi-label">{{ item.label }}</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'KpiRow',
  props: {
    kpiItems: {
      // [{ label: '指标总量', value: '12,345', unit: 'kWh' }]
      type: Array,
      default: () => [],
    },
  },
  computed: {
    containerStyle() {
      // 取自 _host_decision.json contentShift 与 group rect
      return {
        position: 'absolute',
        left: `${this.groupRect.x - this.shiftX}px`,
        top:  `${this.groupRect.y - this.shiftY}px`,
        width:  `${this.groupRect.w}px`,
        height: `${this.groupRect.h}px`,
      };
    },
  },
};
</script>
```

### 填充清单（必做）

- [ ] 从 `_group_analysis.json` 的 `children` 读取子 group 数量，填 `kpiItems` 初始数组长度
- [ ] 从 `_all_elements.json` 找每个子 group 的文字层，提取 `content`/`fontSize`/`color`
- [ ] 确认 `groupRect`（来自 `_group_analysis.json` 的 `rect`）与 `contentShift` 一致
- [ ] 将 KPI 数值字段接入真实 API（或 mock 数据）

---

## list（列表）

### 识别特征
- `name` 含 list / 列表 / 排行 / 明细 / top\d
- 子文字层数量 ≥ 子切片层 × 2
- 子元素竖向排列（y 坐标递增，x 坐标偏差 ≤ 10px）

### 骨架模板

```vue
<template>
  <div class="list-panel" :style="containerStyle">
    <!-- 可选：列表标题行 -->
    <div class="list-header">
      <span v-for="col in columns" :key="col.key" :style="`width:${col.width}px`">{{ col.label }}</span>
    </div>
    <!-- 数据行 -->
    <div
      v-for="(row, i) in listData"
      :key="row.id || i"
      class="list-row"
      :class="{ 'list-row--odd': i % 2 === 0 }"
    >
      <span class="list-rank">{{ i + 1 }}</span>
      <span v-for="col in columns" :key="col.key" :style="`width:${col.width}px`">
        {{ row[col.key] }}
      </span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ListPanel',
  props: {
    listData: { type: Array, default: () => [] },
    columns:  {
      // [{ key: 'name', label: '名称', width: 120 }, { key: 'value', label: '指标量', width: 80 }]
      type: Array,
      default: () => [],
    },
  },
};
</script>
```

### 填充清单（必做）

- [ ] 从 `_all_elements.json` 找第一行子文字层，提取列名/宽度 → 填 `columns`
- [ ] 确认 row 高度（从第一个子 group 的 `rect.h` 取值）
- [ ] 接入 API 数据，替换 mock listData

---

## chart-container（图表容器）

### 识别特征
- `name` 含 chart / 图表 / 折线 / 柱状 / 饼图 / echarts
- 父 group 内有静态假图表切片（名含 fake/静态/preview）→ 该切片应被 ECharts 替换

### 骨架模板

```vue
<template>
  <div class="chart-container" :style="containerStyle">
    <div ref="chartRef" class="chart-inner" style="width:100%;height:100%;"></div>
  </div>
</template>

<script>
import * as echarts from 'echarts';

export default {
  name: 'ChartContainer',
  props: {
    chartOption: { type: Object, default: null },
    theme:       { type: String, default: null },
  },
  data() {
    return { chart: null };
  },
  mounted() {
    this.chart = echarts.init(this.$refs.chartRef, this.theme);
    if (this.chartOption) this.chart.setOption(this.chartOption);
    window.addEventListener('resize', this.resize);
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resize);
    this.chart?.dispose();
  },
  watch: {
    chartOption(val) { if (val) this.chart?.setOption(val, true); },
  },
  methods: {
    resize() { this.chart?.resize(); },
  },
};
</script>
```

### 填充清单（必做）

- [ ] 在 `_render_gaps_report.json` 中确认 `fakeChartLayers` 包含本 group 内的切片 id
- [ ] 把静态假图表切片加入 `chartExcludeIds`（`_chart_zones.json` 的 `excludeLayerIds`）
- [ ] 从需求文档或 mock 确认图表类型（折线 / 柱状 / 饼图），填 `chartOption`

---

## card（卡片/面板）

### 识别特征
- `name` 含 card / 卡片 / panel / 面板 / box / 块
- 有背景色或背景切片 + 标题文字 + 内容区

### 骨架模板

```vue
<template>
  <div class="card-panel" :style="containerStyle">
    <div class="card-header">
      <slot name="header">
        <span class="card-icon"></span>
        <span class="card-title">{{ title }}</span>
      </slot>
      <slot name="actions"></slot>
    </div>
    <div class="card-body">
      <slot></slot>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CardPanel',
  props: {
    title: { type: String, default: '' },
  },
};
</script>

<style scoped>
.card-panel { box-sizing: border-box; }
.card-header {
  display: flex;
  align-items: center;
  /* TODO: 从 _all_elements.json 提取 header group 的高度 */
}
.card-body { flex: 1; min-height: 0; }
</style>
```

### 填充清单（必做）

- [ ] 确认 `card-header` 高度（从 header 子 group 的 `rect.h`）
- [ ] 若有背景切片 → 用 `background-image: url(...)` 而非 `<img>`
- [ ] 接入 `<slot>` 的具体子组件（chart / list / kpi-row）

---

## title（标题）

### 识别特征
- `name` 含 title / 标题 / header / heading
- 通常高度 ≤ 80px，含 1~2 个文字层 + 可选装饰切片（竖线、icon）

### 骨架模板

```vue
<template>
  <div class="section-title" :style="containerStyle">
    <span class="title-decor"></span><!-- 可选：装饰竖线/图标切片 -->
    <span class="title-text">{{ title }}</span>
    <slot name="extra"></slot><!-- 可选：右侧按钮 -->
  </div>
</template>

<script>
export default {
  name: 'SectionTitle',
  props: {
    title: { type: String, default: '' },
    showDecor: { type: Boolean, default: true },
  },
};
</script>

<style scoped>
.section-title {
  display: flex;
  align-items: center;
}
.title-decor {
  /* TODO: 若有竖线切片，在此用 background-image 引入 */
  width: 4px;
  height: 16px;
  background: var(--c-primary, #00E5FF);
  margin-right: 8px;
  border-radius: 2px;
}
.title-text {
  /* TODO: 从 _all_elements.json 提取字体/颜色 */
  font-size: 16px;
  color: var(--c-text-title, #fff);
  font-weight: 500;
}
</style>
```

### 填充清单（必做）

- [ ] 确认 title 文字内容（从 `_all_elements.json` 的子文字层 `content` 取值）
- [ ] 若有装饰切片（竖线、icon）→ 填 `.title-decor` 的 `background-image`

---

## generic（通用 group）

### 识别特征
- 无上述关键词匹配，且 priority=low

### 处理策略

1. **先判断是否需要提取**：area < 200×100 的 group 通常不需要独立组件，保留 inline 绝对定位
2. **需要提取时**：
   - 若子元素均为文字 → 直接 inline，无需组件
   - 若子元素含图表/列表 → 降级到对应配方
   - 若仅装饰性切片 → 保留 `<img>` inline，不提取

### 填充清单

- [ ] 确认 `_group_analysis.json` 中 `priority=low` 的 group 是否真的不需要提取
- [ ] 对保留 inline 的 group，确保绝对定位坐标已减去 `contentShift`

---

## 阶段 3 Step 2~6 机械化规则速查

### Step 2：抽公共文字样式（≥ 3 次即提取）

```js
// 自动统计：读 _all_elements.json，对 type=text 的 fontFamily+fontSize+fontWeight+color 组合计频
// 命名约定：.text-{语义}-{尺寸}  例：.text-num-kpi, .text-label-14, .text-title-16
// 阈值：出现 ≥ 3 次 → 提取为 utility class
// 保留 inline：仅 position 字段（left/top/width/height/z-index）
```

> 快捷脚本：`scripts/gen-component-skeleton.mjs` 产出的 `skeletonCode` 的 `<style scoped>` 区域
> 已包含占位注释，直接填入从 `_all_elements.json` 读取的实际值。

### Step 3：颜色/阴影提 CSS 变量（≥ 5 次即提取）

```css
/* 变量命名约定 */
:root {
  --c-primary:  #00E5FF;   /* 主强调色（出现频率最高的高亮色） */
  --c-warn:     #FFB000;   /* 警告/异常色 */
  --c-panel-bg: rgba(8, 22, 56, 0.78);  /* 面板背景 */
  --c-text-title: #fff;
  --c-text-label: #8AA0C0;
  --c-grid:     rgba(255,255,255,0.08);  /* 网格线 */
}
```

> 已有主题文件（`src/themes/`）→ 优先接入，**禁止新建重复变量**。

### Step 4：坐标策略（3 条硬规则）

| 层级 | 规则 |
|------|------|
| **panel 容器**（≥ 200×100） | 保留绝对定位，z-index 改语义分层（bg=1 / content=10 / overlay=100） |
| **panel 内部行列结构** | KPI 行/列表/图例 → **改 flex/grid**，不保留绝对定位 |
| **装饰切片/图表容器/badge** | 保留绝对定位 |

### Step 5：资源迁移 2 条规则

1. `emit-summary.json` 的 `referenceSlices` 枚举的 slice → **删除**（preview/screenshot）
2. 其余被组件实际引用的 slice → 拷到 `prototype/images/`，**同步更新 spec.md**

### Step 6：Fake chart 替换门禁

- 必须在 Step 1~5（panel 结构稳定）**之后**执行
- 从 `_render_gaps_report.json` 的 `fakeChartLayers` 取 id → 加入 `_chart_zones.json` `excludeLayerIds`
- 替换顺序：折线 → 柱状 → 饼图（由简到繁）

---

## 完成判定

全部 `high` priority group 已有对应 `.vue` 文件，且每个文件已完成其「填充清单」。
`medium` / `low` 组件可 inline 或后续迭代处理，**不阻断首次交付**。
