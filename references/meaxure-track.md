# A 轨道：Sketch MeaXure → Vue 完整流程

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源整合：sketch-meaxure-to-vue + datav-dashboard

---

## 触发特征

目录包含以下任意组合：
- `index.html`（内含 `let data = {` 和 `artboards` 数组）
- `links/` 目录（每个 .html 文件对应一个页面，内含 artboardIndex）
- `preview/` 目录（预览图，仅用于 QA，不用于还原）
- `assets/` 或 `images/` 目录（切图资源）

---

## 阶段 0：准备期（必须完成才能进入阶段 1）

> **这一步是最容易被跳过、代价最大的一步。**
> 所有「字体一直不对」「内容一直被裁」「坐标系统性偏移」「宽度被 letterbox 压扁」的问题，根因都在这里。
> Step 0-A0 ~ 0-E 必须按顺序完成，每步均有完成判定，未达标禁止进入下一步。

---

### Step 0-A0：宿主布局 + 渲染架构决策（写 Index.vue 前的硬性门禁）

> **来源**：sampleCockpitV2 技能验证页（1920×1882）。未做本步曾导致：叠 overlay 返工 → 对照旧版被否 → 全屏 letterbox 丢壳/压宽度 → 最终才收敛到「嵌入 + layer_stack + 宽度 scale + 纵向滚动」。

**用 TodoWrite 写入以下决策（三项缺一不可）：**

#### A0.1 宿主模式

| 模式 | 路由位置 | 设计稿 chrome | 典型用途 |
|------|---------|--------------|---------|
| **嵌入 BasicLayout** | `BasicLayout` 的 `children`（如 `path: 'foo/Index'`） | 平台已提供侧栏/顶栏 → **CONTENT_SHIFT 跳过设计稿 chrome 层** | 与平台其他大屏页一致的业务/验证页 |
| **全屏独立路由** | 与 `BasicLayout` **平级**的顶层 `path: '/foo/Index'` | 保留全画板 w×h（含设计稿侧栏/顶栏切片） | 纯像素对比、无平台壳的 demo |

**禁止**：同一页面同时注册嵌套路由 + 顶层路由（Vue Router `name` 冲突，且行为不可预测）。

**检测宿主 CSS（Vue 2 / your-web 类项目）**：
```
Read src/layouts/BasicLayout/Default.vue
查找 .layout-adaptive-root .bigscreen-root → height:100%; overflow:hidden
查找 .bigscreen-root .bigscreen-canvas → 可能 overflow-y:auto（滚动容器层级需与页面 DOM 对齐）
```

#### A0.2 渲染架构（二选一，禁止混用）

| 架构 | 静态像素来源 | 动态区 | 何时用 |
|------|------------|--------|--------|
| **§3.9 切片拼接** | 唯一：`_layer_stack.json` z 序 `v-for` | 活体文本 / ECharts / v-for；对应静态层从 stack **排除** | **skill 能力验证**、高保真静态还原、信息类尚未拆组件前 |
| **锚点 + 动态组件** | slice 层 + `ANCHOR_REPLACED_FILES` 去重 | 各 `*Panel.vue` + 可选项目 overlay | **业务交付**（项目已有 anchor/overlay 体系时） |

**技能验证页硬禁**：引入目标项目 `CockpitDynamicOverlay`、`ANCHOR_REPLACED_FILES`、旧版 `anchors.json` 业务封装——会把 skill 切片拼接与项目二次封装混为一谈，产生叠影且无法判断 skill 缺陷。

#### A0.3 缩放策略（与 A0.1 绑定）

| 宿主 | 推荐 scale | 高度超出 |
|------|-----------|---------|
| **嵌入 BasicLayout** | `scale = viewportW / contentW`（**仅宽度比**） | **纵向滚动**（`overflow-y: auto` 放在 `ref="viewport"` 的内层容器） |
| **全屏独立** | `scale = min(viewportW / boardW, viewportH / boardH)` | 通常 letterbox 居中，无滚动 |

**反模式（V3 弯路）**：嵌入模式下使用 `min(vw/W, vh/H)`——为塞进视口高度而**牺牲宽度**，两侧留黑边。

#### A0.4 CONTENT_SHIFT 检测（仅嵌入模式）

**优先读 Step 0-B 产出 `_host_layout_hint.json`**（`extract-all-elements.mjs` 自动生成）：

```json
{
  "contentShift": { "x": 279, "y": 86 },
  "stage": { "w": 1641, "h": 1796 },
  "confidence": { "x": 0.72, "y": 0.88, "overall": 0.72 },
  "chromeDetected": true,
  "recommendations": { "embedBasicLayout": true, "note": "…" },
  "evidence": { "shiftX": [...], "shiftY": [...] }
}
```

| 字段 | 用法 |
|------|------|
| `contentShift` | 嵌入 BasicLayout 时的 `CONTENT_SHIFT_X/Y` **建议值** |
| `stage` | 内容区画板尺寸（`board − shift`） |
| `confidence.overall` | **≥0.5** 可采信；**<0.5** 须人工对照 preview / 同类页 |
| `evidence` | 侧栏/节标题等判定依据，便于纠偏 |
| `warnings` | 非空则勿盲用 shift |

脚本无法替你做产品决策：`embedBasicLayout` 仅为建议。无 chrome 时 shift 应为 `{0,0}`。

手工 fallback（无 hint 文件时）：

```javascript
function shiftRect(rect) {
  if (!rect || rect.x < SHIFT_X || rect.y < SHIFT_Y) return null
  return { x: rect.x - SHIFT_X, y: rect.y - SHIFT_Y, w: rect.w, h: rect.h }
}
const STAGE_W = board.w - SHIFT_X
const STAGE_H = board.h - SHIFT_Y
```

**Step 0-A0 完成判定**：TodoWrite 已记录宿主 / 架构 / 缩放三项；嵌入模式已确认 `contentShift`（来自 `_host_layout_hint.json` 或人工记录依据）。

> **决策门禁（自动化执行，替代人工判断）**
>
> ```bash
> # Step 1: 全量提取（产出 _host_layout_hint.json）
> node <skill>/scripts/extract-all-elements.mjs <index.html> <assetsDir> <outDir>
>
> # Step 2: 决策门禁（--arch 由任务意图给定）
> node <skill>/scripts/decide-host-layout.mjs <outDir> --arch <layerStack|anchorComponents>
> # exit 0 -> 决策已定，读 _host_decision.json 填变量表后放行
> # exit 3 -> 需人工确认：置信度不足 / 缺 --arch；补参数或写 _host_decision.confirm.json 后重跑
> # exit 1 -> 输入错误（hint 文件缺失 / --arch 非法）
> ```
>
> **未达 exit 0 禁止写 Index.vue。** 三项决策（`host` / `scale` / `renderArchitecture`）均从 `_host_decision.json` 读取，禁止靠经验猜测填值。

---

### Step 0-A：Project Audit — 开始写任何代码前，先排查基础设施

**必须读取并检查以下文件（读完才能开始写代码）：**

#### A1. 全局样式文件

```
Glob 模式：**/global.less, **/global.css, **/global.scss, **/index.less, **/main.less
全部 Read 命中的文件
```

检查是否存在：
```less
* { font-family: ...; }   /* ← 会覆盖所有组件的 font-family */
* { font-size: ...; }
body { font-family: ...; }
```

如果存在 → **立即用 TodoWrite 工具创建一条 todo「所有组件内 font-family/font-size/color/letter-spacing 必须加 !important」**，并在后续每次写 CSS 时主动遵守。

#### A1-b. 字体映射表（配合 `_font_manifest.json`，见规则 58、59）

Step 0-B 产出 `_font_manifest.json` 后：
1. 运行 `scripts/audit-project-fonts.mjs`（**只扫** `src/assets/font/`、导出包 `fonts/`、页面 `fonts/`、`@font-face` 声明路径——见 `references/font-bundling.md`）
2. 生成 `{outDir}/_font_map.json`：`cssAliasToFamily` + `families`（精确族名，**禁止**近似 stack）
3. 范围内缺失 → `_font_acquire.json` + 互联网/设计师获取，**禁止**扩大搜索到 Windows Fonts 或递归 D:\docs
4. Implement 层 `resolveFontFamily()` **只读此映射**，返回单族名 `'${canonicalFamily}'`

#### A6. 静态资源目录探测（写 Index.vue **且复制切图前**必做，见规则 56）

**禁止假设 `public/static/`。** 不同项目 `/static/*` 的物理根不同。

探测命令（按优先级）：
```
Glob: **/webpack.dev.js, **/vite.config.*, **/nuxt.config.*
Read 命中文件 → 找 devServer.static.directory 或 publicDir
```

| 探测结果 | 切图复制目标 | URL 前缀（不变） |
|---------|-------------|----------------|
| `devServer.static.directory = {root}/static`（Muse CLI 典型） | `{root}/static/<模块>/design-assets/` | `/static/<模块>/design-assets/` |
| `publicDir = 'public'`（Vite 典型） | `{root}/public/static/<模块>/design-assets/` | `/static/...` 或 `/模块/...`（以配置为准） |

**复制后 HTTP 探针（exit 非 200 禁止继续）**：
```bash
curl -sI "http://localhost:<port>/static/<模块>/design-assets/<一张切图encode>.png" | head -1
```

页面内仍用项目已有的 `resolveStaticPublicUrl('/static/...')`——它处理 **publicPath 前缀**（如 `/<your-web>`），不替代 static 根目录选择。

#### A2. 动态锚点容器组件

```
Glob 模式：**/*Anchor.vue, **/AnchorBox.vue, **/SliceAnchor.vue
然后 Read 含 .anchor-inner 或类似 overflow 设置的文件
```

检查是否存在：
```css
.anchor-inner { overflow: hidden; }  /* ← 会裁剪超出锚点边界的内容 */
```

如果存在 → **立即改为 `overflow: visible`**，否则所有锚点内的阴影、超出元素都会被裁。

#### A3. 页面根组件

```
Glob 模式：**/pages/<module>/Index.vue, **/views/<module>/Index.vue
```

检查是否有防拖动/防选中设置。如果没有 → **必须补充**：
```less
.board-container {
  user-select: none;
  -webkit-user-select: none;
}
img {
  -webkit-user-drag: none;
  pointer-events: none;
}
```

#### A4. 渲染去重登记（按 Step 0-A0 架构分叉）

**§3.9 切片拼接路径（skill 验证 / 纯 stack 交付）——跳过 ANCHOR_REPLACED_FILES：**
- 静态层**唯一来源** = `_layer_stack.json`；信息类替换时从 stack **排除**假柱/烤死数字等对应层。
- **禁止**再叠项目 `CockpitDynamicOverlay` 等同区域业务组件。
- ⚠️ **文字层强制补全**：`_layer_stack.json` 文字层 `source` 仅含类型标记，`content`/样式全在 `_all_elements.json`。**必须**实现 `enrichTextSource(layer)` 按 id 补全（见规则 52），否则全页文字为空。
- ⚠️ **重复文本层**：必须在渲染循环入口处按 `_render_gaps_report.json` → `duplicateTextGroups.dropId` 构建 `DROP_TEXT_IDS` Set 直接 continue，不能只靠 dedupe 函数兜底（见规则 53）。
- ⚠️ **ECharts 组件**：`@/components/Echarts` 仅部分项目存在，用前先 `Glob "src/**/Echarts.vue"` 确认；不存在改用 `echarts.init(dom)` 方案（见规则 55）。

