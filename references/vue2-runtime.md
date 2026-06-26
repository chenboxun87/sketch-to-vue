# Vue 2 框架实现规范

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：datav-dashboard（核心内容，完整保留）

适用于：vmd-ui / ls-* 前缀组件 / Vue 2.x 项目

---

## 核心组件 API

### ViewContent — 大屏自适应容器

**文件路径**：`src/components/ViewContent.vue`

所有大屏页面的根容器，基于 1920px 设计稿宽度等比缩放，自动适配不同分辨率。

**Props**：

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `isShowFullScreen` | Boolean | true | 是否显示全屏按钮 |

**Events**：

| Event | 参数 | 说明 |
|-------|------|------|
| `random` | `scalingRatio: Number` | 缩放比例变化时触发（如 0.8） |

**缩放机制**：
- 内部 `.view` 固定 `width: 1920px`，通过 `transform: scale()` 等比缩放
- 监听父容器 ResizeObserver + window.resize，自动重新计算缩放比
- 当内容高度超过视口时自动压缩宽度防止溢出

**使用模板**：
```html
<template>
  <ViewContent>
    <div class="page-container" :style="backgroundStyle">
      <!-- 页面内容 -->
    </div>
  </ViewContent>
</template>

<script>
import ViewContent from "@/components/ViewContent";
export default {
  components: { ViewContent }
}
</script>
```

---

### Echarts — 图表组件

> ⚠️ **跨项目移植前必须先确认封装组件存在**：执行 `Glob "src/**/Echarts.vue"` 检查。不存在则不能写 `import Echarts from '@/components/Echarts'`——改用规则 55（原生 `echarts.init()` 方案）。`@/components/Echarts` 是部分示例项目的特定封装，不是 Vue 2 框架标配。

**文件路径**：`src/components/Echarts.vue`（仅 datav-dashboard 类项目存在）

ECharts 封装组件，支持自适应缩放、点击事件、液态填充图（echarts-liquidfill）。

**依赖**：
```js
import * as Echarts from "echarts";
import "echarts-liquidfill";
```

**Props**：

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `height` | String | `'100%'` | 图表高度（CSS 值） |
| `option` | Object | `{}` | ECharts 配置项 |
| `isClick` | Boolean | false | 是否启用图表点击事件 |

**Events**：

| Event | 参数 | 说明 |
|-------|------|------|
| `ready` | `chart: ECharts实例` | 图表初始化完成时触发 |
| `click` | `name: String` | isClick=true 时，点击图表返回 xAxis 名称 |
| `paramsClick` | `params: Object` | isClick=true 时，点击事件的原始参数 |

**自适应**：
- 通过 ResizeObserver 监听容器变化，debounce 100ms 后调用 `chart.resize()`
- mounted 时监听 window.resize（非全屏状态才 resize）

**关键方法**（通过 ref 调用）：
- `setOption(option)` — 设置/更新图表配置
- `refreshEcharts()` — 手动触发 resize
- `clearEcharts()` — 清空图表

**生命周期清理**（多图表页面必须，防内存泄漏）：

```javascript
beforeDestroy() {
  if (this.$refs.chart) {
    this.$refs.chart.clearEcharts()
    // 若 Echarts.vue 内部未自行 dispose，手动调用：
    // this.$refs.chart.chart && this.$refs.chart.chart.dispose()
  }
}
```

**使用模板**：
```html
<Echarts ref="chart" height="380px" :option="chartOption" :isClick="false"
         @ready="onChartReady" />

<script>
import Echarts from "@/components/Echarts";
export default {
  components: { Echarts },
  data() {
    return {
      chartOption: {}  // 初始传空对象，非空时才 setOption
    }
  },
  mounted() {
    this.loadChartData();
  },
  methods: {
    async loadChartData() {
      const data = await fetchData();
      this.chartOption = this.buildOption(data);
    },
    onChartReady(chart) {
      // chart 实例已就绪
    }
  }
}
</script>
```

