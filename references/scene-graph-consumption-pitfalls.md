# scene-graph-consumption-pitfalls.md

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

**适用轨道**：A 轨道（Sketch MeaXure → scene-graph）  
**目标**：在人工验收前，用确定性手段发现并修掉"数据有、页面无"的所有遗漏，以及"数据有、被错误排除"的所有误过滤。  
**快速定位**：直接跳到对应症状的章节。

---

## 一、核心认知：attrs.css[] 不完整是系统性事实，不是个例

MeaXure 把可见样式分两路写：
- **`attrs.css[]`**：MeaXure 能用标准 CSS 表达的属性（background-image 渐变、opacity、border-radius、transform、box-shadow）→ 可被 `parseCssArray` 直接消费
- **`attrs.borders[]` / `attrs.shadows[]` / `attrs.fills[]`**：结构化数据，**不一定**有对应 CSS 输出

MeaXure 已知的 **CSS 输出缺口**（数据有但 CSS 没有）：

| 情形 | 原因 | 影响 |
|---|---|---|
| **渐变描边**（`attrs.borders[].fillType === 'Gradient'`） | CSS `border-image` 与 `border-radius` 原生不兼容，MeaXure 放弃输出 | 描边消失 |
| **Inner shadow**（内阴影） | MeaXure 模板不输出 `box-shadow: inset` | 内阴影消失 |

MeaXure **正常输出**的情形（数据与 CSS 均有）：
- 普通阴影：`attrs.shadows[]` + CSS `box-shadow` ✅
- 实色描边：`attrs.borders[].fillType === 'Color'` + CSS `border:` ✅（有 border-radius 时可能降级为 outline）
- 不透明度：`attrs.opacity` + CSS `opacity` ✅
- Transform：CSS `transform` ✅

**铁律**：`parseCssArray(attrs.css)` 和 `synthBorderFromAttrs(attrs)` 必须**同时调用**，两者互补，缺一必漏。

---

## 二、消费侧遗漏：五类情形与修复模式

### 2-A 渐变描边（Gradient Border）→ box-shadow 合成

**检测**：`attrs.borders[]` 有数据 + `attrs.css[]` 无 `border:` 声明 + 当前为 `render-vector`

**根因**：见上节。MeaXure 放弃输出，数据只在 `attrs.borders[]` 结构化字段里。

**修复**（`synthBorderFromAttrs` 函数，落地在 `renderUtils.js`）：

```js
export function synthBorderFromAttrs(attrs) {
  const borders = attrs.borders || []
  if (!borders.length) return {}
  // attrs.css[] 已有 border: 声明时跳过（避免重复/覆盖）
  const hasExplicit = (attrs.css||[]).some(c => /^border\s*:/i.test(String(c)) && !/border-radius/i.test(String(c)))
  if (hasExplicit) return {}
  const insetParts = []
  for (const b of borders) {
    const thick = b.thickness || b.width || 1
    let color = ''
    if (b.fillType === 'Gradient') {
      // 取不透明度最高的色值 stop 作为代表色（唯一能与 border-radius 共存的方案）
      const stops = b.gradient?.colorStops || b.colorStops || []
      const best = stops.reduce((m, s) => {
        const a = s.color?.alpha ?? 255
        return a > (m.color?.alpha ?? 0) ? s : m
      }, stops[0] || { color: { alpha: 0 } })
      if (best.color?.rgb) {
        const { r, g, b: bl } = best.color.rgb
        const a = best.color.alpha <= 1 ? best.color.alpha : best.color.alpha / 255
        color = `rgba(${r},${g},${bl},${a.toFixed(2)})`
      }
    } else if (b.color?.rgb) {
      const { r, g, b: bl } = b.color.rgb
      const a = (b.color.alpha ?? 255) <= 1 ? b.color.alpha : b.color.alpha / 255
      color = `rgba(${r},${g},${bl},${a.toFixed(2)})`
    }
    if (!color) continue
    const pos = b.position || 'Center'
    if (pos === 'Inside') insetParts.push(`inset 0 0 0 ${thick}px ${color}`)
    // Center/Outside → outline（不影响 border-radius）
  }
  if (insetParts.length) return { boxShadow: insetParts.join(', ') }
  return {}
}
```

**消费端 render-vector 分支**（三路 merge，缺一不可）：

