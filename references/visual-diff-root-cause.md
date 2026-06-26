# 视觉差异根因速查手册（Visual Diff Root-Cause Table）

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

> **使用方式**：Step 4-A 截图比对发现差异后，按「现象」在下方五大分类中查找匹配行。
> 若命中，直接执行「修复步骤」；若**未命中**，执行末节「未命中升级协议」。
>
> 每次修复后**必须重截图**确认消除，不得靠目测"感觉差不多了"。

---

## 分类一：坐标 / 位置偏移

| 现象 | 触发条件 | 根因 | 修复步骤 |
|------|---------|------|---------|
| 所有组件 left 值系统性偏右 | 嵌入 BasicLayout | `CONTENT_SHIFT_X` 未减去 | `shiftRect` 过滤 chrome 并平移坐标 |
| 某区域元素统一偏下 N px | 顶部有导航 / 标题 | `CONTENT_SHIFT_Y` 未减去 | 确认 `contentShift.y` 并写入 `SHIFT_Y` 常量 |
| 元素位置正确但 scale 后偏移 | CSS transform scale | `transform-origin` 默认 50% 50% | 改 `transform-origin: top left`（`0 0`） |
| 全局 scale 正确但局部元素仍偏 | 绝对定位嵌在 relative 父容器 | 父容器有 padding/border 挤占 | 检查父容器 box-sizing + 去掉非预期 padding |
| 内容下方/右侧被裁剪 | anchor 容器 | `overflow: hidden` | 改 `*Anchor.vue` 为 `overflow: visible`；或增大 height |
| flex 子项间距比设计多出固定值 | flex 布局 | `gap` / `column-gap` 有默认值 | 显式设 `gap: 0`；或按设计稿精确设值 |
| 旋转元素偏离中心 | `transform: rotate` | `transform-origin` 未设为元素中心 | 明确设 `transform-origin: center center` |
| sticky 元素遮挡内容 | 有 sticky 定位的头部 | 滚动时 sticky 覆盖绝对定位内容 | 给 sticky 父容器加 `z-index` 并确保层级隔离 |

---

## 分类二：颜色 / 样式错误

| 现象 | 触发条件 | 根因 | 修复步骤 |
|------|---------|------|---------|
| 渐变色是白色或不对 | shape 含渐变 | 用了 `css[].color`（占位色）而非 `fills.gradient.colorStops` | 查 `_all_elements.json` 的 `gradientStops`/`gradientAngle` 字段 |
| 渐变/阴影/圆角与设计有色差 | 复杂视觉效果 | 用 css 硬捏栅格/复杂视觉 | 改用真实 slice 或设计师补导 |
| 某列颜色不生效 | 表格 / 列表组件 | `.tbl td !important` 压制子类规则 | 改为 `.tbl td.td-xxx { color: ... !important }` |
| 背景色正确但文字不可见 | 深色背景 | 继承了 body 的深色 `color` | 显式设组件 `color` 属性 |
| CSS variable 不生效（显示黑色） | 使用了 `var(--x)` | 变量未在 `:root` 或父容器定义 | 检查变量名拼写；在 `src/themes/` 或 `:root` 中定义 |
| 切片图片与组件叠加 | anchorComponents 模式 | 未加入 `ANCHOR_REPLACED_FILES` | 把该切片文件名加入 Set |
| 图片被拉伸变形 | `<img>` 标签 | 未设 `object-fit: cover/contain` | 改 `background-image` + `background-size: cover`；或加 `object-fit` |
| 阴影颜色/扩散比设计稿浅 | box-shadow | 颜色透明度未完整复刻 | 从 `_all_elements.json` 的 `shadows[]` 读取 rgba 完整值 |
| 边框样式与设计不符（虚线/粗细） | shape borders | 仅读了 color 未读 style/width | 完整复刻 `borders[].style` / `borders[].width` |

---

## 分类三：字体 / 文字排版

