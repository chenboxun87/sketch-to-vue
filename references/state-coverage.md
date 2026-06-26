# 状态覆盖规范（三轨道通用）

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：mastergo-mcp-track.md 第 5 步（扩展）+ datav-dashboard 空状态规范

适用于：A 轨道（MeaXure）、B 轨道（MasterGo 导出包）、C 轨道（MasterGo MCP）

---

## 实现前：识别设计稿状态缺口

设计稿通常只给出"正常态"。开始实现前先过一遍此 checklist：

```
□ 空态：列表为空、图表无数据、搜索无结果
□ 加载态：API 请求期间（表格、图表、页面初始化）
□ 错误态：网络失败、接口报错、数据格式异常
□ 禁用态：按钮/输入框不可操作（权限不足、前置条件未满足）
□ 无权限态：用户无访问权限，不得展示数据
□ 弹窗/选择态：确认框、详情弹层、筛选面板
```

对每个缺口判断：
- 设计稿是否已给出该状态的视觉设计？
- 若未给出，需按现有设计语言自行补齐，并在实现说明中标注"按设计语言补齐"

---

## 各状态视觉约束与实现

| 状态 | 视觉约束 | Vue 2（vmd-ui）实现 | Vue 3（Element Plus）实现 |
|------|---------|------------------|------------------------|
| **空态** | 提示文字与主视觉一致，不回退到浏览器默认 | `empty-text="暂无数据"` | `<template #empty><span>暂无数据</span></template>` |
| **加载态** | 骨架屏或 spinner，颜色与主色调一致 | `v-loading="loading"` 指令 | `<el-skeleton :loading="loading">` |
| **错误态** | 友好提示文字 + 图标，不显示技术报错信息 | `this.$message.error(msg)` | `ElMessage.error(msg)` |
| **禁用态** | `opacity: 0.4` + `cursor: not-allowed`，禁用指针交互 | `:disabled="true"` prop | `:disabled` + CSS `pointer-events: none` |
| **无权限态** | 锁定图标 + 提示文字，不展示任何业务数据 | `v-if="hasPermission"` | `v-if="can('read')"` |
| **弹窗态** | 半透明遮罩 + 模态框，与现有 Modal 风格一致 | `<ls-dialog v-model="visible">` | `<el-dialog v-model="visible">` |

---

## ECharts 图表空态 / 加载态规范

### 初始空配置（防止报错）

```javascript
// data 中初始化空对象，避免 setOption 前报错
chartOption: {}

// 条件判断：数据到达后再 setOption
if (data && data.length) {
  this.$refs.chart.setOption(buildOption(data))
} else {
  this.$refs.chart.setOption(emptyChartOption)
}
```

### 加载态

```javascript
// Vue 2：通过 ref 调用 Echarts 组件方法
this.$refs.chart.showLoading({
  text: '数据加载中...',
  color: '#00E5FF',        // 与主色调一致
  textColor: '#8AA0C0',
  maskColor: 'rgba(8, 22, 56, 0.6)'
})

// 数据到达后隐藏
this.$refs.chart.hideLoading()
this.$refs.chart.setOption(option)
```

### 无数据时的 ECharts option

```javascript
const emptyChartOption = {
  title: {
    text: '暂无数据',
    left: 'center',
    top: 'middle',
    textStyle: {
      color: '#8AA0C0',
      fontSize: 14,
      fontWeight: 'normal'
    }
  },
  series: []
}
```

---

## 状态补齐原则

1. **风格一致**：补齐的状态视觉与正常态保持同一设计语言（颜色/字体/间距）
2. **不回退**：不得明显回退到旧页面风格或浏览器默认样式
3. **标注声明**：若补齐状态不是设计稿直接给出的，在实现说明末尾写：
   > "以下状态按设计语言补齐（设计稿未覆盖）：空态 / 加载态 / 错误态"
4. **ECharts 初始空 option**：图表组件初始化时必须传入空对象 `{}`，避免 `setOption` 前的 undefined 报错

---

## 与设计轨道的衔接

| 轨道 | 如何识别状态缺口 |
|------|--------------|
| A 轨道（MeaXure）| 查看 `layers.json` 中是否有多个 artboard；不同 artboard 可能覆盖不同状态 |
| B 轨道（MasterGo 导出包）| 查看 `data/exports/` 目录是否有多个帧；帧名含"空态"/"loading"/"error" |
| C 轨道（MasterGo MCP）| `mastergo_analyze.py` 输出中查看 Navigations 和多页面结构；每页可能对应一种状态 |