```js
const style = {
  ...boxStyle(node.rect),
  ...parseCssArray(node.attrs.css || []),   // MeaXure 能表达的 CSS
  ...synthBorderFromAttrs(node.attrs),       // MeaXure 无法表达的渐变描边补偿
  zIndex: node.z,
}
```

---

### 2-B render-slice 切片 CSS：哪些该消费、哪些必须剔除（含 transform 二次变换陷阱）

**核心原则**：切片（`type:slice`）的 PNG 是 MeaXure 按图层在画板上的**最终渲染外观**导出的，几何变换（翻转/旋转/倾斜）**已经烘焙进像素**。所以切片的 css 要**区分对待**：

| css 声明 | 切片该怎么做 | 理由 |
|---|---|---|
| `transform: scaleX(-1)` / `scaleY` / `rotate` / `matrix` / `skew` / `translate` | **必须剔除（delete）** ⛔ | 已烘焙进 PNG，再施加一次 = 二次变换（左括号被翻成右括号） |
| `background-image` / `background` | 忽略（PNG 比 CSS 渐变更精确） ✅ | 切片是 `<img src>`，背景由 PNG 本身承载 |
| `opacity` | 应用 ✅ | 透明度不会烘焙进 PNG（导出是不透明像素） |
| `mix-blend-mode`（代码另行判定） | 按需应用 ✅ | 混合模式是叠加阶段属性，非烘焙 |

> ⚠️ **历史教训（已订正）**：本文档早期版本曾写「slice 的 `transform: scaleX(-1)` 必须应用到 `<img>`」——这是**错误的**，正是它导致了 `位图备份 11`（左括号）被渲染成右括号的事故。切片的 transform 一律剔除。详见 hard-won-rules 规则 49。

**正确消费代码**（`Index.vue` render-slice 分支）：

```js
const style = { ...boxStyle(node.rect), zIndex: node.z }
if (node.attrs.css?.length) {
  const sliceCss = parseCssArray(node.attrs.css)
  delete sliceCss.transform   // ⛔ 翻转/旋转已烘焙进 PNG，剔除防二次变换
  Object.assign(style, sliceCss)  // 保留 opacity 等非烘焙属性
}
```

**对比 render-vector**：矢量是按 geometry 实时绘制的 DOM，没有"烘焙"，`transform` **必须保留**。这是 slice 与 vector 消费 css 的根本区别——不能共用一段无差别 `Object.assign`。

---

### 2-C 阴影（shadows）—— 通常由 MeaXure 正确输出，但要验证

**检测**：`attrs.shadows[]` 有数据 → 检查 `attrs.css[]` 是否有 `box-shadow`。

若 css 有 `box-shadow` → `parseCssArray` 已覆盖 ✅  
若 css **无** `box-shadow` → MeaXure 未输出（罕见），需手动合成：

```js
// 仅在 css 无 box-shadow 时才需要
function synthShadow(attrs) {
  const sh = attrs.shadows || []
  if (!sh.length) return {}
  const inCss = (attrs.css || []).some(c => /box-shadow/i.test(String(c)))
  if (inCss) return {}
  const parts = sh.map(s => {
    const {r, g, b} = s.color?.rgb || {r:0,g:0,b:0}
    const a = (s.color?.alpha ?? 255) <= 1 ? s.color.alpha : s.color.alpha / 255
    return `${s.offsetX||0}px ${s.offsetY||0}px ${s.blur||0}px ${s.spread||0}px rgba(${r},${g},${b},${a.toFixed(2)})`
  })
  return { boxShadow: parts.join(', ') }
}
```

---

### 2-D 面板背景 CSS 遗漏（parseCssArray 解析失败边界）

**parseCssArray 按第一个 `:` 切分**，含多个 `:` 的值（如 `rgba(8,80,255,0.12)`）不受影响——`indexOf(':')` 只取第一个，后续是 value 的一部分。

**真正的解析失败场景**：
- **MeaXure css 行尾分号写入 inline style**（`opacity: 0.63;` → 浏览器忽略）→ `parseCssArray` **必须** `val.replace(/;\s*$/, '')`（规则 66）
- `border-radius: NaNpx 8px 8px`（MeaXure 输出 NaN，浏览器忽略该属性）→ `normalizeCssValue` 将 `NaNpx` 置 `0` 或跳过
- 空声明（空字符串） → `parseCssArray` 已跳过 ✅

标准实现：`templates/shared/vectorStyle.mjs`

