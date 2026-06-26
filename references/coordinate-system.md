# 坐标系 + 锚点计算 + 布局判定

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：meaxure-vue-restore（B 轨道，完整保留）

---

## 核心公式

```
component_left = manifest_layer.x - anchor.left
component_top  = manifest_layer.y - anchor.top
```

结果必须在 `[0, anchor.width]` 和 `[0, anchor.height]` 范围内——否则锚点边界有误。

---

## 读取 manifest 数据

```powershell
# Windows PowerShell
$m = Get-Content "manifest.json" -Encoding UTF8 -Raw | ConvertFrom-Json

# 查询指定区域的 slice 图层
$m.layers | Where-Object { $_.kind -eq 'slice' -and $_.y -ge [TOP] -and $_.y -le [BOTTOM] } |
  Select-Object file, x, y, w, h | Sort-Object y | Format-Table

# 查询指定区域的 text 图层（确认标签位置和字号）
$m.layers | Where-Object { $_.kind -eq 'text' -and $_.y -ge [TOP] -and $_.y -le [BOTTOM] } |
  Select-Object text, x, y, fontSize | Sort-Object y | Format-Table
```

```bash
# macOS/Linux（jq）
jq '[.layers[] | select(.kind=="slice" and .y>=TOP and .y<=BOTTOM)] | sort_by(.y)' manifest.json
```

---

## 锚点（anchor）验证

锚点定义了每个动态组件的占位区域（存储在 anchors.json）。

**验证条件**：
```
layer.x >= anchor.left  AND  (layer.x + layer.w) <= (anchor.left + anchor.width)
layer.y >= anchor.top   AND  (layer.y + layer.h) <= (anchor.top + anchor.height)
```

**超出时**：更新 anchors.json，扩展 width 或 height。

---

## 锚点推导（从零建立新锚点）

取该区域所有图层的 bounding box：

```javascript
const left   = Math.min(...layers.map(l => l.x))
const top    = Math.min(...layers.map(l => l.y))
const width  = Math.max(...layers.map(l => l.x + l.w)) - left
const height = Math.max(...layers.map(l => l.y + l.h)) - top
```

---

## CONTENT_SHIFT 处理（设计稿含完整页面壳）

当设计稿包含左导航+顶栏、**且宿主为嵌入 BasicLayout**（平台已提供 chrome）时：

1. 从 `_all_elements.json` 检测 chrome 边界（见 `meaxure-track.md` Step 0-A0.4），勿硬抄其他项目常量
2. 渲染时 **filter** `x < CONTENT_SHIFT_X || y < CONTENT_SHIFT_Y` 的层（侧栏/顶栏切片）
3. 其余层坐标：`x -= CONTENT_SHIFT_X`，`y -= CONTENT_SHIFT_Y`
4. 画板尺寸：`STAGE_W = board.w - SHIFT_X`，`STAGE_H = board.h - SHIFT_Y`

```javascript
function shiftRect(rect) {
  if (!rect || rect.x < CONTENT_SHIFT_X || rect.y < CONTENT_SHIFT_Y) return null
  return { x: rect.x - CONTENT_SHIFT_X, y: rect.y - CONTENT_SHIFT_Y, w: rect.w, h: rect.h }
}
```

**锚点架构**还需同步 `anchors.json` 的 left/top。**§3.9 纯 stack 验证页**只需 `shiftRect`，无需 anchors 文件。

> CONTENT_SHIFT 是「嵌入宿主」的坐标映射，**不是**项目业务 workaround。全屏独立路由（保留设计稿 chrome 切片）时 **SHIFT = 0**。

---

## 图标/文字排列判定

| 条件 | 排列方式 | 实现 |
|------|---------|------|
| `text.y > icon.y + icon.h` | **竖排**（图标→标签→数值，从上到下） | flex-direction: column |
| `text.x > icon.x + icon.w` 且 `text.y ≈ icon.y` | **横排**（图标左 \| 文字右） | flex-direction: row |
| `icon.y ≤ text.y ≤ icon.y+icon.h` 且 `text.x ≈ icon.x` | **内嵌**（标签在图片内，只渲染数值） | position: absolute 叠加 |

---

## Vue 组件坐标实现模式

### 竖排图标