| 现象 | 触发条件 | 根因 | 修复步骤 |
|------|---------|------|---------|
| 字体/字号与设计不符 | 全局样式覆盖 | `global.less *{}` 覆盖 | 加 `!important` 到 font-family/font-size |
| 字体显示为系统默认字体 | 自定义字体 | 字体文件未加载 / @font-face 路径错 | 检查 Network 面板字体文件请求；修正 `@font-face` src 路径 |
| 行高导致文字垂直位置偏 | 多行文字 | `line-height` 与设计稿不一致 | 从 `_all_elements.json` 的 `lineHeight` 字段读取实际值 |
| 字间距过密或过疏 | 字体精确排版 | `letter-spacing` 未设或默认 | 从 `letterSpacing` 字段读取；乘以 `font-size` 换算 em 值 |
| 数值/单位文字重影 | layer_stack 渲染 | composite + fragment 同进 stack | `dedupeTextLayers`（见 §3.9 渲染层三件套） |
| 多行文字被截断 | 固定高度容器 | `overflow: hidden` + 无 `white-space: pre-wrap` | 加 `white-space: pre-wrap; overflow: visible` |
| 文字前有意外空白 | template 模板渲染 | `>{{ text }}</…>` 前有空格/换行缩进 | 紧贴标签书写：`>{{ text }}</span>`（无缩进） |
| 同一行文字 Safari 渲染偏细 | Safari 字体渲染 | 缺 `-webkit-font-smoothing` | 在容器加 `-webkit-font-smoothing: antialiased` |
| 文字 align 偏离 | 居中 / 对齐 | `text-align` 与 `width` 配合不当 | 统一用 flex `align-items`/`justify-content` 代替 `text-align` |

---

## 分类四：布局 / 容器结构

| 现象 | 触发条件 | 根因 | 修复步骤 |
|------|---------|------|---------|
| 嵌入后宽度窄、两侧黑边 | 嵌入模式 | 用了 `min(vw/W,vh/H)` letterbox | 改 `scale = viewportW / STAGE_W` + 纵向滚动 |
| 有平台壳但页面无侧栏 | 嵌入路由配置 | 顶层全屏路由 | 改 `BasicLayout.children` 嵌套路由 |
| layer_stack 与组件叠影 | 渲染架构混用 | §3.9 与 overlay 混用 | 验证页纯 stack，动态区仅从 stack 排除层 |
| **仅 BG + 括号 + ECharts，文字/面板/地图全缺** | §3.9 + icon overlays | `buildBoardRenderPlan` 抛错（icon 分支遗留旧 `getXxxLayerPublicPath`）→ renderLayers=[] | 规则 74：slice 与 icon-gap 共用 `resolveAssetUrl`；跑 `verify-board-render-plan.mjs`；grep 旧模块名 |
| plan 正常但文字被盖住 | 渲染顺序 | 文字层 z 低于矢量/ECharts | 规则 75：分三段 v-for，text z≥9000 |
| flex 容器高度塌陷 | 嵌套 flex | 未设 `flex: 1; min-height: 0` | 在需要撑高的子项加 `flex: 1; min-height: 0` |
| 滚动容器内容不滚动 | overflow | 父容器高度无约束导致无限伸展 | 给滚动容器加 `height: 100%; overflow-y: auto` |
| 绝对定位元素消失 | 未找到定位父 | 父链中无 `position: relative/absolute/fixed` | 最近容器加 `position: relative` |
| 整页局部都对但整体走样 | Step 4-A 肉眼比对 | 缺整页量化判据 | 执行 Step 4-E 整页 SSIM 门禁 |

---

## 分类五：交互 / 动态渲染