**锚点 + 动态组件路径（业务交付）——执行原 A4：**

```
Glob 模式：**/manifestData.js, **/sliceData.js, **/*ManifestData.*
Grep 模式：ANCHOR_REPLACED_FILES（在工作区根目录搜）
```

找到 `ANCHOR_REPLACED_FILES`，确认其存在。如果不存在 → **用 Write 工具创建**：
```javascript
export const ANCHOR_REPLACED_FILES = new Set([
  // 凡是 Vue 组件自己渲染的切片图片，都加入此集合
])
```

> 未注册的切片图与组件会叠加显示（双重叠影），这是锚点架构最常见的视觉 bug 之一。

#### A5. Scale 适配逻辑

大屏类页面通常有定宽设计稿 + 自适应视口。Read 页面根组件，确认：
- scale 计算逻辑（取 `min` 还是 `width` 优先？）
- `transform-origin` 是什么（`top left` 还是 `center`？）
- 固定元素是否在 scale 之外

> 不理解 scale 适配，视口坐标换算（Step 4-A Playwright 脚本）会做错。  
> 三种自适应模式详见 `coordinate-system.md`。

#### A6. 现有 UI 组件库清点（强制复用）

```
Glob "src/components/**/*.vue"  → 列出所有组件名
Glob "src/components/bigScreen/**/*.vue"  → 大屏专用组件
Read package.json  → 看 dependencies（vmd-ui, element-ui 等）
```

用 **TodoWrite 创建 todo「已清点 UI 组件库」**，列出 5-10 个可能复用的组件名。写每个组件前先在清单里查：「设计稿里的这个标题/按钮/弹窗，已有组件库里有没有？」

**Step 0-A 完成判定**：

| 子步骤 | 完成标准 |
|--------|---------|
| A1 | 已读全局样式文件 + 已知是否有 `*{font-family}` 覆盖，若有则 TodoWrite 已记录 |
| A2 | 已读锚点容器组件，若有 `overflow:hidden` 已改为 `visible` |
| A3 | 已读页面根组件，防拖动/防选中已确认或已补充 |
| A4 | §3.9 路径：已确认不引入 overlay/ANCHOR_REPLACED；锚点路径：`ANCHOR_REPLACED_FILES` 已确认或已创建 |
| A5 | 已确认 scale 计算逻辑和 transform-origin |
| A6 | TodoWrite 已有「已清点 UI 组件库」条目，含 5+ 组件名 |

---

### Step 0-B：全量元素提取协议

> **核心原则**：提取一次，全程复用。所有视觉属性（坐标/字体/颜色/渐变/阴影/描边/透明度/旋转）在阶段 0 全部落地为结构化 JSON，后续实现步骤只查 JSON，永远不再重新解析 index.html，永远不靠目测猜测。

**脚本调用：**

```bash
node scripts/extract-all-elements.mjs <index.html> <assetsDir> <outDir> [artboardIndex]
```

输入：
- Sketch MeaXure 导出的 `index.html`（含 `let data = {...}`）
- `assets/` 目录路径（验证切片文件实际存在）
- 输出目录；可选 artboardIndex（多画板时指定）

> **真实数据格式注意**（已在 sampleCockpit 设计稿验证，必须遵守）：
> - 画板几何可能是平铺的 `width/height` 字段而非嵌套 `rect`，脚本须对两者做 fallback（`rect || { width, height }`）。
> - 文本字体字段名在真实 MeaXure 导出中常为 **`fontFace`** 而非 `fontFamily`，脚本须兼容 `fontFamily || fontFace`。

#### 提取字段表（递归遍历所有图层，按类型提取）

| 元素类型 | 提取字段 |
|----------|---------|
| **所有类型** | name, type, rect(x/y/w/h), zIndex, opacity, rotation, **css（MeaXure 原样 css 数组，矢量复刻首选来源）** |
| **slice** | exportable 路径列表，@1x/@2x/@3x 文件名映射（经 `resolveAsset()`） |
| **text** | content, **fontFamily / `fontFace`（真实 MeaXure 导出字段名常为 `fontFace`，脚本须兼容 `fontFamily \|\| fontFace`）**, fontSize, fontWeight, **lineHeight**, **letterSpacing**, color/colorRgba（保留 alpha，禁截断 6 位 hex）, textAlign, **fills（文字渐变：gradientStops + gradientAngle，真实色非 `css[]` 占位色）**, **shadows[]（多层投影 + 辉光，如 `#49DFFF 30%`，须逐层提取不可只取首层）** |
| **shape** | **fills（solid/gradient，含 colorStops 和 gradientAngle/from-to）**, **borders（颜色/宽度/样式）**, **radius（borderRadius）**, **shadows[]（多层 offset/blur/spread/color）**, backgroundBlur |
| **group** | 保留为锚点容器；子元素坐标换算为画板绝对坐标 |
| **symbol** | Sketch 复用组件，递归展开其内部图层（按上述各类型规则提取），常含真实内容，**不可遗漏** |
| **文档顶层** | **colors（调色板）/ languages / slices（顶层切片数）**，连同 resolution/unit/colorFormat 一并落 `docMeta`，base64 内嵌图解码落地 |

**旋转元素处理**：`rotation ≠ 0` 的元素，实现时映射为 CSS `transform: rotate(Ndeg)`；覆盖率检测（Step 0-C）需用旋转后的**轴对齐包围盒（AABB）**计算占用区域，避免漏判或误判。

#### 输出文件

```
_all_elements.json    — 全部图层完整属性（后续所有步骤的唯一数据源）
_coverage_map.json    — 画板覆盖率分析（空洞区域坐标 + 面积占比）
_font_manifest.json   — 所有 fontFamily 去重清单 + 出现次数 + needsBundling 分类
```

切片拼接架构（spec §3.9）新增产物：

- `_classification.json`：每层 info/非info 角色 + 理由（可人工复核纠偏）
- `_layer_stack.json`：z 序自底向上渲染清单 + 每元素像素来源
- `_missing_assets.json`：缺源报备（backdrop/card-bg/缺图/缺字体）
- `_host_layout_hint.json`：**Step 0-A0 辅助** — 启发式推断 `contentShift` / `stage` / 嵌入 vs 全屏建议（须结合 `confidence` 人工确认）
- `_render_gaps_report.json`：**§3.9 渲染缺口启发式**（空 group / ghost bitmap shape / 重复文本 / 假柱）— **检测-only**，图标仍须人工写 `_icon_gap_overlays.json` 映射 slice
- `_consume_audit.json`：**消费侧审计**（gradient/solid fills 计数 + gradientTextIds）— 提醒 emit-html/Vue 须用 `templates/shared/textStyle.mjs`
- `_base64_manifest.json`：base64 落地清单（每项标 `bound`：有图层归属者含 `elementId`/`rect` 按层渲染；无归属者仅存档并归 backdrop 报备，不强行放置）
- `_extraction_coverage.json`：全字段消费自检（unmappedFields 非空即缺陷）
- `slice-asset-audit.json` / `slice-asset-gap-report.md`：**切片资产确定性审计**（`audit-slice-assets.mjs`）— 识别 slice 重名碰撞失败方 / 磁盘缺失 / 图片填充 ghost；消费端据 `skipIds` 留空，缺口清单交付使用者补切图

> **`_render_plan.json` 口径**：shape 分 `vector-css`（`hasRenderableStyle`）与 `report-to-designer`（ghost 位图/路径无 exportable）。**禁止**把「无 exportable」等同于「缺切片」——组切片 bbox 内的 table 行、分隔线仍须 `vector-css`。页面渲染以 `_layer_stack.json` 为准；Implement 可兜底补层。

`_font_manifest.json` 结构示例：

```json
{
  "fonts": [
    { "family": "DINAlternate-Bold",      "occurrences": 47, "sampleText": "12000" },
    { "family": "YouSheBiaoTiHei",        "occurrences": 12, "sampleText": "三库两模型" },
    { "family": "SourceHanSansCN-Regular","occurrences": 89, "sampleText": "重点用户数" }
  ],
  "systemFonts": ["PingFang SC", "MicrosoftYaHeiUI"],
  "needsBundling": ["DINAlternate-Bold", "YouSheBiaoTiHei", "SourceHanSansCN-Regular"]
}
```

#### 脚本自检（防静默数据丢失）

`extract-all-elements.mjs` 是整条链的命门。若它静默跳过某些图层（symbol、嵌套 group、旋转元素、未知 type），下游全错且无人发现。**脚本结束时必须打印提取统计**：

```
解析图层总数：N
按类型：slice=A text=B shape=C group=D symbol=E
跳过：M 层
跳过原因分类：{ 未知type: x, 无rect: y, ... }
```

**跳过数 M > 0 时，必须人工逐类确认是否为可接受的跳过（如 Sketch 边框 artifact），否则视为提取不完整。**

> **自动化代替人工逐类确认：运行 skip 层审计脚本**
>
> ```bash
> node <skill>/scripts/audit-skip-layers.mjs <outDir>
> # exit 0 → 所有 skip/type 在白名单内，放行
> # exit 2 → warn 级（opacity-zero / unknown 等）：确认 count 数量合理后可放行
> # exit 3 → error 级：存在未知 skipReason 或未知 layer type，必须处理后重跑
> # 输出 _skip_audit.json（skipAudit + typeAudit + whitelists）
> ```
>
> exit 3 的处理方式：分析 `_skip_audit.json` 的 `errors[]`，若确认安全则将该
> skipReason/type 加入 `audit-skip-layers.mjs` 对应白名单（并记录原因）；
> 若不安全则排查 `extract-all-elements.mjs` 逻辑。**未达 exit 0/2 禁止进入 Step 0-C。**


#### Step 0-B 完成判定（硬性门禁）