---

### 2-E object-fit 拉伸（render-slice PNG 比例与 rect 不符）

**检测**：`audit-asset-consumption.mjs` 的 `aspect-distort` 类型。

**原因**：同一行多个 KPI 图标，MeaXure 给不同元素的 rect 口径不一致（一组按整体切片尺寸，另一组按局部图标尺寸），与 PNG 自然比例不符 → `<img>` 默认 `fill` 拉伸。

**修复**：数据驱动，不写死逻辑。页面目录下建 `data/slice-fit.json`：

```json
{
  "月总指标量": { "fit": "cover", "position": "left center" },
  "月总指标B量": { "fit": "cover", "position": "left center" }
}
```

消费端（render-slice 分支，file 名 → 去扩展名查表）：

```js
const fit = SLICE_FIT[fitKeyOf(filePath)]
if (fit) { style.objectFit = fit.fit; style.objectPosition = fit.position }
```

**fit 选择原则**（必须肉眼看 PNG 内容确认，不能机器自动采用）：
| 情形 | fit | position |
|---|---|---|
| 宽条图（主体在左，右侧是装饰连接线），塞进方框 | `cover` | `left center` |
| 正方形/竖图塞进宽扁框 | `contain` | `center center` |
| 发光/blend 大背景层（轻微比例差） | 保持 `fill`（默认），不设 fit | — |

### 2-F 对称 KPI「有层但不对」（dispose 不一致，非漏层）

**症状**：Sketch 标注存量/增量指标率卡片一致；一侧 `矩形背景 2`+`编组 40` slice 正常，另一侧 `矩形备份 5`+isometric 矢量（方框 icon、角标异常）。或 fix 后卡片出现在**下一业务区块**（如模块C表格）。

**分诊**（见 `symmetric-kpi-override.md`）：

| 类型 | 检测 | 修复 |
|------|------|------|
| 漏导 | 目标 y 无 168×83 卡片 | dy 镜像参考行 |
| **处置不一致** | 同 pitch 出现 `矩形背景 2` 与 `矩形备份 5` | `excludeNativeIds` + clone 参考行 |
| dy 锚点错 | clone y 落入下一 panel 标题/表格区 | dy = 参考行.y − 目标槽.y，非 KPI.y+pitch |

**Implement 清单**：
1. `node detect-symmetric-module-gaps.mjs` → 读 `dispositionMismatches`
2. 复制 `assets/symmetric_module_clones.template.json` → `data/_symmetric_module_clones.json`
3. `renderLayers` 过滤 `excludeNativeIds`；clone 层 `zOverrideBySourceId`

**勿混淆**：`kpi-icon-backup`（x≈2153）≠ 卡片 `编组 40`；表头「指标率」（y≈754, `#D9E7FF`）≠ KPI 卡片文案。

---

## 三、错误过滤：六类情形与修复模式

过滤逻辑出错的后果是"数据提取正确 + disposition 正确 + 消费代码正确，但元素根本没进渲染"——**最难定位**，因为看代码没问题，看页面却没有。

### 3-A isInsideChartZone 误过滤面板背景（最常见）

**症状**：面板背景渐变消失，但面板上方的 ECharts 图表和文字正常。

**根因**：面板背景层（大面积 形状结合）的**几何中心**落在它所包含的图表 zone 内 → `isInsideChartZone` 返回 true → render-vector 分支 `continue` → 背景消失。

面板背景的中心**必然**落在子 zone 内——zone 是为面板内的图表区定义的，而面板背景包含整个面板。

**修复**：加面积门禁。若元素面积 ≥ zone 面积的 90% 且宽高均 ≥ zone 的 85%，视为背景层，保留：

```js
export function isInsideChartZone(rect, name) {
  if (!rect) return false
  if (KEEP_IN_ZONE_RE.test((name || '').trim())) return false
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const elemW = rect.w || 0, elemH = rect.h || 0
  return CHART_ZONES.some((z) => {
    const r = z.rect
    if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) return false
    // ← 面积门禁：背景面板 ≈ zone 大小，图表元素远小于 zone
    if (elemW * elemH >= r.w * r.h * 0.9 && elemW >= r.w * 0.85 && elemH >= r.h * 0.85) return false
    return true
  })
}
```

**为什么 0.9 是安全的**：真实图表系列元素（柱宽 5-20px，折线节点 8×8px）面积比 zone 小 2-3 个数量级，不可能触发此门禁。背景面板面积接近或超过 zone 面积。

