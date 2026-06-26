# B 轨道：MasterGo 导出包（FILE_DATA.json）→ Vue 完整流程

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：meaxure-vue-restore（A 轨道，完整保留）

---

## 触发特征

目录包含：
- `FILE_DATA.json`（主设计数据）
- `index.html`（内嵌 CSS + 图片引用）
- `data/exports/`（切图资源目录）

---

## 六步流程

### 第 1 步：提取精确样式数据

```bash
node scripts/extract-mastergo-css.mjs --dir "<导出目录>" --frame "<帧名>"
```

产出：`_design-nodes-<帧>.json`

**这是所有尺寸/颜色/样式的唯一事实来源**，后续所有步骤都从这里读，不要从 index.html 或肉眼估算。

提取内容包括：
- 每个节点的坐标/宽高（相对帧原点的 1x CSS 像素）
- 背景色/渐变/阴影/模糊/圆角
- 文字样式（font-size/font-weight/color/letter-spacing/line-height）
- auto-layout 方向/间距/padding
- IMAGE 占位节点的填充图（需与 fills 对应确认）

### 第 2 步：确认贴图映射

从 `index.html` 和 `fills` 字段**逐节点确认**每个 IMAGE 占位用哪张图：

```bash
# 列出所有导出图片（用 Node.js，不用 dir/ls）
node -e "const fs=require('fs'); console.log(fs.readdirSync('data/exports').join('\n'))"
```

- 文件名含中文/空格：**必须通过 `getAssetPath()` URL 编码**，不硬编码
- `@2x.png` 文件的 CSS 尺寸 = JSON 里的 `w/h`（**不除以 2**）
- 如果文件名和视觉内容对不上：先列出所有文件，逐个核实

将确认后的图片复制到项目 static 目录：
```bash
# Windows 复制（含中文文件名用 PowerShell）
Copy-Item "data/exports/*" "public/static/<页面名>-assets/" -Recurse
```

### 第 3 步：建组件骨架

复制 `templates/mastergo-component.vue`，修改以下内容：
1. 组件名（`MgRestoredFrame` → 实际组件名）
2. `.mg-frame` 的 `width/height` = 提取 JSON 帧根节点的 `w/h`
3. 删除示例节点，只保留真实节点占位

### 第 4 步：逐节点实现

按以下决策表实现每个节点：

| 节点类型 | 实现方式 |
|---------|---------|
| 纯色背景矩形 | `<div>` + `background: #hex` |
| 渐变背景矩形 | `<div>` + `background: linear-gradient(...)` |
| 阴影矩形 | `<div>` + `box-shadow: ...` |
| 图标/头像/插画/背景图 | `<img src="/static/<页面>-assets/<文件名>">` |
| 文字 | `<div>` position:absolute，用提取的 font-size/color/etc 叠加 |
| 复杂装饰（难以纯 CSS 还原）| `<img>` 资源化处理 |

**所有 left/top/width/height 直接抄提取 JSON 的值**（已是相对帧原点的 1x CSS px）。

`getAssetPath()` 工具函数（每个项目适配一次）：
```javascript
// assetUrl.js
import aliases from './assetAliases.json'  // { "foo.png": "foo@2x.png" }
const BASE = '/static/<页面名>-assets'
export function getAssetPath(filename) {
  return `${BASE}/${encodeURIComponent(aliases[filename] || filename)}`
}
```

**同步更新 spec.md**：在同一次改动中更新项目的 `spec.md`，记录：
- 保留的 IMAGE 节点（文件名 → 组件中的使用位置）
- 被替换为实时组件的节点（节点名 → 替换的组件名 + 坐标区域）

此记录供后续维护者查阅；省略则视为漏迁。

### 第 5 步：浏览器 CDP 校验

参见 `references/browser-verification.md`。

关键检查点：
- 帧容器的实际宽高 == 提取 JSON 的帧 w/h
- 关键元素的 left/top 与设计值偏差 ≤1px
- 图片实际显示尺寸 == 设计 w/h（不受 @2x 干扰）

### 第 6 步：（如需）自适应缩放

整页骨架用纯 `vh/vw`（勿用带 px 上限的 `clamp`，大视口会被截小）：

```css
/* 整页自适应 */
.page-root {
  width: 100vw;
  height: 100vh;
}

/* px 密集的卡片用 transform:scale */
.card-container {
  transform: scale(var(--scale-ratio));
  transform-origin: 0 0;
}
```

```javascript
// 缩放比例计算
const scaleRatio = innerWidth / 1920;
document.documentElement.style.setProperty('--scale-ratio', scaleRatio);
window.addEventListener('resize', () => {
  document.documentElement.style.setProperty('--scale-ratio', innerWidth / 1920);
});
```

---

## 避坑检查清单