| 检查项 | 标准 |
|--------|------|
| `_all_elements.json` 总条数 | > 0（大屏通常 100+ 条） |
| 脚本提取统计 | 已打印；跳过数 M 的每一类已人工确认 |
| text 图层 gradientStops + gradientAngle | 抽查 3 条，渐变文字有实际色值（非空数组）和角度 |
| shape 图层 fills | 抽查 3 条，有填充数据 |
| `_coverage_map.json` 已生成 | uncoveredRegions 数组存在（允许为空） |
| `_font_manifest.json` 已生成 | `fonts` 数组至少含 1 个 fontFamily |
| **切片拼接产物已生成** | `_layer_stack.json` / `_classification.json` / `_missing_assets.json` / `_extraction_coverage.json` / **`_host_layout_hint.json`** / **`_render_gaps_report.json`** 均已生成，且 `_extraction_coverage.json` 的 `ok === true`（无未映射字段） |
| **skip 层审计** | `_skip_audit.json` 已生成；`overallStatus` 为 `ok` 或 `warn`（`error` 必须处理） |
| **`_render_gaps_report.json` 已复核** | `duplicateTextGroups.length > 0` → Index.vue 须 `dedupeTextLayers`；`iconGapCandidates.length > 0` → 须 `_icon_gap_overlays.json` + `iconGapLayers`；`fakeBarShapes.length ≥ 4` → 须 chart zone + ECharts 排除 stack |
| **slice 声明数 vs 磁盘文件数已校验** | 已比对 `exportable` 声明数与磁盘实际文件数（本例 46 声明/43 文件/3 缺失），缺失项列入 `_missing_assets.json` 报备设计师补导（不裁预览兜底） |
| **静态基线 HTML 已生成** | 用 `emit-html.mjs` 产出 1:1 基线，已与原稿/preview 并排比对 |

> **静态基线即证据**：基线 HTML 把所有提取图层渲染出来，与原稿并排对比是发现「缺图层 / 坐标错位 / 渐变色错」最快的手段，也是 Step 0-C 覆盖率检测的视觉依据。基线是证据，不是交付物。

> **说明（旧机制废止）**：旧「Step 0-B 全量样式提取（`_styles_all.json`，仅文本 CSS）」和旧「Step 0-E 手动字体收集」已被本步骤取代并合并。`_styles_all.json` 不再生成；其文本样式/渐变色查询能力已由 `_all_elements.json` 的 text 字段（含 gradientStops/gradientAngle）覆盖。

---

### Step 0-C：覆盖率检测 + 缺源报备

> **触发时机**：Step 0-B 完成后立即执行，禁止在有效视觉空洞未处理时进入阶段 1。

> 🔑 **预览图定位（对齐 §3.9 切片拼接）**：@2x 整画板预览**仅作验证基准**，不为任何元素提供像素，**禁止裁预览当像素源**。
> 本步骤的「真空洞 vs 设计留白」交叉验证逻辑**继续保留**：用于判断「补导出 vs 留白记录」。
> 未被任何图层/css/asset 覆盖的装饰区（页底渐变/全息图）→ 列入 `_missing_assets.json` 的 `backdrop` 报备设计师补导，对应区域留空，**绝不裁预览、不打补丁遮盖**。

> **自动化代替人工 preview 判断：运行空洞分类脚本**
>
> ```bash
> node <skill>/scripts/classify-coverage-gaps.mjs <outDir>
> # exit 0 → 全部 probable-whitespace，放行
> # exit 2 → 存在 probable-gap：须 preview 交叉验证（有内容则补导出，纯背景则记录留白）
> # exit 3 → 存在 critical-gap：必须补导出或写入 _missing_assets.json，不得跳过
> # 输出 _coverage_gap_classification.json（每个空洞的 classification + action + reason）
> ```
>
> **preview 不可用时的降级剧本**：所有 `probable-gap` 按 `critical-gap` 处理（保守策略），
> 逐一尝试补导出；无对应图层则写入 `_missing_assets.json`（kind=whitespace）。
> **阈值说明**：critical ≥ 5% 画板面积 + 密集邻近元素；probable ≥ 1% + 2 个邻近元素；
> 边缘区域豁免两级（均降为 probable-whitespace）。
> 如需调整灵敏度，修改脚本顶部常量 `CRITICAL_RATIO` / `PROBABLE_RATIO` / `NEIGHBOR_DIST`。

#### 覆盖率分析逻辑（5 步）

1. 读 `_coverage_map.json` 的 `uncoveredRegions` 列表
2. 对每个空洞：面积 = w × h，占比 = 面积 / 画板总面积
3. 几何过滤：占比 > 1% 进入候选（排除图层间隙噪声）
4. **preview 交叉验证（关键，区分真空洞 vs 设计留白）**：
   - 对每个候选空洞，从 preview 预览图裁剪对应区域，分析其像素
   - 区域内**有明显内容**（颜色方差大 / 非纯背景色）→ **真缺失**，需补导出或留空报备
   - 区域内**接近纯深色背景**（颜色方差极小，与画板背景色一致）→ **设计留白**，跳过并记录
5. 仅对「真缺失」按面积降序处理（进入下方两阶段流程）

> 纯几何阈值无法区分「缺了插图」和「设计就是空的」。preview 交叉验证既避免漏判真缺失，也避免到处误报补导出。preview 缺失时降级为「全部候选都按真缺失处理 + 提示用户人工确认」。

#### 缺源处理流程（优先级严格顺序，对齐 §3.9）

**首选：引导补导出**
1. 打印空洞区域坐标和预估位置
2. 提示：「请在 Sketch 中选中该区域对应图层，勾选 Exportable 后重新导出，将图片放入 assets/ 并重跑 Step 0-B」
3. 等待用户确认：「已补导出」→ 重跑 0-B；「无法补导出」→ 进入「留空报备」

**无法补导出：留空报备（绝不裁预览兜底）**
1. 把该缺源（装饰底/卡片底/缺图）写入 `_missing_assets.json`（含 `rect` / `kind` / `reason`），在交接说明里报备用户与设计师沟通补导。
2. Vue 实现时对应区域**留空**（开发期可放带 `data-missing` 标记的占位框，交付前转报备），**不生成任何裁预览兜底图、不色块遮盖**。
3. preview 仅作验证基准，不为该区域提供像素。

**禁止事项：**
- 禁止把预览图（整张或裁片）作为背景/底图为任何区域提供像素。
- 禁止跳过此步骤直接进入 Vue 实现。

#### 切片资产确定性审计（slice 重名碰撞 / 磁盘缺失）——sampleMonitor 实录

> **核心认知**：MeaXure 导出常因两类缺陷让「能在标注页 index.html 看到的元素」失去干净像素来源。这两类必须**深度解析 `let data` 图层树 + 比对 assets/ 实际文件**确定性识别，**严禁靠尺寸/AI 看图猜测**，也**严禁裁预览兜底**。识别出的缺口元素一律**精准留空**，由使用者补切图后填充。

**两类导出缺陷（+ 第三类图片填充）：**

| 类型 | 判定（机械、可复算） | 后果 | 根治 |
|------|------|------|------|
| `collision-overwritten` | ≥2 个 slice 的 1x exportable 路径相同但 **rect 尺寸不同** → 同名 PNG 互相覆盖 | 磁盘只剩最后写盘的「胜出者」，其余引用拿到**别人的图**（用错） | 设计师对图层**唯一命名**重导出 |
| `missing-asset` | slice 声明了 exportable 但该 PNG **不在 assets/** | 404 / 用错 | 设计师**补导出** |
| `ghost-not-exported` | `type=shape` 叶子、fills/borders/shadows 全空、css 无可见绘制 → Sketch 图片填充未被 CSS 导出 | 元素丢失 | 设计师把该层**标记为可导出切片** |

**工具**：`node scripts/audit-slice-assets.mjs <index.html> <outAuditJson> [outReportMd]`
- 产出 `slice-asset-audit.json`：`{ skipIds:[...], byObjectId:{ id:{assetPath,render,reason} } }`
- 产出 `slice-asset-gap-report.md`：去重、按区域归类的**缺口清单**，直接交付给使用者向设计师索取切图。

**消费端（Vue/HTML）三条铁律：**
1. **用对**：`render-slice` 渲染前查 `SLICE_SKIP = new Set(audit.skipIds)`，命中即 `continue` 留空——绝不拿被覆盖的同名 PNG 喂错元素（碰撞胜出者照常渲染）。
2. **用全**：所有 `render:true` 的唯一切片必须渲染，一个不漏。
3. **不冗余**：渲染列表按 `kind|left|top|width|height|src/content` 去重，过滤设计稿「备份」副本的同位置同源叠加。

> 「凡可见必可还原」的前提是导出无碰撞、无遗漏。一旦导出已销毁干净像素（无 .sketch 可重导出时），**留空 + 缺口清单**比裁预览兜底更专业可信：把手里已有资源丝毫不差地用全用对，缺口让使用者一眼看见、补齐即填。

#### Step 0-C 完成判定

| 检查项 | 标准 |
|--------|------|
| 所有有效空洞已处理 | 每个空洞：已补导出切片 / 已写入 `_missing_assets.json` 留空报备 / 已记录忽略原因 |
| 处理记录 | TodoWrite 已记录每个空洞的处理结果 |
| **空洞分类结果** | `_coverage_gap_classification.json` 已生成；`overallStatus` 为 `ok` 或 `needs-review`（`critical` 必须处理） |

---

### Step 0-D：Pattern 识别 + Pattern Library

> **这一步防止「每个组件各搞一套」**。同一页面内必然有重复的视觉模式，先定义，后复用。

#### Pattern 识别流程

**从 manifest 找重复 pattern：**
```
读 manifest.json，按 fontSize 分组所有 text 图层
出现次数 >= 3 的 fontSize 值 → 该字号文字一定是某个 pattern 的实例
```

**从 `_all_elements.json` 找重复样式签名**（数据来自 Step 0-B 全量提取，不再目测）：
```bash
node -e "const d=require('./_all_elements.json'); const sig={}; d.filter(r=>r.type==='text').forEach(r=>{const k=JSON.stringify([r.fontFamily,r.fontSize,r.fontWeight,r.color]); sig[k]=(sig[k]||0)+1}); Object.entries(sig).filter(([_,n])=>n>=2).forEach(([k,n])=>console.log(n,k))"
```

每个 pattern 取一个稳定 class 名，用 TodoWrite 记录：(a) class 名 (b) 实例数量 (c) 在哪些组件出现。

**Step 0-D 完成判定**：TodoWrite 中至少有 3 个 pattern，每个有 class 名 + 实例数量。

#### Pattern Library 标准模式（6 个，含代码模板直接复用）

##### 模式 1：子标题（带点图标）

```html
<div class="sub-hdr">
  <img :src="dotSrc" class="sub-hdr-dot" draggable="false" />
  <span>{{ title }}</span>
</div>
```
```less
.sub-hdr {
  display: flex;
  align-items: center;   /* ← flex 垂直居中，不用 position/line-height */
  gap: 6px;
  font-family: '<DesignFont>', sans-serif !important;
  font-size: 20px !important;
  color: #d9e7ff;
  white-space: nowrap;
}
.sub-hdr span { font-family: '<DesignFont>', sans-serif !important; font-size: 20px !important; }
.sub-hdr-dot { width: 14px; height: auto; flex-shrink: 0; display: block; }
```

**图标 left 反推公式**（给原有文字标题前加图标时）：
```
新容器 left = 原文字 x - dotWidth - gap
           = 400     - 14        - 6     = 380