**定义新 zone 时必做**：扫描 zone 范围内的所有 `render-vector` 节点，确认是否有大面积背景层，验证面积门禁能正确保留它们。

---

### 3-B KEEP_IN_ZONE_RE 白名单遗漏（切片被排除）

**症状**：某背景切片（如「位图备份 7」）在图表 zone 内，被 `isInsideChartZone` 过滤，图表区背景消失。

**根因**：`isInsideChartZone` 的 `KEEP_IN_ZONE_RE` 白名单没有包含该切片的命名。

**修复**：定义新 zone 后，必须扫描 zone 区域内的所有 `render-slice` 节点（尤其是背景/装饰层），将它们的名称加入白名单：

```js
const KEEP_IN_ZONE_RE =
  /^(框框|面板背景|矩形|BG|编组备份 ?[0-9]*|位图备份 ?[0-9]*|编组 16备份.*|配图|工单管理|大屏\/.*|第[一二三]产业)$/
```

**扫描命令**（加 zone 后立即运行）：

```bash
node -e "
const sg=require('./data/scene-graph.json')
const zone={x:155,y:238,w:540,h:318}  // ← 替换为新 zone 的 rect
const inZone=sg.nodes.filter(n=>{
  if(!n.rect||n.disposition?.kind==='container')return false
  const cx=n.rect.x+n.rect.w/2,cy=n.rect.y+n.rect.h/2
  return cx>=zone.x&&cx<=zone.x+zone.w&&cy>=zone.y&&cy<=zone.y+zone.h
})
inZone.forEach(n=>console.log(n.disposition?.kind,n.name,Math.round(n.rect.x),Math.round(n.rect.y),Math.round(n.rect.w)+'x'+Math.round(n.rect.h)))
"
```

`render-slice` 中的背景切片 → 加到 `KEEP_IN_ZONE_RE`；`render-vector` 中的大面积背景 → 靠面积门禁（3-A）保护。

---

### 3-C SLICE_SKIP 碰撞集合误放正常切片

**症状**：某图标或背景图消失，但资产目录中文件存在，`audit-asset-consumption.mjs` 也显示资产存在。

**根因**：`SLICE_SKIP`（从 `slice-asset-audit.json` 的 `skipIds` 读取）把该节点的 id 列为跳过。可能原因：上次跑 `audit-slice-assets.mjs` 时该文件不存在 → 被标记 skip，后来文件补上了但 json 未更新。

**修复**：
1. 重新跑 `audit-slice-assets.mjs` 生成新的 `slice-asset-audit.json`
2. 或手动从 `skipIds` 数组里删除该节点的 id

**诊断**：
```js
// 在 Index.vue 顶部临时加
console.log('SLICE_SKIP:', SLICE_SKIP.size, [...SLICE_SKIP].slice(0,5))
// 再用 ID 反查 scene-graph 确认是否为误放
```

---

### 3-D PIE_GAP_ZONES 抑制范围过大

**症状**：某装饰矢量元素（颜色色块/边框线）在饼图缺口区附近，被 `isInsidePieGapZone` 误抑制。

**根因**：`PIE_GAP_ZONES` 定义的 rect 范围过大，覆盖了缺口区之外的元素。

**修复**：缩小 PIE_GAP_ZONES 的 rect，以饼图扇区的实际尺寸为准，留 10px 安全边距：

```js
export const PIE_GAP_ZONES = [
  { id: 'pieChartZoneGap', rect: { x: 420, y: 80, w: 160, h: 80 } }, // 示例：扇区级 zone，非整 panel
]
```

**注意**：`isInsidePieGapZone` 只过滤 `render-vector`，不过滤 `render-slice`（底座照常渲染）。

---

### 3-E 去重逻辑误去重（dupKey 碰撞）

**症状**：两个不同位置的元素，只渲染了一个。

**根因**：`renderItems` 去重的 `dupKey` 构造：

```js
const dupKey = [kind, px(left), px(top), px(width), px(height), src||content||name||''].join('|')
```

若两个不同元素的 name 相同（如"形状结合"）、位置相同（整数化后）、kind 相同 → 被认为重复。

**场景**：同一面板里有多个 `形状结合` vector，位置不同但尺寸相同，且四舍五入后坐标一致。

**修复**：在 dupKey 里加入 `node.id` 或加入 `zIndex` 区分：

