# Vue 模板使用指南

## 可用模板

| 文件 | 适用场景 |
|------|---------|
| `MeaXureFullscreenPage.template.vue` | Sketch MeaXure 导出物还原，全屏大屏/驾驶舱页面（信箱式等比缩放） |

---

## MeaXureFullscreenPage：5 步填写 TODO

### Step 1 — 设置画布尺寸

打开 `_all_elements.json` 或查看设计工具中的画布属性，填入：

```js
const BOARD_W = 1920   // 设计稿宽度（CSS px / 1x 单位）
const BOARD_H = 1080   // 设计稿高度
```

### Step 2 — 设置内容偏移

- 如果设计稿是**纯全画布**（无导航 chrome）：保持 `CONTENT_SHIFT_X = 0, CONTENT_SHIFT_Y = 0`
- 如果设计稿内嵌在某个容器内，需要把容器的左/上边偏移量填进来：

```js
const CONTENT_SHIFT_X = 240   // 容器左边距（px）
const CONTENT_SHIFT_Y = 60    // 容器上边距（px）
```

> 坐标来源：在 `_host_layout_hint.json` 的 `contentRect` 字段，或从 `_all_elements.json` 找内容区锚点。

### Step 3 — 设置静态资源路径

```js
const STATIC_BASE = '/static/my-module/design-assets'
```

对应服务器上放切片图片的目录（末尾不加 `/`）。

**子目录**：设计稿 `assets/icon/`、`assets/pic/` 复制后须保留目录结构；`assetUrl()` 必须保留相对路径（见 `templates/shared/layerUrl.mjs`、规则 63），禁止 basename-only。

### Step 3b — 图标缺口（若有 iconGapCandidates）

```bash
node <skill>/scripts/gen-icon-gap-candidates.mjs ./data <设计稿assetsDir>
node <skill>/scripts/gen-icon-overlays.mjs ./data <项目static/design-assets> [boardW] [boardH]
```

`BG备份.png` 作全屏 `background-image`，不进 `_icon_gap_overlays.json`（规则 64）。

### Step 3c — §3.9 渲染计划（推荐共享模块，勿 copy-paste 整文件）

有 icon-gap overlays 或多 chart zone 的大屏，**优先**：

```javascript
// boardRender.js — 薄包装
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

交付前：
```bash
node <skill>/scripts/verify-board-render-plan.mjs ./data
```

**禁止**：slice 用 `getFooLayerPublicPath`、icon-gap 仍调用 `getBarLayerPublicPath`（规则 74）。

**渲染顺序**（规则 75）：template 分三段 — ① slice/vector ② ECharts（z≥5000）③ text（z≥9000）。

### Step 4 — 修正 JSON 导入路径

默认模板假设 `Index.vue` 与 `data/` 目录同级：

```
pages/
└── myPage/
    ├── Index.vue          ← 本文件
    └── data/
        ├── _layer_stack.json
        ├── _all_elements.json
        ├── _render_gaps_report.json
        └── _chart_zones.json
```

如果目录结构不同，修改文件顶部的 `import` 路径。

### Step 5 — 替换 ECharts 图表组件

在模板的 `<!-- TODO: [ECharts] -->` 处：

```html
<div v-for="ov in chartOverlays" :key="ov.key" :style="ov.style">
  <BarChart   v-if="ov.type === 'bar'"  :zone="ov.zone" :data="chartData[ov.key]" />
  <LineChart  v-if="ov.type === 'line'" :zone="ov.zone" :data="chartData[ov.key]" />
  <PieChart   v-if="ov.type === 'pie'"  :zone="ov.zone" :data="chartData[ov.key]" />
</div>
```

并在 `components` 选项中注册它们。

### Step 6 — [可选] 对称 KPI 替换（规则 62）

**何时启用**：多 panel 重复模块（如存量/模块B分析），且 `detect-symmetric-module-gaps.mjs` 报告 `dispositionMismatches` 或 `iconGaps`。

```bash
node <skill>/scripts/detect-symmetric-module-gaps.mjs data/_all_elements.json
```

1. 复制 `<skill>/assets/symmetric_module_clones.template.json` → `data/_symmetric_module_clones.json`
2. 填 `excludeNativeIds`（目标行错误原生层）与 `specs[].sourceElementIds`（**视觉正确参考行**）
3. 在 `Index.vue` 取消 `symmetricModuleClones` import 注释，删除空 stub
4. `dy` = 参考行.y − 目标行.y（**勿**用 KPI.y + panelPitch 跨 panel）

详见 `references/symmetric-kpi-override.md`。未启用时模板 §1.5 对渲染零影响。

---

## 各 JSON 文件说明

| 文件 | 内容 |
|------|------|
| `_layer_stack.json` | 所有图层的渲染顺序、位置、类型（切片/矢量/文本） |
| `_all_elements.json` | 图层详情，含文本的 fontSize/color/fontFamily |
| `_render_gaps_report.json` | 渲染缺陷报告：退化描边路径列表、混合模式提示 |
| `_chart_zones.json` | ECharts 图表区域定义：位置、类型、置信度 |
| `_symmetric_module_clones.json` | [可选] 对称 KPI 参考行 clone + excludeNativeIds（规则 62） |
| `_classification.json` | 图层分类（信息层，可辅助调试） |
| `_coverage_map.json` | 图层覆盖率地图（可辅助调试） |

---

## 文本样式补充（可选）

模板中文本样式提取标注了 `TODO: [text-style]`。如需从 `allElementsData` 读取准确字体样式，在 `renderItems` 中找到该 TODO，按注释示例实现：

```js
const el = elements.find(e => e.id === id)
if (el?.style) {
  style.fontSize   = `${el.style.fontSize}px`
  style.color      = el.style.color || el.style.fill
  style.fontFamily = el.style.fontFamily
  style.fontWeight = el.style.fontWeight
}
```

不同项目的 `allElementsData` 结构不同，请以实际 JSON 为准。

---

## 路由注意事项

> ⚠️ **禁止在手动添加嵌套路由后运行 `npm run router`**

`npm run router` 会重新生成 `src/router/routerInfo.js`，**覆盖**任何手动添加的 `children` 配置。

正确做法：
1. 手动编辑 `src/router/routerInfo.js` 添加路由
2. 不要运行 `npm run router`

---

## 常见问题

**Q: 图片全部 404？**  
A: 检查 `STATIC_BASE` 是否正确，确认图片已上传到对应 public 目录。

**Q: 缩放后出现白边 / 黑边？**  
A: 正常现象（信箱效果），调整 `.dcv-shell` 的 `background` 颜色即可。

**Q: 文本位置偏移？**  
A: 检查 `CONTENT_SHIFT_X/Y` 是否填写正确。

**Q: 图表区有残留的静态切片压在 ECharts 上？**  
A: 将该图层 id 加入 `_chart_zones.json` 对应 zone 的 `excludeLayerIds` 数组。

**Q: 只有背景和图表，文字/面板/地图全没有？**  
A: 见 `chart-feature-playbook.md` §11。先跑 `verify-board-render-plan.mjs`；常见原因是 boardRender copy-paste 后 icon 分支遗留旧 `getXxxLayerPublicPath`（规则 74）。