```
> 不要在 manifest 里找点图标切片坐标（不一定存在），直接从文字 x 反推。

##### 模式 2：渐变数值文字

```javascript
// gradientStyle 方法（所有渐变数值复用）
gradientStyle(endColor) {
  return {
    background: `linear-gradient(180deg, #ffffff 0%, ${endColor} 100%)`,
    '-webkit-background-clip': 'text',
    '-webkit-text-fill-color': 'transparent',
    'background-clip': 'text',
  }
},
// 数值与单位分离（防止单位也被渐变染色）
splitNum(text) { const m = String(text||'').match(/^([+\-\d\.]+)/); return m ? m[1] : text },
splitUnit(text) { const m = String(text||'').match(/^[+\-\d\.]+\s*(.*)$/); return m ? m[1].trim() : '' },
```

##### 模式 3：数据表格（行间距 + 列颜色）

```less
.tbl {
  width: 100%;
  border-collapse: separate;  /* ← 行间距的关键，collapse 模式下 border-spacing 不生效 */
  border-spacing: 0 5px;
}
.tbl thead tr { background: rgba(13, 69, 126, 0.60); }
.tbl tbody tr { background: rgba(13, 69, 126, 0.30); }
.tbl th, .tbl td {
  text-align: center;
  font-family: 'PingFang SC', sans-serif !important;
  font-size: 16px !important;
  color: #d9e7ff !important;
  white-space: nowrap;
}
/* ⚠️ 列颜色必须用父子链式选择器，直接写 .td-xxx !important 不够 */
.tbl td.td-col1 { color: #52c9fd !important; }
.tbl td.td-col2 { color: #73ff73 !important; }
```

##### 模式 4：轮播 + 渐变遮罩按钮

```javascript
const PAGE_SIZE = 4
// computed:
visibleItems() { return this.items.slice(this.offset, this.offset + PAGE_SIZE) },
canNext() { return this.offset + PAGE_SIZE < this.items.length },
// methods:
next() { if (this.canNext) this.offset += PAGE_SIZE },
prev() { if (this.offset > 0) this.offset -= PAGE_SIZE },
```
```less
.carousel-fade-right {
  position: absolute; right: 0; top: 0; bottom: 0; width: 100px;
  background: linear-gradient(to right, transparent, rgba(3,14,38,0.92));
  z-index: 5; display: flex; align-items: center; justify-content: flex-end;
  pointer-events: none;  /* ← 鼠标穿透，按钮单独开启 */
}
.carousel-btn { z-index: 6; background: none; border: none; cursor: pointer; pointer-events: auto; }
.btn-img-left { transform: scaleX(-1); }  /* ← 镜像翻转复用右箭头图片 */
```

##### 模式 5：图标+文字横排（flex 标准实现）

```html
<div :style="{ position:'absolute', left: left+'px', top: top+'px',
               display:'flex', alignItems:'center', gap: gap+'px' }">
  <img :style="{ width: iconW+'px', height: iconH+'px' }"
       :src="getAssetPath(iconFile)" draggable="false" />
  <div style="display:flex; flex-direction:column; gap:4px">
    <span class="label">{{ label }}</span>
    <div style="display:flex; align-items:baseline; gap:3px">
      <span class="value" :style="gradientStyle(endColor)">{{ splitNum(valueText) }}</span>
      <span class="unit">{{ splitUnit(valueText) }}</span>
    </div>
  </div>
</div>
```

> ⚠️ 不要用 `position:absolute + top/left` 对齐图标和文字，用 `display:flex; align-items:center`。

##### 模式 6：ECharts（含 HMR 修复）

```javascript
mounted() {
  this.chart = echarts.init(this.$refs.host, null, { renderer: 'canvas' })
  this.applyOption()
  window.addEventListener('resize', this.onResize, { passive: true })
},
beforeDestroy() {
  window.removeEventListener('resize', this.onResize)
  if (this.chart) { this.chart.dispose(); this.chart = null }
  // 另见 vue2-runtime.md「生命周期清理」章节
},
methods: {
  onResize() { if (this.chart) this.chart.resize() },
  applyOption() {
    if (!this.chart || !this.data) return
    this.chart.clear()  /* ⚠️ HMR 时必须先 clear，否则新配置不生效（静默失败） */
    this.chart.setOption({ ... }, true)
  },
},
```

---

### Step 0-E：Pilot Demo + 字体落地 + 写代码前 Gate Check

> **痛点**：「一次性全量做完所有组件」导致 `overflow:hidden`、`global.less *` 覆盖、HMR 失效等基础设施 issue 在每个组件上各踩一遍。

#### 0-E.1 Pilot Demo — 先跑通最小链路，再批量做组件

**§3.9 切片拼接路径 Pilot（推荐用于 skill 验证）：**
1. 单页 `Index.vue`：`_layer_stack.json` 全量 z 序渲染 + `CONTENT_SHIFT`（若嵌入）
2. 仅加 1 处动态替换（如 `fillValue` 驱动 dynamic-number，或 1 个 ECharts zone）
3. 确认：无叠影、宽度铺满（嵌入）或 letterbox 正确（全屏）、纵向滚动可用
4. 再扩展 chart zone / 表格 v-for

**锚点 + 组件路径 Pilot：**
1. 挑一个纯文字+数字 anchor 组件
2. 完整跑通：anchor → 组件实现 → mock 数据 → 截图比对 → 修通基础设施 issue
3. 再批量做剩余 N-1 个组件

**Pilot 完成判定**：视觉比对 5 项一致（字体/颜色/对齐/完整性/无叠影），无新发现的基础设施问题。

#### 0-E.2 字体落地（按 `_font_manifest.json` 的 needsBundling 清单逐一处理）

字体清单已由 Step 0-B 产出（`_font_manifest.json`）。**完整流程见 `references/font-bundling.md`**。

```
For each font in needsBundling:
  1. 仅在允许范围内查找（src/assets/font/、exportDir/fonts/、pageOutDir/fonts/、@font-face 声明路径）
     → 运行 scripts/audit-project-fonts.mjs
  2. 范围内不存在 → 互联网合法获取；仍无法获取 → 配置 `substituteStack` + **向用户提示** `acquireVia`
  3. bundled：`@font-face` 族名与 fontFamily 完全一致；pending：Implement 用 substituteStack
  4. 更新 _font_acquire.json（含 userPrompt、summaryForUser）
```

**禁止**：扩大搜索到 Windows Fonts；**禁止**不提示用户的静默替代。

**关键约束**：`@font-face` 的 `font-family` 值必须与 `_all_elements.json` 中的 `fontFamily` 字段**完全一致**（含大小写和连字符），否则 inline style 无法命中字体。

**字体后置验证门禁（阶段 1 完成后执行，务必保留）：**

```javascript
// 在浏览器 console 或 CDP 执行
const results = await Promise.all(
  needsBundling.map(f => document.fonts.check(`40px "${f}"`))
);
// 全部 true 才算通过
```

任何返回 `false` → 禁止标记实现完成，逐一排查（文件未复制 / font-family 名称拼写错 / CSS 未 import / 字体格式不支持）。

#### 0-E.3 写代码前 Gate Check（15 项，未完成禁止开始写组件）

- [ ] **A1**：已读全局样式文件，已知是否有 `*{font-family}` 覆盖规则
- [ ] **A2**：已读动态锚点容器组件，overflow 已确认，若为 `hidden` 已改为 `visible`
- [ ] **A3**：已读 Index.vue，防拖动/防选中已确认或补充
- [ ] **0-A0**：TodoWrite 已记录宿主 / 架构 / 缩放；嵌入模式 `contentShift` 已从 `_host_layout_hint.json` 确认（`confidence.overall≥0.5` 或人工 override）
- [ ] **A4**：架构分叉已执行（§3.9 禁 overlay；或锚点路径 ANCHOR_REPLACED 已就绪）
- [ ] **A5**：已确认页面 scale 适配逻辑
- [ ] **A6**：已清点 UI 组件库，TodoWrite 有记录
- [ ] **0-B**：`_all_elements.json` / `_coverage_map.json` / `_font_manifest.json` / `_render_plan.json` / **`_host_layout_hint.json`** 已生成，提取自检统计已确认，静态基线已与原稿/preview 比对
- [ ] **0-C**：所有真缺失空洞已处理（补导出 / `_missing_assets.json` 缺源已报备 / 记录忽略）
- [ ] **0-D**：TodoWrite 有 ≥3 个 Pattern + class 名 + 实例数量
- [ ] **0-E**：Pilot 组件已跑通，基础设施 issue 已全部修复；needsBundling 字体已写入 @font-face
- [ ] **渲染来源**：已确认每个元素来源为 slice 文件 / 矢量 css（shape 复刻）/ base64 落地图 / 活体文本组件之一；缺源处留空报备（`_missing_assets.json`），**不裁预览、不色块遮盖**
- [ ] **切图校验**：已校验 slice 声明数 vs 磁盘文件数（本例 46 声明/43 文件/3 缺失），缺失切图列入 `_missing_assets.json` 报备设计师补导（**不裁预览兜底**）
- [ ] **CONTENT_SHIFT**：已从 `_host_layout_hint.json` 读取或人工确认 `contentShift`（§3.9 用 `shiftRect`；锚点路径同步 anchors）
- [ ] **锚点推导**：所有 anchors 的 left/top/width/height 已从 `_all_elements.json` 真实坐标推导（**禁止估算**）
- [ ] **0-B 渲染缺口**：已读 `_render_gaps_report.json`；若有 `iconGapCandidates` 则已建 `_icon_gap_overlays.json`；若有 `duplicateTextGroups` 则 Index.vue 含 `dedupeTextLayers`；若有 `fakeBarShapes` 则含 chart zone + stack 排除
- [ ] **对称 KPI 审计**（多 panel 重复模块时必做，规则 62）：已跑 `detect-symmetric-module-gaps.mjs`；若 `dispositionMismatches` 或 `iconGaps` 非空 → 已建 `_symmetric_module_clones.json`（`excludeNativeIds` + 参考行 clone），**禁止**先调 CSS/object-fit

### 渲染前闸门（写 Index.vue 前，三份报告必须已消费）

> 详见 `references/render-gaps-consumption.md` — 每个字段的完整消费配方

- [ ] `_artboard_merge_plan.json`：multiArtboard 时已 `merge-artboards.mjs` 合并
- [ ] `_render_gaps_report.json`：degenerateBorderPaths 已跳过、blendHints 已加 mix-blend-mode、duplicateTextGroups 已 dedupe、iconGapCandidates 已映射
- [ ] `_chart_zones.json`：high 置信区已从 layer_stack 排除 excludeLayerIds 并接 ECharts；low 置信（needsConfirm）已裁决

### 交付前闸门（硬阻断）
- [ ] 跑 `consume-audit`：ok===true（每层已消费/排除/图表化、每 high zone 有 ECharts、blend 已加、无退化渲染）
- [ ] **渲染计划门禁**：`node <skill>/scripts/verify-board-render-plan.mjs <outDir>` exit 0；plan.total 与 stack 数量级一致（规则 74/76）
- [ ] **boardRender 无复制残留**：grep 项目 `*BoardRender*` / `Index.vue` 无 `getMonitorLayerPublicPath` 等 sibling 模块函数名；优先用 `templates/shared/boardRender.mjs` + `resolveAssetUrl`
- [ ] **三层渲染顺序**：slice/vector → ECharts（z≥5000）→ text（z≥9000）（规则 75）
- [ ] **对称 KPI 复检**：多 panel 页面再跑 `detect-symmetric-module-gaps.mjs`，或确认 `_symmetric_module_clones.json` 已落地且浏览器无「clone 落错区块」
- [ ] 浏览器 CDP 校验（铁律 #4），不靠截图肉眼

---

## 阶段 1：数据提取

> 数据消费铁律：阶段 1 起，每个元素的 left/top/width/height/color/fontSize/fontFamily/gradient
> 必须从 _all_elements.json 按元素 id（或 name）读取，禁止目测填值。
> 推荐把 _all_elements.json 收敛为页面内 manifest 数据模块，组件按 id 查询坐标/样式。
> 凡出现绝对坐标/颜色字面量，注释标注来源元素 id。

> ⚠️ **字段名差异提示**：JS 脚本（`extract-meaxure.mjs`）输出的每个 layer 坐标在 `rect.x / rect.y / rect.w / rect.h`；Python 脚本（`extract-meaxure-data.py`）输出为顶层 `left / top / width / height`。`emit-html.mjs` 使用 JS 格式（`rect.x/y`）；下方 Python 布局检测代码使用 Python 格式（`l['left']`）。混用时注意字段名。

### 方式 A：JS 脚本（跨平台，单个 artboard）

```bash
node scripts/extract-meaxure.mjs  path/to/index.html  layers.json
```

输出：`layers.json`（每个 layer 坐标在 `rect: {x, y, w, h}` 中）

### 方式 B：Python 脚本（多页面/多 artboard，分析更强）

```bash
python scripts/extract-meaxure-data.py  path/to/index.html  [artboardIndex]
```

artboardIndex 通过 links/ 目录确定：
```bash
# links 目录下每个 .html 的内容是：
# <meta http-equiv="refresh" content="0;url=../index.html#N">
# N 就是 artboardIndex
ls links/   # 每个文件名对应一个页面
```

Python 脚本同时输出：
- 所有 layer 的字段清单（type/name/rect/css/fills/exportable/shadows/opacity/rotation）
- **动态布局检测结果**（按大背景 slice 聚类）
- **元素类型识别结果**（见下文）

### 关键字段说明

| 字段 | 说明 |
|------|------|
| `type` | `text` / `slice` / `shape` / `group` / `symbol` |
| `rect` | `{x, y, width, height}`（1x CSS 像素，直接用于 CSS） |
| `content` | 文字内容（text 类型） |
| `css` | CSS 字符串数组（来自 MeaXure） |
| `fills` | 填充数组，含 `fillType`（Color/Gradient）和 `color`/`gradient` |
| `exportable` | 切图路径数组 |
| `shadows` | 阴影数组 |
| `opacity` | 透明度（0-1） |
| `rotation` | 旋转角度 |
| `fontFamily` | 字体族名（仅 text 类型） |
| `fontSize` | 字号（仅 text 类型） |

---

## 动态布局检测（关键步骤，不要硬编码）

**原则：** 根据切图数据自动识别面板布局，不要假设"一定是三列"。

```python
def detect_layout(all_layers):
    # 1. 找出所有超过 200×100 的大背景 slice（它们是面板容器）
    large_bgs = [l for l in all_layers
                 if l['type'] == 'slice' and l['width'] > 200 and l['height'] > 100]

    # 2. 按 top 分成顶部区和正文区
    headers   = [b for b in large_bgs if b['top'] < 150]
    body_bgs  = [b for b in large_bgs if b['top'] >= 150]

    # 3. 按 left 聚类正文区（阈值可根据实际设计调整）
    left_panels   = [b for b in body_bgs if b['left'] < 500]
    center_panels = [b for b in body_bgs if 500 <= b['left'] < 1400]
    right_panels  = [b for b in body_bgs if b['left'] >= 1400]

    print(f"检测到 {len(headers)} 个顶部区")
    print(f"左侧面板: {len(left_panels)}  中间面板: {len(center_panels)}  右侧面板: {len(right_panels)}")
    return headers, left_panels, center_panels, right_panels
```

**组件架构由检测结果决定：**
```
大屏页面 (index.vue)
├── ViewContent / ScreenStage（自适应容器）
├── HeaderComponent（如果有顶部区）
├── LeftPanel（如果有左侧面板）
├── CenterPanel（如果有中间面板）
└── RightPanel（如果有右侧面板）
```

---

### 高保真渲染策略（按层切片拼接，A 轨道主策略；废止整图打底）

#### 🔒 铁律（无例外）
- 每个渲染元素 `z-index` = sketch 文档绘制序；不手工排。
- 合并 `@2x preview` 仅作验证基准，不为任何元素提供像素。
- 缺源（装饰底/卡片底/缺图/缺字体）→ `_missing_assets.json` 报备设计师补导，**留空不打补丁、不裁预览**。

#### 像素来源决策（信息/非信息二分）
- 非信息类（像素不变）：
  - `slice` → `resolveAsset(exportable.path)` 取 assets 真实文件（@2x 别名映射），绝对定位。
  - 裸露 `shape`（未被切片覆盖）→ 完整复刻其 `css`（为空时用 `fills` 的 from/to→角度 + colorStops + radius + borders 构建），**不模拟、不图片化**。
  - `data:image;base64` → 解码落地 PNG；**有图层归属（出现在带 objectID 的图层子树）→ 按层渲染（`_layer_stack` 出 `base64-file` 源）；无归属（仅出现在全局 `<style>`/预览装饰）→ 标 `bound:false` 存档并归 backdrop 缺源报备，不强行放置**。
  - 不变文本/标签 → 活体文本 + 提取的 color/fontFace/fontSize/letterSpacing/lineHeight/shadows(含辉光)。
- 信息类（像素随数据变）：数字→活体文本+渐变 stops；图表→ECharts；表格→v-for。

#### 复刻 vs 模拟（核心边界）
HTML 本就用 css/矢量表达的（shape 渐变、文本）→ 复刻其确切 css（首选）；栅格/复杂/无规格视觉（全息图/辉光/纹理）→ 必须真实图片（slice/补导），绝不捏 css。

#### 缺源处理（①B/②B）
装饰底（全息图/页底渐变，无图层/css/asset）与无背景卡片底 → 列入 `_missing_assets.json`，对应区域留空 + 在交接说明里报备用户与设计师沟通补导。

#### 技能验证页（design-to-vue 能力验收，非业务交付）

> 前置：**必须完成 Step 0-A0**，宿主=嵌入 BasicLayout + 架构=§3.9 切片拼接（除非用户明确要求全屏纯像素对比）。

**禁止**引入目标项目已有业务 overlay（`CockpitDynamicOverlay`、`ANCHOR_REPLACED_FILES` 等），否则无法判断 skill 本身是否有缺陷。

**两种交付/验证布局（Step 0-A0 已选一项，勿中途切换）：**

| 模式 | 适用 | 画板 | 缩放 | 滚动 | 路由 |
|------|------|------|------|------|------|
| **嵌入 BasicLayout** | 与平台其他大屏一致 | `STAGE_W/H = board − CONTENT_SHIFT`；渲染时 **filter** `x<SHIFT_X \|\| y<SHIFT_Y` 的 chrome 层 | `scale = viewportW / STAGE_W`（**禁止** `min(vw/W,vh/H)`） | 内层 `ref="viewport"` 设 `overflow-y:auto` | `BasicLayout.children` 嵌套路径 |
| **全屏独立路由** | 无壳纯像素对比 | 全画板 w×h | `scale = min(vw/W, vh/H)` 居中 letterbox | 通常无滚动 | 顶层路由，与 BasicLayout 平级 |

**嵌入模式 DOM 骨架（经 sampleCockpitV2 验证）：**

```html
<div class="bigscreen-root bigscreen-theme factor-page-shell d2v-page">
  <div class="bigscreen-canvas d2v-canvas">
    <div ref="viewport" class="d2v-viewport"><!-- overflow-y:auto; flex:1; min-height:0 -->
      <div class="d2v-board-wrap">
        <div class="d2v-board-scaled" :style="scaledShellStyle">
          <div class="d2v-board" :style="boardStyle"><!-- transform:scale(s); transform-origin:top left -->
            <!-- missingPlaceholders + renderLayers(v-for layer_stack) + chartZones -->
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

```javascript
// 宽度铺满；ResizeObserver 监听 ref="viewport" 宽度，勿只用 window.innerWidth
scale() { const sx = this.viewport.w / STAGE_W; return sx > 0 ? sx : 1 }
scaledShellStyle() { return { width: `${Math.ceil(STAGE_W * this.scale)}px`, height: `${Math.ceil(STAGE_H * this.scale)}px` } }
boardStyle() { return { width: STAGE_W + 'px', height: STAGE_H + 'px', transform: `scale(${this.scale})`, transformOrigin: 'top left' } }
```

**宿主 CSS 注意**：部分项目（如 your-web `Default.vue`）给 `.bigscreen-canvas` 也设了 `overflow-y:auto`。滚动容器应只保留一层——优先让 **`ref="viewport"`** 承担纵向滚动，避免双滚动条。

**验证页必守（两种模式共通）：**
1. **唯一静态源** = `_layer_stack.json` z 序 `v-for`；禁止再叠一套项目业务组件渲染同一区域。
2. **信息类替换** = 仅按 skill：`dynamic-number`→活体文本；假图表→`element-recognition` 检测后 ECharts；检测到的信息区内从 layer_stack **排除**对应静态层。
3. **缺源** = `_missing_assets.json` 留空占位，禁裁预览、禁色块遮盖。
4. **data 字段**：Vue 2 中 `ResizeObserver` 实例勿用 `_` 前缀命名（eslint `vue/no-reserved-keys`）。

#### §3.9 渲染层三件套（V4 布局正确后仍可能踩坑 — sampleCockpitV2 实录）

> **定位**：Step 0-A0 解决「宿主/缩放/路由」；本段解决「layer_stack 直出后的三类视觉缺陷」。三者均为 **Implement 层逻辑**，extract 脚本**只检测不自动修复**（避免负优化：误删合法层 / 误映射图标）。`_render_gaps_report.json` 已按 `_host_layout_hint.contentShift` **过滤 chrome 区**，仍须人工核对后再写 `_icon_gap_overlays.json`。

| 坑 | 现象 | 根因 | 正解（检测 → 实现） |
|----|------|------|---------------------|
| **图标缺口** | 渐变方块无 pictogram | MeaXure **空 group** 或 **fills/css 为空的 bitmap shape** | `_render_gaps_report.json` → 人工 `_icon_gap_overlays.json`（elementId→slice）→ `iconGapLayers`；`isHiddenVector` 隐藏占位 shape |
| **文本叠影** | `1200tCO2e` 与 `1200`/`tCO2e` 重影 | `_classification` 同时输出 composite 与 fragment | `dedupeTextLayers`：同坐标格保留最长；同行+内容包含+横向重叠去掉 fragment |
| **假图表残留** | 静态柱/网格框与 ECharts 叠 | 假柱为**纯色** `#399EE6`（非 gradient）；chart zone 未锚定 | `isFakeBarShape` 含纯色柱；**优先**用 section 标题（如「功能A趋势」）锚定 zone；`overlapsChartZone` 排除 stack 层 |

**Step 0-B 后快速读报告：**
```bash
node -e "const r=require('./data/_render_gaps_report.json'); console.log(r.counts, r.duplicateTextGroups?.slice(0,3))"
```

**`_icon_gap_overlays.json` 模板（非业务 overlay，缺源报备式补图）：**
```json
{
  "comment": "MeaXure 未导出的 bitmap/空 group；按 elementId 在 group rect 贴已有 slice",
  "items": [
    { "elementId": "<uuid>", "name": "规划", "file": "guihua-icon.png", "reason": "empty-group" }
  ]
}
```

> **自动化前置（两阶段，禁止跳步）：**
>
> ```bash
> # 1) 读 _render_gaps_report.json + 设计稿 assetsDir（递归含 icon/）
> node <skill>/scripts/gen-icon-gap-candidates.mjs <outDir> [designAssetsDir]
> # 输出 _icon_gap_candidates.json：
> #   status=auto-resolved → score >= 0.55
> #   status=needs-review  → 人工从 candidates[0-2] 选一项
> #   小 ghost 已自动排除 BG备份 等全屏背景候选（规则 64）
>
> # 2) 读 candidates + **已部署** static/design-assets，产出 _icon_gap_overlays.json
> node <skill>/scripts/gen-icon-overlays.mjs <outDir> <deployedStatic/design-assets> [boardW] [boardH]
> # file 字段保留 icon/、pic/ 相对路径；邻近文本可匹配 icon/ 文件名
> ```
>
> `_icon_gap_candidates.json` 产出后，检查 `_icon_gap_overlays.json` 未覆盖的 `unresolved`；
> **禁止**把 score=0 的 `BG备份.png` 批量写入 overlays（规则 64）。
> **禁止** `assetUrl()` 只用 basename（规则 63）——见 `templates/shared/layerUrl.mjs`。
> **全屏背景**：`BG备份.png` 用 `boardStyle.backgroundImage`，不进 overlay items。

**Implement 最小代码锚点（复制到 §3.9 Index.vue，按项目改 import 路径）：**

```javascript
// 1) 文本 dedupe — renderLayers 收集 texts 后调用
function dedupeTextLayers(textLayers) {
  const sorted = [...textLayers].sort((a, b) => String(b.content || '').length - String(a.content || '').length)
  const kept = []
  sorted.forEach((t) => {
    const tc = String(t.content || '')
    const dup = kept.some((k) => {
      const kc = String(k.content || '')
      const sameCell = Math.round(k.rect.y / 2) === Math.round(t.rect.y / 2) &&
        Math.round(k.rect.x / 2) === Math.round(t.rect.x / 2)
      if (sameCell) return true
      if (Math.abs(k.rect.y - t.rect.y) > 2) return false
      if (kc.length <= tc.length || !kc.includes(tc)) return false
      const a = k.rect, b = t.rect
      return !(a.x + a.w < b.x || b.x + b.w < a.x)
    })
    if (!dup) kept.push(t)
  })
  return kept
}

// 2) 假柱 + chart zone（标题锚定优先，假柱聚类兜底）
function isFakeBarShape(el) {
  if (!el || el.type !== 'shape') return false
  const r = shiftRect(el.rect)
  if (!r || r.w > 24 || r.w < 6 || r.h < 8) return false
  const css = (el.css || []).join(' ')
  if (/linear-gradient/i.test(css) && /background/i.test(css)) return true
  return r.w <= 18 && r.h >= 30 && /background\s*:\s*#/i.test(css)
}

// 3) 文本颜色 — MeaXure 常出 `#7AF4FF 100%` 非法 CSS；渐变在 fills 不在 css.color
function normalizeTextColor(c) {
  if (!c || typeof c !== 'string') return ''
  return c.replace(/\s+\d+%\s*$/, '').trim()
}
function textGradientStyle(el) {
  const fill = (el.fills || []).find(f => f.type === 'gradient' && f.stops && f.stops.length >= 2)
  if (!fill) return null
  const parts = fill.stops.map(s => {
    const pos = s.position != null ? (s.position <= 1 ? s.position * 100 : s.position) : 0
    const c = s.color && (String(s.color).match(/rgba?\([^)]+\)/i)?.[0] || normalizeTextColor(String(s.color)))
    return `${c || '#fff'} ${pos}%`
  })
  return {
    background: `linear-gradient(${fill.angle != null ? fill.angle : 180}deg, ${parts.join(', ')})`,
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    WebkitTextFillColor: 'transparent', color: 'transparent',
  }
}
// textStyle: 优先 css font-family；有 gradient fills 时用 textGradientStyle，否则 solidTextColor
```

**Pilot 扩展（0-E.1 第 4 步）**：布局 Pilot 通过后，再对照 `_render_gaps_report.json` 逐项消缺，**不要**等全页做完才看叠影/缺图标。

---

## 阶段 2：静态基线 HTML 生成

> ⚠️ **渲染策略提醒**：交付页面默认按上文「高保真渲染策略」的 `_layer_stack.json` **z 序切片拼接**
> （slice 文件 / 矢量 css 复刻 / base64 / 活体文本组件，自底向上叠加）。
> 缺源（装饰底/卡片底/缺图/缺字体）→ 列入 `_missing_assets.json` 报备设计师补导，对应区域**留空，禁裁预览、禁打补丁遮盖**。
> 本阶段 `emit-html.mjs` 生成的静态基线 HTML 仍是**提取完整性的证据 / 验证基准**（不是交付物，也不为元素提供像素），照常生成与比对。

```bash
node scripts/emit-html.mjs  layers.json  assetsDir  outDir
```

产出：
- `outDir/index.html`（1:1 静态还原，绝对定位的所有元素）
- `outDir/images/`（slugify 后的切图文件，处理中文文件名）
- `outDir/emit-summary.json`（fileMap + referenceSlices 过滤清单）

**这是证据，不是交付物。** 用 Chrome DevTools 与原始 `index.html` 并排对比。

### 脚本修改后必须运行回归测试

每次修改 `emit-html.mjs` 或 `extract-meaxure.mjs` 后跑技能回归套件（node 原生，无需 pnpm/vitest）：

```bash
node scripts/test-all.mjs            # 聚合运行全部 test-*.mjs
node scripts/test-emit-html.mjs      # emit-html 专项（渲染层数/坐标快照）
```

并**手工对比一次** emit 输出与原始 `index.html`，确认渲染层数和坐标未回归。

### 渲染规则

| 图层类型 | 渲染方式 | 注意 |
|---------|---------|------|
| `slice` | `<img>` 绝对定位 | 路径经 slugify（中文→ASCII slug） |
| `text` | `<span>` 绝对定位 + MeaXure CSS | `white-space:pre-wrap`（见下文） |
| `shape` | `<div>` + 渐变/纯色背景 | 跳过"位图/蒙版/矢量智能对象" |
| `group` | 跳过（children 已摊平） | — |

> ⚠️ **此渲染规则表仅服务于「静态基线证据」**，不是高保真交付的默认路径。
> 交付页面默认按 `_layer_stack.json` **z 序切片拼接**（见 阶段 2 开头「高保真渲染策略」）。
> 关于 `shape`：HTML 本就以 css/渐变表达的矢量层**必须完整复刻其 `css`/`fills`**（这是复刻，不是模拟）；
> 栅格/复杂/无规格视觉（全息图/辉光/纹理）必须用真实图片（slice 或设计师补导），缺源则留空报备（`_missing_assets.json`），**绝不裁预览、不打补丁遮盖**。

**Reference Slice 过滤**（名称/路径含以下关键词的切图跳过，仅记录到 referenceSlices）：
`preview-base` / `preview` / `screenshot` / `screen-shot` / `reference` / `mockup` / `预览` / `参考图` / `截图`

**文字 artifact 过滤**（以下文字层跳过，不生成 `<span>`）：
CSS 数组中含 `border: 1px solid #979797` 的 text 层是 Sketch 导出时的边框 artifact，不是真实内容，跳过。