```js
// 方案：仅对 slice 做位置去重（有图片文件名可区分），vector 和 text 用 id 区分
const dupKey = it.kind === 'slice'
  ? [it.kind, px(s.left), px(s.top), px(s.width), px(s.height), it.src].join('|')
  : it.key  // ← render-vector/text 用唯一 key，不去重（由 z 序自然叠加）
```

或更保守的修复：只对切片的 src URL 相同 + 位置相同时才去重，矢量和文字保留全部（设计稿里相同位置的两个矢量通常是有意叠加的半透明层）。

---

### 3-F TEXT_ARTIFACT_RE 误过滤正常文字

**症状**：某文字元素在页面上消失。

**根因**：MeaXure 对带描边的文字会附加 `border: 1px solid #979797` CSS 作为 artifact 标记，消费端用 `TEXT_ARTIFACT_RE` 过滤这类碎片文本以避免双渲染。但若某个正常文字元素恰好有这条 CSS（设计稿里真的给文字加了灰色 border），会被误过滤。

**识别**：artifact 文字的特征：
- `border: 1px solid #979797` 是 MeaXure 专用标记色（灰 #979797）
- 正常设计稿里极少给文字加这个颜色的描边

**修复**：若确认是正常文字被误过滤，在 `TEXT_ARTIFACT_RE` 后增加豁免条件：

```js
const TEXT_ARTIFACT_RE = /border:\s*1px\s+solid\s+#979797/i
// 正常渲染：artifact 过滤后，检查内容是否有意义
if (TEXT_ARTIFACT_RE.test(css) && content.trim().length > 0 && !isCompositeTextPresent(content)) {
  continue  // 真正的 artifact
}
```

---

## 四、系统性自检流程（提交前必做）

按以下顺序执行，每项都通过才可交付：

```
Step 1: 资产消费体检（确定性，无需看图）
  node audit-asset-consumption.mjs --scene data/scene-graph.json --assets <资产目录>
  → 检查: missing-asset(404) / aspect-distort(拉伸) / empty-vector(空盒) / unused-asset(冗余)
  → 高优先级: missing-asset 必须全部清零

Step 2: 过滤完整性自查（在浏览器 Console）
  // 打印各 continue 分支命中数
  // 若 render-vector continue 数量 >> (总节点 - 真实图表元素)，isInsideChartZone 可能过激
  const sg = <import scene-graph.json>
  const renderV = sg.nodes.filter(n => n.disposition?.kind === 'render-vector')
  // 与 renderItems 实际输出数量对比，差距过大则逐条排查

Step 3: 对照 zone 定义验证背景层保留
  // 对每个 CHART_ZONE，找该 zone 内的所有 render-vector，逐条确认有无大面积背景被误过滤

Step 4: 肉眼对照截图（仅用于发现"有但位置/样式不对"问题，不用于发现"没有"问题）
  // "没有"类问题由 Step 1-3 的确定性手段发现

Step 5: 边界检测
  // 检查 PIE_GAP_ZONES / SLICE_SKIP 是否有因范围过大/过时导致的误过滤
  // 简单方法：把 PIE_GAP_ZONES 和 SLICE_SKIP 临时清空，看页面有无意外出现的色块
```

---

## 五、消费遗漏诊断脚本（可直接运行）

将以下脚本保存为 `_tmp_gap_check.mjs` 在页面目录运行，完成后删除：

