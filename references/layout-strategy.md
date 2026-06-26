# 布局策略：absolute / flex / grid 决策指南

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：meaxure-track.md Step 4 + datav-dashboard 实现规范（第 13 条"按需定位"）整合扩展

---

## 三层决策树

```
这个元素/区域需要绝对定位吗？
│
├── YES（满足任一条件）：
│   ├── 纯装饰切片（静态图片，不随内容变化）
│   ├── 图表容器（需精确匹配设计坐标和尺寸）
│   ├── 悬浮 badge / 角标 / tooltip
│   ├── 坐标在锚点体系内的组件（见 coordinate-system.md）
│   └── 叠加层（遮罩、水印）
│       → 保留 position: absolute; left/top/width/height
│
└── NO（以上都不满足）：
    │
    └── 在行和列两个维度都需要对齐吗？
        │   （如：5 列 × 3 行的卡片网格；日历；多行多列表格头）
        │
        ├── YES → CSS Grid
        │     grid-template-columns / grid-template-rows
        │     gap: Npx
        │
        └── NO（单轴排列）：
            │
            └── 内容数量是否动态？（v-for 列表、数量不确定的标签）
                │
                ├── YES → flex（自动适应数量变化）
                │     display: flex; gap: Npx
                │     flex-wrap: wrap（标签可换行时）
                │
                └── NO（固定数量静态元素）→ flex 或 inline-block 均可
```

---

## 从 MeaXure / 导出包坐标推断布局意图（5 条规则）

在分析 `layers.json` 或 `_design-nodes.json` 时，可以用以下规则推断设计师的意图：

| 规则 | 坐标特征 | 推断 → 实现方式 |
|------|---------|--------------|
| **1. 同行元素** | 多个元素 `top` 值相同（差值 < 4px），水平排列 | → `display: flex; flex-direction: row` |
| **2. 同列元素** | 多个元素 `left` 值相同（差值 < 4px），垂直排列 | → `display: flex; flex-direction: column` |
| **3. 等距网格** | 元素间距相等（误差 < 4px），横向 N 列 × 纵向 M 行 | → `display: grid; grid-template-columns: repeat(N, 1fr)` |
| **4. 全宽元素** | 元素 `width` ≈ 父容器 `width`（差值 < 8px）| → `width: 100%`，不要硬编码 px |
| **5. KPI 组合** | 数字 + 标签在同一 group，数字在上标签在下，居中对齐 | → `display: flex; flex-direction: column; align-items: center` |

---

## 大屏 5 种典型布局模式

### 模式 1：KPI 卡片行（等宽均分）

```vue
<template>
  <div class="kpi-row">
    <div v-for="item in kpiList" :key="item.key" class="kpi-card">
      <span class="kpi-value">{{ item.value }}</span>
      <span class="kpi-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.kpi-row {
  display: flex;
  gap: 16px;
}
.kpi-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
```

### 模式 2：面板三列布局（各列独立锚点）

各 Panel 保留绝对定位（它们在设计稿中有固定坐标），内部改用 flex/grid：

```vue
<!-- 各面板绝对定位，来自 anchor 坐标系 -->
<LeftPanel  :style="{ position:'absolute', left:'24px',   top:'88px', width:'440px', height:'916px' }" />
<CenterPanel :style="{ position:'absolute', left:'480px',  top:'88px', width:'960px', height:'916px' }" />
<RightPanel :style="{ position:'absolute', left:'1456px', top:'88px', width:'440px', height:'916px' }" />
```

### 模式 3：数据表格区域

```vue
<!-- Vue 2：ls-table，只用 min-width，禁止 :width -->
<ls-table :data="tableData" style="width:100%">
  <ls-table-column prop="name"  label="名称"  :min-width="120" />
  <ls-table-column prop="value" label="数值"  :min-width="100" />
  <ls-table-column prop="status" label="状态" :min-width="80"  />
</ls-table>

<!-- Vue 3：el-table，同样只用 min-width -->
<el-table :data="tableData" style="width:100%">
  <el-table-column prop="name"  label="名称"  min-width="120" />
</el-table>
```

### 模式 4：排名列表（动态 v-for）

```vue
<template>
  <div class="rank-list">
    <div v-for="(item, idx) in rankList" :key="item.id" class="rank-row">
      <img :src="getRankIcon(idx)" class="rank-badge" />
      <span class="rank-name">{{ item.name }}</span>
      <div class="rank-bar" :style="{ width: item.percent + '%' }" />
      <span class="rank-value">{{ item.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.rank-list { display: flex; flex-direction: column; gap: 8px; }
.rank-row  { display: flex; align-items: center; gap: 8px; }
.rank-bar  { height: 6px; background: var(--c-primary); border-radius: 3px; }
</style>
```

### 模式 5：图表占位区（精确匹配设计坐标）

```vue
<!-- 图表容器保留绝对定位，ChartBox 接管静态 slice 的坐标 -->
<ChartBox
  :left="218"
  :top="52"
  :width="360"
  :height="240"
  :option="chartOption"
/>
```

---

## 反模式（明确禁止）

| 反模式 | 原因 | 正确做法 |
|--------|------|---------|
| 所有元素都用 `absolute` | 内容变化时布局崩溃 | 只有装饰层/图表/锚点组件才用 |
| 表格列设 `:width` | 超出容器或无法自适应 | 只用 `:min-width` |
| panel 内部大量绝对定位 | KPI 行/图例等规则布局不需要 | 改 flex（行）/ grid（网格）|
| 用 CSS 模拟图片内容 | 无法精准还原，维护成本高 | 直接用切图 `<img>` |
| 写死 px 间距 | 不同分辨率下不一致 | 用 CSS 变量 `var(--spacing-*)` |