---

## 代码约束清单（13 条）

### 1. 大屏容器

必须用 `ViewContent` 包裹，不要用 `common-screen-big`。

### 2. 全页背景图

`bg.png`、`nav.png` 等全页背景图**必须**用 `background-image` 实现，加在最外层 div 上：

```html
<!-- ✅ 正确 -->
<div class="page-container" :style="{ backgroundImage: `url(${bgImg})` }">

<!-- ❌ 禁止 -->
<img src="bg.png" class="bg-img" />
```

### 3. 图片引用路径规范

```javascript
// 模板中
<img src="~/assets/images/xxx.png">

// CSS 中
background-image: url('~assets/images/xxx.png')

// JS 中
require('@/assets/images/xxx.png')
```

### 4. 样式穿透

**禁止嵌套 `/deep/`**，每条穿透样式单独写：

```less
// ✅ 正确
/deep/ .ls-table { ... }
/deep/ .ls-pagination { ... }

// ❌ 禁止
/deep/ .ls-table {
  /deep/ .el-checkbox { ... }  // 嵌套穿透
}
```

### 5. 表格实现方式

- **有分页的区域**：用 `ls-table` + `ls-pagination` 组件
- **没有分页的表格**：直接用 `div` + CSS 样式画，不用表格组件

### 6. 表格列宽

只用 `:min-width`，不用 `:width`，`ls-table` 上不加 `style="width: 100%"`：

```html
<ls-table-column :min-width="120" label="名称" prop="name" />
```

### 7. 渐变色文字

```less
.gradient-text {
  background: linear-gradient(180deg, #00E5FF 0%, #0088CC 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### 8. 分页箭头

不要用文字 `< >`，用 `prev-text=""` + `::before` 伪元素渲染箭头图片：

```less
/deep/ .ls-pagination .btn-prev::before {
  content: '';
  display: inline-block;
  width: 16px;
  height: 16px;
  background: url('~assets/images/arrow-left.png') no-repeat center/contain;
}
```

### 9. 分页按钮

必须用 `框.png` 做背景图，不要用纯 CSS border 模拟：

```less
/deep/ .ls-pagination .number {
  background: url('~assets/images/page-btn-bg.png') no-repeat center/100% 100%;
  border: none;
}
```

### 10. 表格行背景

奇数行和偶数行分别用不同背景图，不要用纯色：

```less
/deep/ .ls-table .el-table__row:nth-child(odd) td {
  background: url('~assets/images/row-odd.png') no-repeat center/100% 100%;
}
/deep/ .ls-table .el-table__row:nth-child(even) td {
  background: url('~assets/images/row-even.png') no-repeat center/100% 100%;
}
```

### 11. 表格 checkbox

切图中有复选框图标时，表格第一列应该是 checkbox 列，不是文字序号：

```html
<ls-table-column type="selection" width="55" />
```

### 12. 表头背景

切图是完整图片时用 `no-repeat` + `background-size: 100% 48px`，不要用 `repeat-x`：

```less
/deep/ .ls-table .el-table__header-wrapper {
  background: url('~assets/images/table-header-bg.png') no-repeat left top;
  background-size: 100% 48px;
}
```

### 13. 图表坐标轴文字不落地

图表区域的 Y 轴刻度文字（如"700/600/500"）、X 轴时间标签（如"00:00/02:00"）不要生成为 DOM 文字——这些由 ECharts 的 `xAxis`/`yAxis` 配置自行渲染。切图中这些文字仅用于确认图表类型和轴范围。

---

## 组件架构原则

**组件数量 = 区域识别结果中的面板数量 + 1（标题）**，不要强行塞入固定数量的组件：

```
// 按检测到的区域动态确定
大屏页面 (index.vue)
├── ViewContent（自适应容器，必须）
├── HeaderComponent（如果有顶部标题区）
├── LeftPanel（如果有左侧面板区）
├── CenterPanel（如果有中间面板区）
│   ├── ls-table + ls-pagination（如有分页表格）
│   ├── div 表格（如有无分页表格）
│   └── Echarts（如有图表）
└── RightPanel（如果有右侧面板区）
```

---

## 图片资源命名规范

复制到 `src/assets/images/[页面名]/` 目录，使用语义化命名（根据 slice 的 `name` 属性推断）：

| 命名模式 | 用途 |
|---------|------|
| `bg.png` | 全页背景（name 含 "bg"） |
| `panel-left-bg.png` | 左侧面板背景 |
| `icon-xxx.png` | 图标类（name 含 "img-kt" 或 "icon"） |
| `table-header-bg.png` | 表头背景 |
| `row-odd.png` / `row-even.png` | 奇偶行背景 |
| `page-btn-bg.png` | 分页按钮背景 |

---

## Mock 数据规范

```javascript
// 表格数据使用切图中的示例数据
// 图表数据使用合理的随机范围值
// 分页总数使用切图中的数值
// 统计数字使用切图中的数字（翻牌器数字拼接）
// 状态颜色：橙色=待处理/已下发，青绿=成功