**shape 渲染注意**：
- 有 `Color` 或 `Gradient` 填充 → 渲染 `<div>` + background
- **仅有边框 gradient（fills 为空，只有 borders）→ 不渲染，直接 skip**。border-only gradient 变成填充矩形会遮挡内容。
- 跳过 `位图 / 蒙版 / 矢量智能对象` 名称的 shape（嵌入式图表 bitmap，由真实 ECharts 替换）

**文字 pre-wrap 规则：**
- 多行段落：`white-space: pre-wrap`（保留 `\n` + 长段落自动换行）
- 单行标签盒（`boxHeight ≈ lineHeight`）：`white-space: pre`（防止强制换行）
- 模板内 `>{{ text }}</…>` 紧贴，不留缩进（否则渲染前导空白）

---

## 阶段 3：静态基线 → 可维护 Vue（6 步重构）

> **自动化前置（必做）：运行骨架生成脚本**
>
> ```bash
> # 产出 _group_analysis.json（含 componentName / pattern / priority / skeletonCode）
> node <skill>/scripts/gen-component-skeleton.mjs <outDir>
> ```
>
> 读取 `_group_analysis.json`，确认 `priority=high` 的组件清单；按 `references/translate-recipe.md`
> 中对应 pattern 的「填充清单」逐项完成后，再进行 Step 1~6 结构整理。
> **禁止跳过骨架生成直接手写组件**（避免坐标/Props 不一致）。