```html
<!-- top = icon_y - anchor.top -->
<div :style="{ position:'absolute', top: rowTop+'px', left:0, width:'100%' }">
  <img :style="{ position:'absolute', left: iconLeft+'px', top:0,
                 width: iw+'px', height: ih+'px' }"
       :src="getAssetPath(iconFile)" draggable="false" />
  <div :style="{ position:'absolute', left: textLeft+'px', top:0 }">
    <span style="font-size:18px; color:#7AD5ED">{{ label }}</span>
    <div style="display:flex; align-items:baseline; gap:3px">
      <span style="font-size:32px; color:#fff">{{ value }}</span>
      <span style="font-size:14px; color:#fff">{{ unit }}</span>
    </div>
  </div>
</div>
```

### 横排图标

```html
<!-- left/top = icon manifest坐标 - anchor left/top -->
<div :style="{ position:'absolute', left: iconLeft+'px', top: iconTop+'px' }">
  <img :style="{ position:'absolute', left:0, top:0,
                 width: iw+'px', height: ih+'px' }"
       :src="getAssetPath(iconFile)" draggable="false" />
  <div :style="{ position:'absolute', left: textOffset+'px', top:'2px' }">
    <span style="font-size:16px; color:#7AD5ED">{{ label }}</span>
    <span style="font-size:22px; color:#fff">{{ valueText }}</span>
  </div>
</div>
```

### 组件容器（所有情况都需要）

```html
<div style="position:relative; width:100%; height:100%; pointer-events:none">
  <!-- 子元素 -->
</div>
```

---

## getAssetPath 工具函数

```javascript
// assetUrl.js（每个项目适配一次）
import aliases from './assetAliases.json'  // { "foo.png": "foo@2x.png" }
const BASE = '/static/your-page/assets'

export function getAssetPath(filename) {
  return `${BASE}/${encodeURIComponent(aliases[filename] || filename)}`
}
```

使用：
```javascript
import { getAssetPath } from '../assetUrl.js'
// <img :src="getAssetPath('图标.png')" />
```

---

## 重要注意点

- manifest 中所有 `x/y/w/h` 均为 **1x CSS 像素**，直接用于 CSS
- `@2x.png` 文件名不影响尺寸值（CSS 尺寸 = manifest w/h，**不除以 2**）
- 锚点外的图标由切片层渲染，组件内**不要重复**（否则出现双重叠影）
- 可交互区域加 `pointer-events: auto`（父容器通常设 `pointer-events: none`）

---

## 自适应缩放四模式与得失对比

大屏/驾驶舱页面常见四种缩放策略，**Step 0-A0 选定后再实现**：

| 模式 | 实现方式 | 得 | 失 | 适用场景 |
|------|---------|----|----|---------|
| **嵌入：宽度铺满 + 纵向滚动** | `scale = viewportW / STAGE_W`；`STAGE = board − CONTENT_SHIFT`；内层 `overflow-y:auto` | 与 BasicLayout 其他页一致；不牺牲宽度 | 需正确 SHIFT + 滚动容器层级 | **平台内大屏/驾驶舱（推荐）** |
| **transform:scale 整体缩放（letterbox）** | `scale = min(vw/W, vh/H)` 居中 | 一屏看全，无滚动 | **牺牲宽度或高度**；嵌入时易与平台壳冲突 | 全屏独立 demo、纯像素对比 |
| **transform:scale 仅缩小（cap 1）** | `scale = min(vw/W, 1)` | 不放大模糊；宽屏两侧可能留白 | 超宽屏不铺满 | 旧版 sampleCockpit 等业务页 |
| **vw/vh 等比换算** | 设计 1920px → `100vw` | 跟随视口 | 小数误差；字体 vw 小屏异常 | 不追求像素级精准的响应式大屏 |
| **固定 1920px，超出横向滚动** | 不缩放 | 实现最简单 | 小屏体验差 | 设计演示/原型 |

**推荐**：
- 嵌入 BasicLayout → **宽度铺满 + 纵向滚动**（上表第 1 行）
- 无壳全屏验收 → letterbox（第 2 行）

**viewport 宽度测量**：用 `ref="viewport"` 的 `getBoundingClientRect().width` + `ResizeObserver`，**不要**只用 `window.innerWidth`（不含侧栏，scale 会算错）。

**Windows 显示缩放陷阱**（transform:scale 模式）：
当系统 DPI 设为 125% / 150% 时，`vp.clientWidth` 返回的是 CSS 像素（设备无关），通常正确。但部分旧版 Chrome 在 Windows 高 DPI 下 `clientWidth` 可能返回物理像素。遇到明显缩放比异常时，用 CDP 诊断：
```javascript
// CDP: 获取实际缩放比
window.devicePixelRatio  // 物理像素/CSS 像素比
document.documentElement.clientWidth  // CSS 像素宽度（应为 viewport 宽）
```