tableData: [
  { name: '设备001', status: '正常', value: 128, statusType: 'success' },
  // ...
],
totalSize: 100,
chartOption: {},  // 初始传空对象，非空时才 setOption
```

---

## 验收对照检查（完成前必做）

```
1. 图片核对：切图中所有 slice 元素是否都有对应的图片资源和使用代码
2. 文字核对：切图中所有 text 元素的字体/字号/颜色/位置是否一致
3. 渐变核对：Gradient fill 的文字是否实现了渐变效果
4. 位置核对：各元素的 left/top 是否与切图一致（相对父容器计算）
5. 间距核对：区块之间的间距是否与切图一致
6. 穿透核对：/deep/ 选择器是否使用了正确的组件类名（ls-table/ls-pagination）
7. 遗漏项输出：生成遗漏项清单，逐项标记已处理/不处理/待处理
```

---

## 大屏运行时模式

### 数据刷新（轮询）

大屏页面普遍需要定时刷新，推荐用实例变量存储定时器（不放入 `data()` 响应式系统）：

```javascript
export default {
  data() {
    return { POLL_INTERVAL: 30000 }
  },
  mounted() {
    this.fetchAll()
    this._pollTimer = setInterval(this.fetchAll, this.POLL_INTERVAL)
  },
  beforeDestroy() {
    clearInterval(this._pollTimer)  // 必须清理，否则组件销毁后仍触发
  },
  methods: {
    async fetchAll() {
      const [err1, res1] = await fetchPanelA()
      const [err2, res2] = await fetchPanelB()
      if (!err1) this.panelAData = res1.data
      if (!err2) this.panelBData = res2.data
    }
  }
}
```

> ⚠️ `_pollTimer` 用下划线前缀挂在实例上（`this._pollTimer = ...`），不要放入 `data()`，否则 Vue 会对定时器 ID 做不必要的响应式处理。

### 数字翻滚（无外部依赖）

统计数字切换时的 ease-out 滚动效果：

```javascript
methods: {
  animateNumber(target, endVal, duration = 1500) {
    const startTime = performance.now()
    const tick = (now) => {
      const elapsed = now - startTime
      const ease = 1 - Math.pow(1 - Math.min(elapsed / duration, 1), 3)
      this[target] = Math.round(endVal * ease)
      if (elapsed < duration) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
// 使用：this.animateNumber('displayValue', 12345)
```

### ECharts 图表入场动画

```javascript
buildOption(data) {
  return {
    animation: true,
    animationDuration: 800,
    animationEasing: 'cubicOut',
    // ...其余 series/axis 配置
  }
}
```

> ECharts 自带 `animation` 配置优先于手动 JS 动画——更可靠、与数据更新联动更自然。