基线生成完毕后，按以下 6 步手动改写。**每步先判定再改，不要无差别套模板。**

### Step 1：按 group 重新分块

- 打开 `layers.json`，找 `type=group` 的节点及其 children
- 在 static HTML 里按 children 集合归类到 `<section data-panel="...">`
- panel 命名优先用 group 的中文 name 转 kebab-case
- 相邻同语义 group（"KPI-1"/"KPI-2"/"KPI-3"）合并为 `kpi-row`，不要每个单开

### Step 2：抽公共文字样式

出现 ≥3 次的 `font-family + font-size + font-weight + color` 组合 → 提取为 utility class：

```css
/* 命名约定：text-{语义}-{尺寸} */
.text-num-kpi   { font-family: DIN; font-size: 32px; color: #00E5FF; font-weight: 700; }
.text-label-14  { font-family: PingFang SC; font-size: 14px; color: #8AA0C0; }
.text-title-16  { font-family: SourceHanSansCN; font-size: 16px; color: #fff; font-weight: 500; }
```

inline style 只保留定位字段（`left/top/width/height/z-index`）。

### Step 3：颜色/阴影提 CSS 变量

出现 ≥5 次的 hex/rgba → 提成 `:root` 变量：

```css
:root {
  --c-primary:   #00E5FF;
  --c-warn:      #FFB000;
  --c-panel-bg:  rgba(8, 22, 56, 0.78);
  --c-grid:      rgba(255, 255, 255, 0.08);
}
```