- [ ] 锚点外图标由切片层渲染，组件**勿重复**（否则双重叠影）
- [ ] 所有图片路径通过 `getAssetPath()`，不硬编码
- [ ] @2x 文件 CSS 尺寸 = manifest w/h（**不除以 2**）
- [ ] 网格方向（列数×行数）来自 JSON x/y 分布，非想象
- [ ] 切片背景上叠字：不写 background-image，直接 position:absolute 叠文字
- [ ] 可交互区域加 `pointer-events: auto`
- [ ] Windows 系统必须用 Node.js 列出文件名（`dir` 乱码）
- [ ] 图标文件名可能被误命名，先列出再核实（见 `hard-won-rules.md`）
- [ ] plan/bill 变体图标遵循 `原名 + "备份"` suffix 模式
- [ ] 锚点宽度不足时，检查最右端元素的 `x+w`，更新 anchors.json 扩展 width
- [ ] 设计稿含完整页面壳（左导航+顶栏）：过滤 `x < CONTENT_SHIFT_X` 的切片，x 坐标整体左移，同步更新 anchors.json 的 left 值

---

## B 轨道全量闭环（2026-06-15 Phase 2）

```bash
# 1. 全量 extract
node scripts/extract-mastergo-all.mjs --dir "<导出目录>" --frame "<帧名>" --out "<pilot>/data"

# 2. 静态 emit 基线（G9）
node scripts/emit-mastergo-html.mjs "<pilot>/data" "<static>/assets" "<pilot>/emit-baseline"

# 3. Vue：MgDecorStack + dynamicZones + overlay
```

| 产出 | 说明 |
|------|------|
| `_all_elements.json` | 48 节点 DesignElement（effects/strokes/radius/富文本） |
| `_layer_stack.json` | z 序装饰层 + dynamicZones 排除 |
| `_mg_consume_audit.json` | **G8**：`ok:true` 才过闸门 |
| `_asset_map.json` | imageRef → 真实 PNG 文件名 |
| `emit-baseline/index.html` | **G9** 与标注稿并排验收 |

**禁止 `css:*` 假绿：** `_asset_map.manual.json` 仅允许真实文件名；IMAGE 无 export → 红框 + `IMAGE_MISSING_EXPORT` blocker。

**父级切图继承：** MasterGo 常把 `exportSettings` 绑在父 FRAME（如 `11:6492 默认头像` → `默认头像@1x.png`），实际 IMAGE fill 在子层（如 `11:6493`）。extract 须沿 `parentId` 向上继承，并产出 `_mg_image_catalog.json` 的 `orphanExports` 审计未绑定文件。

**Pilot：** `your-web/src/pages/sampleDialog/`（帧「示例弹窗帧」）

**消费内核：** `templates/shared/mgStyle.mjs` → `buildMgBoxStyle` / `buildMgTextStyle` / `MgElementRenderer.vue`

**Slice 策略（2026-06-15 修正，以代码为准）：**

```
FILE_DATA 样式完整（无 styleGaps）？
  ├─ 是 → renderAs: div + mgStyle CSS（即使有 export 也不强制切图）
  └─ 否（styleGaps high）→ 有 export PNG？
         ├─ 是 → renderAs: img
         └─ 否 → audit STYLE_DATA_INCOMPLETE（G8 失败）
```

**禁止**按图层名模糊匹配同名 export；**禁止** CSS/几何推断圆角。

**父级 export 切片：** FRAME 已 `renderAs:img` 时，完全落在其 bbox 内的子层自动 `skip`（如 `11:1463 收起` + 子路径）。

**dynamicZones：** 各 pilot 在 `data/_dynamic_zones.json` 声明活体区（聊天/输入），extract 读取后写入 `_layer_stack.json`。

**设计根目录：** `--design-root` 指向含 `expand_layers.txt` 的父目录，产出 `_layers_txt_validation.json`。

~~**Slice 优先（对齐 Sketch static-slice）：** 有 exportSettings 且磁盘存在 → renderAs:'img'~~（已废止，见上）

---

## 借鉴 A 轨道（2026-06-15 双轨优化）

| A 轨道能力 | B 轨道落地 |
|-----------|-----------|
| `_all_elements.json` | `extract-mastergo-all.mjs` 同构产出 |
| `_render_gaps_report.json` | B 版启发式（IMAGE/PEN/长文本） |
| `textStyle` 三件套 | `templates/shared/textStyle.mjs` → `buildTextStyleMg` |
| `_consume_audit.json` | A 专用；B 看 `_missing_assets.json` |
| §3.9 切片 stack | **弹窗类不做**；用结构化组件 + absolute |

**Pilot 验证页：** `your-web/src/pages/sampleDialog/`（源稿 `<design-export>` 帧「示例弹窗帧」）

```bash
node scripts/extract-mastergo-all.mjs \
  --dir "<design-export>/sampleDialog" \
  --design-root "<design-export>" \
  --frame "示例弹窗帧" \
  --out "<pilot>/data"

node scripts/emit-mastergo-html.mjs "<pilot>/data" "<导出目录>/data/exports" "<pilot>/emit-baseline"
```