| 现象 | 触发条件 | 根因 | 修复步骤 |
|------|---------|------|---------|
| 修改 JSON 后页面无变化 | 静态 JSON import | 不触发 HMR | 在引用该 JSON 的 .vue 文件 import 行加注释（如时间戳） |
| ECharts 修改配置无效 | ECharts HMR | HMR 没有 clear | `applyOption` 开头加 `this.chart.clear()` |
| 按钮无法点击 | 父容器样式 | `pointer-events: none` | 按钮元素加 `pointer-events: auto` |
| 图标与文字不垂直居中 | 混排对齐 | 用 position/line-height 对齐 | 改为父容器 `display:flex; align-items:center` |
| 图片 404 不显示 | 路径问题 | 文件名编码/路径错误 | 浏览器 Network 面板查实际请求 URL |
| 某图标 404/空白 | slice 声明 | 磁盘缺文件；或 `exportable.path` 未经别名映射 | 先 `resolveAsset()` 做 @2x/@3x 映射；仍缺则 `_missing_assets.json` 报备 |
| 图标区只有渐变无 pictogram | 空 group / ghost shape | `_render_gaps_report.json` iconGapCandidates | `gen-icon-gap-candidates.mjs` → `gen-icon-overlays.mjs` → `_icon_gap_overlays.json`（规则 63–65） |
| 小图标全 broken 但 static 存在 | URL 丢 icon/ 子目录 | `assetUrl` basename-only | 改用 `templates/shared/layerUrl.mjs`；curl 探针 icon/ 与根路径 |
| 中心大块黑/白矩形 | BG备份 误作 overlay | `_icon_gap_overlays.json` 含 BG备份 + 小 rect | 规则 64；BG 只作 background-image |
| 假图表与 ECharts 叠 | chart zone 未配置 | 纯色假柱未识别；chart zone 未排除 stack | 标题锚定 zone + `overlapsChartZone` + `isFakeBarShape` 含纯色 |
| 列表行数比设计稿少 | mock 数据 | mock 数据不足 | 补全 mock 数据到与设计稿一致的条目数 |
| 动画首帧位置错误 | CSS transition/animation | 初始值与 to 值不一致，首帧闪动 | 用 `:style` 绑定初始位置；或 `transition-delay` 让初始渲染稳定 |
| Vue 响应式数据更新但 DOM 不刷新 | 引用类型 | 直接修改数组/对象下标不触发 reactivity | 用 `this.$set`（Vue 2）或 `reactive()` 替换整体赋值 |
| 坐标/颜色与设计偏差但 JSON 里有正确值 | 实现期 | 目测未读 JSON | 从 `_all_elements.json` 按 id 读取，做坐标消费抽查（Step 4-A2） |

---

## 未命中升级协议（MANDATORY）

> 当截图差异**无法在上方五大分类中找到匹配行**时，**强制执行以下升级流程**，
> 禁止在根因未定位的情况下随机尝试修改。

### 升级步骤

```
第 1 轮（首次未命中）：
  1. 截图差异区域（高分辨率截图，标注坐标范围）
  2. 列出至少 2 个候选根因，每个附证据评分（0-10）：
       【可能根因 1】<描述> — 评分 N/10，因为 <具体观察证据>
       【可能根因 2】<描述> — 评分 N/10，因为 <具体观察证据>
  3. 用 CDP 检查目标元素的 computed style：
       browser_cdp → Runtime.evaluate：
         window.getComputedStyle(document.querySelector('<selector>')).<property>
  4. 若最高分根因 ≥ 7/10 → 执行修复，重截图验证
  5. 若最高分 < 7/10 → 进入第 2 轮

第 2 轮（第 2 次仍未命中）：
  1. 报告以下信息（不再自行尝试修复）：
       - 截图（设计稿 vs 实现）
       - 已尝试的根因列表 + 每个评分
       - CDP 查到的 computed style 摘要
       - 推断最可能的技术方向（CSS 层级 / 框架限制 / 数据问题）
  2. 停止修改代码，等待用户输入
  3. 把此问题写入 TodoWrite：status=blocked，附上上述报告

第 3 轮（用户提供方向后）：
  1. 把用户提供的根因写入本文档末尾「项目专属根因扩展」
  2. 按新根因修复
  3. 重截图验证
```

### 禁止行为

- **禁止超过 2 次在同一差异上随机尝试**（尝试次数从未命中开始计）
- **禁止在无根因的情况下改代码**（哪怕"试一试"）
- **禁止自我报告"基本一致"**（必须有截图对比 + 量化指标支撑）

---

## 项目专属根因扩展

> 此节由 AI 在「未命中升级协议第 3 轮」后填写，记录项目特有的根因。

| 发现日期 | 现象 | 根因 | 修复 | 来源 |
|---------|------|------|------|------|
| （待填） | | | | |