若项目 `src/themes/` 已有大屏主题，优先接入而非新建。

### Step 4：坐标策略

- **panel 容器**：保留绝对定位（`left/top/width/height`），z-index 改用语义分层（背景层/内容层/浮层）
- **panel 内部**：能用 flex/grid 表达的行列结构（KPI 行、列表、表格、图例）改 flex/grid
- 仅装饰 slice、图表容器、悬浮 badge 保留绝对定位

### Step 5：资源迁移

- 把被 panel 实际引用的 slice 拷到 prototype 的 `images/` 目录
- 未引用的不带过去
- 删掉所有 preview/screenshot 类装饰图（`emit-summary.json` 的 `referenceSlices` 已枚举）
- 保留 `emit-summary.json.fileMap` 命名映射记录，方便回查源 slice

**同步更新 spec.md**：在同一次改动中更新 prototype 的 `spec.md`，记录：
- 保留的 slice（文件名 → 组件中的使用位置）
- 被替换为实时组件的 slice（slice 名 → 替换的组件名 + 坐标区域）

此记录供后续维护者查阅；省略则视为漏迁。

### Step 6：Fake chart 替换

按 `references/element-recognition.md` 识别并替换静态假图表。

**建议在 Step 1-5 完成、panel 结构稳定后再做**，避免边改结构边换数据源。

---

## 精确颜色提取（图例/渐变/强调色）

> **优先查 `_all_elements.json`**：常规颜色/渐变（gradientStops/gradientAngle）已由 Step 0-B 全量提取落地，应直接从 `_all_elements.json` 按元素 id/name 读取。本节脚本仅作为「JSON 中某点缺失、需按坐标重新定位 layer 兜底」时使用（旧 `_styles_all.json` 机制已被取代）。

MeaXure `index.html` 是 300KB+ 的单行巨文件，不要用 grep 颜色字符串（歧义多）。  
按坐标定位 layer 再读 color：

```js
// node -e
const fs = require('fs');
const m = fs.readFileSync('index.html', 'utf-8')
  .match(/let data\s*=\s*(\{[\s\S]*?\});/);
const data = JSON.parse(m[1]);

function walk(layer, out) {
  const r = layer.rect || {};
  // 示例：定位 x=308，y 在特定行的点
  if (r.x === 308 && [516, 545, 575, 600.5, 630].includes(r.y)) {
    out.push({
      name: layer.name,
      y: r.y,
      hex: (layer.fills || []).map(f => f.color && f.color['color-hex']),
    });
  }
  (layer.layers || []).forEach(c => walk(c, out));
}

const out = [];
data.artboards.forEach(ab => (ab.layers || []).forEach(l => walk(l, out)));
console.log(JSON.stringify(out, null, 2));
```

适用场景：图例颜色必须与设计完全匹配时；渐变停止点"看起来差不多但不对"时。

---

## 交接前对照检查

```python
# 对照 emit-summary.json 的计数（images/texts/shapes）
# 每个 slice/text/shape 要么落到 prototype，要么记录在以下两类之一：
# - 「已被组件替换」（如静态图表 → 真实 ECharts）
# - 「已合并到背景」（如多个小装饰元素合并）
checks = [
    (layer_idx, "元素描述", "代码文件:行号", "状态"),
    # ...
]
for idx, desc, location, status in checks:
    print(f"layer-{idx:<4} {desc} → {location} [{status}]")
```

---

## 阶段 4：验收与收尾

---

### Step 4-A：视觉验证循环（AI 主动驱动，无需等用户发截图）

> **每个组件实现完成后立即执行，不要等所有组件都完成再一起验证。**

**验证循环：**
```
LOOP:
  1. 用 Playwright 截取实现页面的目标区域截图
  2. 获取设计稿对应区域截图（本地 HTTP 服务访问 MeaXure index.html）
  3. 并排比对，逐项检查：
     ✓ 字体族/字号 — 与设计稿字体名和尺寸是否一致
     ✓ 颜色 — 渐变色用了 fills.colorStops 而非 css[].color（占位色）
     ✓ 间距/对齐 — 图标与文字是否垂直居中；行间距是否存在
     ✓ 完整性 — 有无内容被裁剪（底部、右侧）
     ✓ 无叠影 — 切片图片与组件内容是否重叠（提示需加 ANCHOR_REPLACED_FILES）
     ✓ 切片拼接/复刻 — 按 `_layer_stack.json` z 序叠加；shape 矢量层（HTML 本就的 css/渐变）须完整复刻其 `css`/`fills`，栅格/复杂视觉（全息图/辉光/纹理）须用真实 slice 或设计师补导；**无色块遮盖、缺源处留空占位（非乱填）、不裁预览**
  4. 针对每一项差异，查根因表，修复
  **根因未命中 → 执行 `references/visual-diff-root-cause.md` 末节「未命中升级协议」**
  5. 重新截图，验证修复结果
UNTIL 无差异
```

**已知常见差异根因及修复：**

> **完整根因表已迁移至 `references/visual-diff-root-cause.md`**（五大分类，~45 条）。
> 本处保留**高频 24 条速查摘要**；完整索引 + **未命中升级协议** 见专项文档。
> **未命中时强制执行升级协议**（最多 2 轮自行尝试，第 3 轮须停止并报告，禁止随机修改）。


| 现象 | 根因 | 修复 |
|------|------|------|
| 字体/字号与设计不符 | `global.less *{}` 覆盖 | 加 `!important` 到 font-family/font-size |
| 某列颜色不生效 | `.tbl td !important` 压制子类规则 | 改为 `.tbl td.td-xxx { color: ... !important }` |
| 内容下方/右侧被裁剪 | anchor `overflow: hidden` | 改 `*Anchor.vue` 为 `overflow: visible`；或增大锚点 height |
| 修改 JSON 后页面无变化 | 静态 JSON import 不触发 HMR | 在引用该 JSON 的 .vue 文件 import 行加注释（如时间戳） |
| ECharts 修改配置无效 | HMR 没有 clear | `applyOption` 开头加 `this.chart.clear()` |
| 切片图片与组件叠加 | 未加入 ANCHOR_REPLACED_FILES | 把该切片文件名加入 Set |
| 按钮无法点击 | 父容器 `pointer-events: none` | 按钮元素加 `pointer-events: auto` |
| 图标与文字不垂直居中 | 用了 position/line-height 对齐 | 改为父容器 `display:flex; align-items:center` |
| 渐变色是白色或不对 | 用了 `css[].color`（占位色）而非 `fills.gradient.colorStops` | 查 `_all_elements.json` 的 `gradientStops`/`gradientAngle` 字段 |
| 渐变/阴影/圆角与设计有色差或边缘差 | 把该 slice 的栅格/复杂视觉错用 css 硬捏（模拟），或 shape 矢量层漏提 css/fills | 栅格/复杂视觉改真实 slice 或设计师补导；HTML 本就的 css 矢量 shape 则完整复刻其 `css`/`fills`（含渐变 stops+角度）；**绝不裁合并预览** |
| 某图标 404/空白 | slice 声明但磁盘缺文件（本例缺 3 个），或 `exportable.path` 未经别名映射 | 先经 `resolveAsset()` 做 @2x/@3x 别名映射；仍缺则列入 `_missing_assets.json` 报备设计师补导（**不裁预览补齐**） |
| 所有组件 left 值系统性偏右 | CONTENT_SHIFT_X 未减去 | `shiftRect` 过滤 chrome 并平移坐标 |
| 嵌入后宽度窄、两侧黑边 | 用了 `min(vw/W,vh/H)` letterbox | 改为 `scale=viewportW/STAGE_W` + 纵向滚动 |
| 有平台壳但页面无侧栏 | 顶层全屏路由 | 改 `BasicLayout.children` 嵌套路由 |
| layer_stack 与组件叠影 | §3.9 与 overlay 混用 | 验证页纯 stack，动态区仅从 stack 排除层 |
| 图标区只有渐变无 pictogram | 空 group / ghost bitmap shape | 读 `_render_gaps_report.json` → `_icon_gap_overlays.json` |
| 数值/单位文字重影 | composite + fragment 同进 stack | `dedupeTextLayers`（见 §3.9 渲染层三件套） |
| 假图表与 ECharts 叠 | 纯色假柱未识别；chart zone 未排除 stack | 标题锚定 zone + `overlapsChartZone` + `isFakeBarShape` 含纯色 |
| 图片 404 不显示 | 文件名编码/路径错误 | 浏览器 Network 面板查实际请求 URL |
| 某 slice 显示成别的图（用错） | 多个图层重名→同名 PNG 覆盖 | `audit-slice-assets.mjs` → 失败方进 `skipIds` 留空 + 缺口清单 |
| 同一元素重影叠加 | 设计稿「备份」副本同位置同源 | 渲染列表按 `kind|位置|源` 去重 |
| 列表行数比设计稿少 | mock 数据不足 | 补全 mock 数据到与设计稿一致的条目数 |
| 坐标/颜色与设计偏差但 JSON 里有正确值 | 实现期目测未读 JSON | 从 _all_elements.json 按 id 读取，做坐标消费抽查 |
| 整页局部都对但整体走样 | 缺整页量化判据 | 执行 Step 4-E 整页 SSIM 门禁 |

**Playwright 截图脚本模板：**

```javascript
// _screenshot_compare.mjs
import { chromium } from 'playwright'

// ⚠️ 坐标映射说明：
// 大屏整体用 CSS scale 缩放到视口。设计稿坐标是 DESIGN_W × DESIGN_H（从 manifest artboard 读取），
// 实际渲染时整体缩小（如 1920px 视口下 scale = 1920 / DESIGN_W）。
// 截图 clip 坐标需要视口像素，不是设计稿像素。
// 公式：viewportX = (designX - CONTENT_SHIFT_X) * scale

const DESIGN_W = 2912   // ← 替换为你项目实际值（manifest artboard）
const VIEWPORT_W = 1920
const SCALE = VIEWPORT_W / DESIGN_W

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: VIEWPORT_W, height: 1080 })
await page.goto('http://localhost:<your-dev-port>/<your-route>')
await page.waitForTimeout(2000)

// 先截全屏确认坐标
await page.screenshot({ path: '_impl_full.png' })

// 截取目标区域（视口像素）
await page.screenshot({
  path: '_impl_region.png',
  clip: {
    x: Math.round(0 * SCALE),
    y: Math.round(620 * SCALE),
    width: Math.round(800 * SCALE),
    height: Math.round(280 * SCALE)
  }
})

// 截取设计稿（本地 HTTP 服务，见附录 B）
const design = await browser.newPage()
await design.goto('http://localhost:18080/index.html')
await design.screenshot({ path: '_design_region.png', clip: { x: 0, y: 620, width: 800, height: 280 } })

await browser.close()
```