```js
import fs from 'fs'
const sg = JSON.parse(fs.readFileSync('./data/scene-graph.json', 'utf8'))
const RENDER = ['render-vector','render-slice','live-text-static','live-text-dynamic']
const issues = []
for (const n of sg.nodes) {
  const k = n.disposition?.kind
  if (!k || !RENDER.includes(k)) continue
  const a = n.attrs || {}
  const css = (a.css || []).join(' ')
  const r = n.rect || {}
  const pos = `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`
  // A: 渐变描边在 render-vector 但无 box-shadow CSS（synthBorderFromAttrs 会处理，已知安全）
  if (k==='render-vector' && a.borders?.some(b=>b.fillType==='Gradient') && !/box-shadow/i.test(css))
    issues.push({sev:'INFO',type:'gradient-border-no-css',name:n.name,pos,note:'synthBorderFromAttrs 已覆盖'})
  // B: 阴影在 attrs 但无 box-shadow CSS（罕见，MeaXure 通常会输出）
  if (a.shadows?.length && !/box-shadow/i.test(css))
    issues.push({sev:'HIGH',type:'shadow-no-css',name:n.name,pos})
  // C: render-slice 有 border
  if (k==='render-slice' && a.borders?.length && !/border\s*:/i.test(css))
    issues.push({sev:'MID',type:'slice-border-unconsumed',name:n.name,pos})
  // D: render-vector 无任何可渲染样式（empty-vector）
  if (k==='render-vector') {
    const hasFill = a.fills?.length || a.borders?.length || a.shadows?.length
    const hasCss = /background|border(?!-radius)|gradient|box-shadow/i.test(css)
    if (!hasFill && !hasCss)
      issues.push({sev:'MID',type:'empty-vector',name:n.name,pos})
  }
}
const high = issues.filter(i=>i.sev==='HIGH')
const mid = issues.filter(i=>i.sev==='MID')
console.log(`HIGH: ${high.length}, MID: ${mid.length}, INFO: ${issues.filter(i=>i.sev==='INFO').length}`)
for(const i of [...high,...mid]) console.log(`  [${i.sev}] ${i.type} [${i.name}] ${i.pos}`)
```

---

## 六、快速排查决策树

```
页面上某元素消失
│
├── 1. 看 scene-graph：该节点 disposition.kind 是什么？
│   ├── exclude:* / container → 正常，disposition 已决定不渲染
│   └── render-vector / render-slice / live-text-* → 进入 2
│
├── 2. 在 Index.vue renderItems 里打 log，确认 node 是否进入渲染循环
│   ├── 没进入 → scene-graph.json 文件是否最新？重跑 extract-all-elements.mjs
│   └── 进入了 → 进入 3
│
├── 3. 哪个 continue 条件命中了它？（逐个 continue 打 log）
│   ├── isInsideChartZone → 检查面积门禁（3-A）；检查 KEEP_IN_ZONE_RE 白名单（3-B）
│   ├── SLICE_SKIP.has → 检查 slice-asset-audit.json，重新生成（3-C）
│   ├── isInsidePieGapZone → 检查 PIE_GAP_ZONES 范围（3-D）
│   ├── 去重 dupKey → 检查 kind/位置/name 是否与另一节点碰撞（3-E）
│   ├── TEXT_ARTIFACT_RE → 检查是否误过滤正常文字（3-F）
│   └── PRESSED_SLICE_RE / SCREEN_BLEND_RE / 蒙版RE → 检查名称正则是否过宽
│
└── 4. 进入渲染、没被过滤，但页面仍不可见
    ├── z-index 被更高 z 的不透明切片遮挡 → 用 browser DevTools 元素检查器
    ├── style 有 backgroundImage 但 parseCssArray 解析失败 → console.log(item.style)
    ├── render-vector 有 borders 但 synthBorderFromAttrs 未合成颜色（全透明 stop）→ 检查函数输出
    └── opacity × gradient 叠加极低（如 0.63 × 0.12 ≈ 8%）→ 正常，设计稿本就是微妙叠加
```

---

## 七、规则编号速查

| 规则 | 简述 |
|---|---|
| 规则 43 | disposition 可渲染判据必须含 border/shadow/gradient，不能只认 fill |
| 规则 44 | 禁止自由发挥——ECharts 只在设计稿真有该图形且能忠实重建时才叠加 |
| 规则 45 | 切片 rect 与 PNG 比例不符必拉伸——按内容定 object-fit，数据驱动落 slice-fit.json |
| 规则 46 | 人工挑错前先跑 audit-asset-consumption.mjs（六类确定性体检） |
| 规则 47 | MeaXure 不输出渐变描边 CSS——消费端必须从 attrs.borders[] 自行合成 box-shadow |
| 规则 48 | 面板背景中心落在子 zone 内——isInsideChartZone 必须加面积门禁（≥90%） |
| 规则 49 | 切片 transform 已烘焙进 PNG——render-slice 必须 delete transform 防二次变换 |
| 规则 50 | 素材引用是「位置→objectID→exportable.path」唯一确定映射，禁止视觉识别/尺寸猜 |
| 规则 51 | MeaXure 不为椭圆输出 border-radius——按图层名 `/椭圆\|oval\|ellipse/i` 自动补 50% |

详细原因和代码示例见 `references/hard-won-rules.md` 对应条目。