---

### Step 4-A2：坐标消费抽查（硬性门禁，确保提取值真被消费）

> **这是「提取 ≠ 消费」闭环的验证关口**——确保实现期没有边查 JSON 边目测。Step 4-A 的肉眼比对无法量化坐标偏差，必须用本抽查兜底。

```
1. 从 _all_elements.json 随机抽 10 个已实现元素
2. 对每个：读 JSON 中的 left/top/width/height/color/fontSize/fontFamily
3. 用 CDP 量页面中对应元素的 computed 值（注意按页面 scale 换算回设计稿坐标系）
4. 偏差判定：
   - 位置/尺寸偏差 > 2px（换算回设计稿坐标系后）→ 判定"又在猜"，打回重做
   - 颜色不一致（非渐变近似）→ 打回
   - fontFamily/fontSize 不一致 → 打回
5. 10 个全部通过才算消费验证通过
```

> 偏差 2px 阈值针对设计稿坐标系（非视口）；rotation≠0 的元素按 transform 后中心点比对。

---

### Step 4-B：Stuck Handling — AI 卡住时的升级路径

> **强制规则**：同一问题不应无限重试。以下场景必须停下来向用户求助。

**触发条件：**

| 场景 | 触发阈值 | 处理 |
|------|---------|------|
| 截图比对发现差异，但「已知根因表」都不匹配 | 1 次找不到根因 | 报告：截图 + 怀疑的根因列表 + 询问用户 |
| 修改后截图比对仍有差异 | 同一组件累计 3 次失败修复 | 报告：每次修改 + 截图，请用户判断方向 |
| 设计稿/manifest/preview 三者不一致 | 1 次发现 | 报告冲突点，由用户决定以哪个为准 |
| 某资源文件在设计稿引用但磁盘不存在 | 1 次发现 | 列出缺失文件清单，请用户补充 |
| `_all_elements.json` 提取失败/为空 | 1 次发现 | 报告 `extract-all-elements.mjs` 自检统计输出 + index.html 结构片段 |
| 用户给出的设计与 manifest 不一致 | 1 次发现 | 不要私自取舍，列出差异请用户决定 |

**标准报告格式（每个字段必填）：**
```
【卡点】<一句话，主谓宾，如「ServiceBoardTable 中第3列颜色不生效」>
【已尝试】
  尝试 1: <做了什么> → <结果>
  尝试 2: <做了什么> → <结果>
【证据】
  - 实现截图：<路径>
  - 设计稿截图：<路径>
  - 相关代码：<文件:行号>
【可能根因】（至少 2 个，每个含证据评分 0-10）
  1. <根因> (评分: N/10, 因为<证据>)
  2. <根因> (评分: N/10, 因为<证据>)
【需要用户判断】<具体问题，避免开放式>
```

**禁止行为**：同一修改方向重试 3 次以上无效还在试；没有截图就猜修复方案。

---

### Step 4-C：Code Review & Cleanup（开发完成后必做）

#### CSS 层面

- [ ] 没有同一选择器拆成两个规则块（合并为一个）
- [ ] 没有冗余声明（如 `flex: 0 0 400px` + `width: 400px`；`padding: 6px 0 6px 0` → `6px 0`）
- [ ] 没有被自身后续规则立刻覆盖的属性
- [ ] 缩进风格一致（setOption 对象不同层级混缩进）
- [ ] `!important` 使用合理：只在需要覆盖全局 `*` 的场景用

#### JS/Template 层面

- [ ] 模板里没有重复 3 次以上的相同表达式 → 抽成 computed 或 method
- [ ] 公共逻辑（`splitNum/splitUnit/gradientStyle`）已收敛到 Pattern Library，不散落各组件
- [ ] 未使用的 import/data/methods 已删除
- [ ] HMR 临时注释已清理或标准化

#### 一致性层面

- [ ] 同一 pattern 的所有实例使用了同一份 class/组件
- [ ] 图标/字体路径常量化，没有硬编码分散多处
- [ ] Cleanup 后再次截图比对：确认样式没改坏

---

### Step 4-D：验收清单

#### 组件完成 Check（每个组件完成后必做）

- [ ] **Step 4-A 视觉比对**已截图，以下各项均一致：
  - [ ] 字体族/字号
  - [ ] 颜色（特别是渐变色的终止色）
  - [ ] 图标与文字垂直居中（flex align-items）
  - [ ] 无内容裁剪（底部/右侧完整显示）
  - [ ] 无叠影（切片 + 组件未重叠）
- [ ] 该组件用到的切片图片已检查 ANCHOR_REPLACED_FILES
- [ ] CSS 规则：无重复选择器规则块；font-family/font-size 已加 `!important`；列级颜色使用链式选择器
- [ ] 同 pattern 一致性：视觉 pattern 与已实现的其他组件使用同一份 class/模板

#### 项目完成 Check（最终交付前必做）

- [ ] **Step 4-A2 坐标消费抽查** 已通过（随机 10 个元素偏差 ≤2px）
- [ ] **渲染来源合规** 已确认（slice 文件 / 矢量 css 复刻 / base64 / 活体文本组件，按 `_layer_stack.json` z 序叠加）；**无色块遮盖、缺源处留空占位（非乱填）、动态值全部可变、未裁合并预览**
- [ ] **slice 声明数 vs 磁盘文件数已校验**（本例 46 声明/43 文件/3 缺失），缺失切图列入 `_missing_assets.json` 报备设计师补导
- [ ] **Step 4-C Code Review** 已完成（无重复规则块/冗余声明/重复表达式/缩进混乱）
- [ ] **ReadLints** 全项目无新增报错
- [ ] 跨组件视觉一致性已验证（同 pattern 所有实例样式一致）
- [ ] 完整截图回归已完成，整页与设计稿对比无差异
- [ ] **Step 4-E 整页量化视觉回归门禁** 已通过（SSIM ≥ 0.90 或像素差异率 ≤10%）
- [ ] **对称 KPI 门禁**（规则 62）：`detect-symmetric-module-gaps.mjs` 零 issue，或 `_symmetric_module_clones.json` 已配置且存量/增量 KPI 视觉与 Sketch 一致

---

### Step 4-E：整页量化视觉回归门禁（最终验收）

> 现有 Step 4-A 是组件级肉眼比对，缺少**整页量化**判据，AI 容易"自我感觉差不多了"。本门禁兜底防止「局部都对、整体走样」和「AI 主观放水」。

```
1. 整页截图（实现页，按设计稿尺寸渲染或换算）
2. 基准图：优先用 emit-html.mjs 静态基线整页截图；无基线则用 preview 整页图
3. 计算结构相似度（SSIM）或像素差异率
4. 判定阈值：
   - SSIM >= 0.90（或像素差异率 <= 10%）→ 通过
   - 低于阈值 → 列出差异最大的区域，继续修，禁止标记完成
```

**SSIM 计算建议：**
- 引入轻量实现：`pixelmatch` + 灰度化得到像素差异率；或直接用轻量 SSIM 实现计算结构相似度
- 两图先统一缩放到同一尺寸再比对（实现页截图与基线/ preview 分辨率通常不同）

> 量化门禁不替代组件级肉眼比对，而是兜底。preview 与实现存在**动态数据差异**时，比对应聚焦布局结构（SSIM 对结构敏感、对内容文字数值不敏感），必要时用 **mock 数据对齐 preview 的示例值**后再比。

---

## 附录：实用脚本

### A. 中文/特殊字符文件名安全复制

```javascript
// _copy_icon_safe.mjs
import { readdirSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
const src  = '<设计稿切片目录>';
const dest = '<项目静态资源目录>';
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
const entries = readdirSync(src, { encoding: 'buffer' });
for (const buf of entries) {
  const name = buf.toString('utf8');
  try { copyFileSync(path.join(src, name), path.join(dest, name)); }
  catch (e) { console.error('skip', name, e.message); }
}
```

### B. 本地设计稿 HTTP 服务（供 Playwright 访问）

```javascript
// _serve_design.cjs
const http = require('http');
const fs   = require('fs');
const path = require('path');
const ROOT = '<设计稿根目录>';
http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.slice(1)));
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200);
  fs.createReadStream(file).pipe(res);
}).listen(18080, () => console.log('Design server: http://localhost:18080'));
```

### C. 查询指定文字的完整样式（含渐变）

> 查询数据源为 Step 0-B 全量提取产物 `_all_elements.json`（旧 `_styles_all.json` 机制已被取代）。

```javascript
// node query_style.cjs "目标文字内容"
const data = require('./_all_elements.json');
const keyword = process.argv[2] ?? '';
data.filter(r => r.type === 'text' && (r.content || '').includes(keyword)).forEach(r => {
  console.log('--- 文字:', r.content);
  console.log('字体:', r.fontFamily, r.fontSize);
  console.log('颜色:', r.color);
  console.log('渐变停止色:', r.gradientStops, '渐变角度:', r.gradientAngle);
  if (r.textShadow) console.log('text-shadow:', r.textShadow);
});
```

### D. HMR 触发（JSON 文件修改后页面不更新时）

在引用该 JSON 的 .vue 文件的 import 行加时间戳注释：
```javascript
import anchors from '../<your-module>Anchors.json' // updated 2026-06-15
```

---

## 附录：验证页弯路对照（sampleCockpitV2 实录）

| 阶段 | 做法 | 现象 | 根因 | 正解 |
|------|------|------|------|------|
| V1 | 全画板 + 项目 `CockpitDynamicOverlay` + CONTENT_SHIFT | 大量叠影 | §3.9 stack 与业务 overlay **混用** | 验证页 **纯 layer_stack** |
| V2 | 嵌入 + 复用旧版 anchor/replaced | 用户否：非 skill 验证 | 对照项目历史封装 | 禁止引用旧版 overlay 体系 |
| V3 | 全屏顶层路由 + 全画板 letterbox | 无侧栏/顶栏；宽度被压扁 | 未做 **0-A0**；`min(vw/W,vh/H)` | 嵌入 BasicLayout + **仅宽度 scale** |
| V4 | 嵌入 + layer_stack + 宽度 scale + 纵向滚动 | 符合预期 | Step 0-A0 三项决策正确 | 写入 skill 作为 canonical |
| V5 | V4 正确但仍有三处红框 | 零碳图标空、服务成效叠字、趋势区假柱 | **未读 `_render_gaps_report`；缺 §3.9 渲染三件套** | iconGap + dedupeText + chartZone 排除 |
| V6 | V5 修复后整体可用 | 与设计稿高度一致 | Implement 层补齐 | 作为 §3.9 canonical 验收基准 |

**两句话**：
1. skill 验证 = **先定宿主与架构，再写 Index.vue**；嵌入模式 **宽度优先 + 纵向滚动**，全屏模式才 letterbox。
2. 布局对了 ≠ 渲染对了；**Step 0-B 后必读 `_render_gaps_report.json`**，按「渲染层三件套」消缺，再进 Step 4-A 视觉循环。
