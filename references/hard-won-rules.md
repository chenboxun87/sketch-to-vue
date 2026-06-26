# 踩坑录：61 条高风险规则

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：全部参考 skill 的真实踩坑，综合整理，按风险等级排序。

每条都有真实症状描述——遇到对应症状时立刻来看这里。

---

## 规则 1：中文/空格文件名 → 必须 URL 编码，不硬编码

**症状**：图片 404，路径看起来"对"但浏览器解不开。

**原因**：中文字符和空格在 HTTP 路径中需要 URL 编码（`%XX`），直接硬编码字符会导致请求失败。

**修复**：
```javascript
// 必须通过 getAssetPath() 处理所有文件名
export function getAssetPath(filename) {
  const aliased = aliases[filename] || filename;
  return `${BASE}/${encodeURIComponent(aliased)}`;
}

// ❌ 禁止直接拼接
const src = `/static/assets/trend-icon.png`;  // 错误

// ✅ 正确
const src = getAssetPath('trend-icon.png');
```

---

## 规则 2：@2x 文件 CSS 尺寸不除以 2

**症状**：图标/切图显示的尺寸是设计稿的两倍，或者图标太小。

**原因**：`@2x.png` 是高分辨率版本，但 manifest/JSON 里记录的 `w/h` 已经是 1x CSS 像素值。CSS 尺寸直接用这个值，浏览器会自动用高分辨率图填充，显示清晰。

**修复**：
```css
/* ✅ 正确：manifest 值直接用 */
.icon { width: 24px; height: 24px; }

/* ❌ 错误：除以 2 */
.icon { width: 12px; height: 12px; }
```

---

## 规则 3：Windows 系统必须用 Node.js 列出含中文的文件名

**症状**：用 `dir` 命令看到的中文文件名是乱码，导致路径写错。

**原因**：Windows PowerShell 的 `dir` 命令在某些编码环境下无法正确显示中文字符。

**修复**：
```javascript
// ✅ 用 Node.js 列出文件（正确处理 UTF-8）
node -e "const fs=require('fs'); console.log(fs.readdirSync('.').join('\n'))"

// ✅ 或用 PowerShell UTF-8 模式
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-ChildItem | Select-Object Name
```

---

## 规则 4：设计稿含完整页面壳时过滤 + 坐标平移（嵌入 BasicLayout）

**症状**：内容区切片 x/y 偏大，或侧栏/顶栏与设计稿 **双重叠加**；嵌入模式下宽度被压扁、两侧黑边。

**原因**：
1. 设计稿含 chrome，但宿主已由平台提供 → 须 CONTENT_SHIFT
2. 误用 `scale=min(vw/W,vh/H)` letterbox → 为适配高度牺牲宽度

**修复（§3.9 / layer_stack）**：
```javascript
const CONTENT_SHIFT_X = 279  // 从 chrome 层检测，勿硬抄
const CONTENT_SHIFT_Y = 86

function shiftRect(rect) {
  if (!rect || rect.x < CONTENT_SHIFT_X || rect.y < CONTENT_SHIFT_Y) return null
  return { x: rect.x - CONTENT_SHIFT_X, y: rect.y - CONTENT_SHIFT_Y, w: rect.w, h: rect.h }
}

// 嵌入模式 scale：仅宽度
scale = viewportElWidth / (board.w - CONTENT_SHIFT_X)
// 路由：BasicLayout children，勿与顶层全屏路由 duplicate name
```

**锚点架构**另需：`anchors.json` 的 left/top 同步减去 SHIFT。

---

## 规则 5：图标文件名可能与实际内容不符

**症状**：按文件名实现后，显示的图标和设计稿不一样（"用电"图标实际是"设备"图标）。

**原因**：设计师可能复用或误命名了图标文件。

**修复**：
1. 先用 Node.js 列出所有文件名
2. 逐一对照设计图确认图标内容
3. 如果不符，在 `assetAliases.json` 里记录正确映射
4. **绝对不要**靠文件名推断图标语义

---

## 规则 6：plan/bill 变体图标遵循 "原名+备份" suffix 模式

**症状**：某些页面（如"计划"/"账单"）的图标需要换色版本，但找不到对应文件。

**原因**：项目中变体图标通常命名为 `原名备份.png`（而不是 `原名-alt.png` 或 `原名-2.png`）。

**修复**：
```javascript
// 动态拼接 suffix
const iconFile = computed(() => {
  const suffix = isPlanPage.value ? '备份' : '';
  return `icon-power${suffix}.png`;
});
```

---

## 规则 7：dev server 端口被占用 → 检查是否已在运行，不要重启

**症状**：启动 dev server 报 `EADDRINUSE: address already in use`。

**原因**：上一次运行的 dev server 未正常退出，或另一个终端正在运行。

**修复**：
```bash
# 检查是否已在运行
netstat -ano | findstr ":9588"  # Windows
lsof -i :9588                   # macOS/Linux

# 如果已在运行，直接用现有实例（HMR 自动处理文件变更）
# 不要 kill + 重启，热更新会自动生效
```

---

## 规则 8：锚点宽度不足 → 检查最右端元素，扩展 anchors.json

**症状**：组件内容被裁切，最右侧的元素消失或溢出。

**原因**：最右端元素的 `x + w` 超出了 anchors.json 中定义的 width。

**修复**：
```javascript
// 计算最右端
const maxRight = Math.max(...layers.map(l => l.x + l.w));
const minLeft = Math.min(...layers.map(l => l.x));
const neededWidth = maxRight - minLeft;

// 如果 neededWidth > anchor.width，更新 anchors.json
if (neededWidth > anchor.width) {
  anchor.width = Math.ceil(neededWidth) + 4;  // +4px 安全边距
}
```

---

## 规则 9：大屏背景 slice 底部透明区 → Canvas 采样底色，不靠猜测

**症状**：页面底部出现黑色条带，背景图和页面背景色不连续。

**原因**：全屏背景 slice 上方不透明、下方透明（Sketch 画板填充原本在那里）。透明区域露出了应用的深色背景。

**修复**：
```javascript
// Canvas 采样最后一行不透明像素的颜色
async function sampleBottomColor(imgSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      for (let y = canvas.height - 1; y >= 0; y--) {
        const pixel = ctx.getImageData(canvas.width >> 1, y, 1, 1).data;
        if (pixel[3] > 10) {
          resolve(`rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`);
          return;
        }
      }
      resolve('#06122c');  // fallback
    };
    img.src = imgSrc;
  });
}

// 在 mounted() 中采样并设置
const bgColor = await sampleBottomColor('/assets/bg.png');
document.body.style.background = bgColor;
```

---

## 规则 10：Git Bash on Windows → MSYS_NO_PATHCONV=1 防路径自动转换

**症状**：在 Git Bash 中运行带 `/` 开头参数的 Node.js 脚本时，路径被 MSYS 自动转换为 Windows 绝对路径（`/foo` → `C:/Program Files/Git/foo`），导致脚本找不到文件。

**原因**：Git Bash（MSYS2）会将看起来像 Unix 路径的参数自动替换为 Windows 路径。

**修复**：在命令前加 `MSYS_NO_PATHCONV=1`：

```bash
# ❌ 错误（路径被 MSYS 转换）—— 以任意接收路径参数的脚本为例
node scripts/classify-coverage-gaps.mjs /prototypes/dashboard/out

# ✅ 正确（禁用 MSYS 路径转换）
MSYS_NO_PATHCONV=1 node scripts/classify-coverage-gaps.mjs /prototypes/dashboard/out

# 也可设置为环境变量全局生效
export MSYS_NO_PATHCONV=1
```

**适用范围**：所有在 Windows Git Bash 中运行的 Node.js/Python 脚本，只要参数含以 `/` 开头的相对路径。在 PowerShell 或 CMD 中不需要此处理。

---

## 规则 11：提取≠消费——禁止边查 JSON 边目测

**症状**：JSON 里坐标/颜色/字号是对的，但页面仍然偏——因为实现期又凭目测/印象填了值，数据明明提取对了，页面却还原不准。

**原因**：提取与消费脱节。生成了完整的 `_all_elements.json`，AI 写 Vue 代码时却没有真正读取里面的值，靠经验重新猜了一遍。**只提取不强制消费 = 仍然在猜。**

**规则**：
1. 实现期每个 `left/top/width/height/color/fontFamily/fontSize/gradient` 必须从 `_all_elements.json` 按元素 id（或 name）读取。
2. 推荐把 `_all_elements.json` 收敛为页面内的 manifest 数据模块，组件通过 id 查询坐标/样式，而非硬编码字面量。
3. 代码中凡出现绝对坐标/颜色字面量，须注释标注来源元素 id（便于抽查溯源）。
4. 交付前执行 **Step 4-A2 坐标消费抽查**：随机抽 10 个已实现元素，用 CDP 量 computed 值（换算回设计稿坐标系）与 JSON 比对，位置/尺寸偏差须 ≤2px，颜色/字号一致；10 个全部通过才算消费验证通过。

**代价**：跳过会导致「数据明明提取对了，页面却还原不准」的隐性返工，且因为 JSON 看起来是对的而极难定位根因。

---

## 规则 12：丢弃静态基线 = 放弃完整性证据

**症状**：直接上 Vue，无法证明提取是否完整，缺失元素/中心大块空洞无人发现，问题拖到交付前才暴露。

**原因**：纯 JSON 网格算法判断不出「切片存在但内容错位」「画板背景未导出」这类问题。少了可视基线，提取完整性就没有证据闸门。

**规则**：
1. 阶段 2 必须先产出**静态基线 HTML**（用 `emit-html.mjs` 将全量提取图层 1:1 绝对定位渲染），与原稿/preview 并排比对，作为「提取完整性」的可视证据，再进入阶段 3 Vue 化。
2. Step 0-C 检出的真缺失空洞须在静态基线上可见并处理（**引导补导出，或留空报备 `_missing_assets.json`**——见规则 13/18；**禁止裁 preview 当像素兜底**，preview 仅作验证基准）。
3. 基线是证据，不是交付物——它是发现「缺图层 / 坐标错位 / 渐变色错 / 中心区空洞」最快的手段。

**代价**：跳过基线会让中心大背景缺失这类问题拖到最后才暴露，返工成本最高。

---

## 规则 13：无切图 ≠ 无法还原（区分复刻 vs 模拟，见规则 17）

**症状**：某元素没有切图文件，于是用 CSS 凭空"画"渐变/阴影/圆角/描边来"模拟"，结果与设计稿有色差、边缘差、停止点偏移。

**原因**：设计师只对部分元素切图（本例 526 图层仅 46 个 slice 有 `exportable`），其余 text/shape/group 没有图片文件。把「无切图」误当成「只能 CSS 模拟」，而对栅格/复杂视觉凭空捏 CSS 与原图必然存在差异。

**规则（已按 §3.9 修订）**：
1. **复刻**：HTML 本就以 css/渐变表达的矢量层（shape）→ **须按其 `css / fills / borders / radius / shadows` 完整复刻**（见规则 17，这是复刻，不是模拟）。
2. **真图**：栅格/复杂/无规格视觉（全息图/辉光/纹理）→ 用真实图片（slice 或设计师补导），**绝不凭空捏 CSS** 模拟。
3. **缺源**：仍无任何来源 → 留空报备（`_missing_assets.json`，见规则 18），不打补丁遮盖。

> ⚠️ **已废止（§3.7/§3.8 时代，勿再照做）**：旧版本曾要求「无切图元素一律从 @2x 整画板预览按 rect×scale 裁剪真像素（`crop-from-preview.mjs`）或由整图打底覆盖」，并把 `css/fills/borders/radius/shadows` 定为「仅作校验参考、不得用于视觉重建」。这两条均已被 §3.9 推翻：preview 仅作验证基准、不为任何元素提供像素；**矢量层必须按 `css/fills/borders/radius/shadows` 完整复刻**（见规则 17）。

**代价**：把该复刻的矢量层错当"模拟"而跳过、或对栅格视觉凭空捏 CSS，都会在高保真比对中触发 SSIM 不达标返工。

---

## 规则 14：切片声明数 ≠ 磁盘文件数

**症状**：HTML 声明了 46 个切图，但磁盘只有 43 个文件，拼装时 3 个图标 404 / 空白（本例 `总人口数-icon.png`、`指标总数-icon.png`、`kpi-icon-backup.png`）。

**原因**：设计师勾选了 Exportable 但导出时漏导出，或文件被误删——「声明了切图」不等于「磁盘上有文件」。不校验就会在页面上留空洞图标，且因为 JSON 里有声明而极难定位。

**规则（已按 §3.9 修订）**：
1. `extract-all-elements.mjs` 必须逐个校验 `exportable` 文件在 `assetsDir` 实际存在（先经 `resolveAsset()` 做 @2x/@3x 别名映射，见规则 19），输出缺失清单。
2. 仍缺失的切图 → 列入 **`_missing_assets.json`** 留空报备设计师补导（见规则 18），对应区域留空、不打补丁遮盖。
3. 交付前核对：slice 声明数 vs 磁盘文件数（本例 46 声明 / 43 文件 / 3 缺失），缺失项全部已报备补导。

> ⚠️ **已废止（勿再照做）**：旧版本曾让缺失项在 `_render_plan.json` 标为 `needs-preview-crop`、由 `crop-from-preview.mjs` 从 @2x 预览裁剪真像素补齐——§3.9 已禁止裁预览当像素源，改为 `_missing_assets.json` 留空报备补导。

**代价**：不校验会在页面上留下空洞图标，且因为「JSON 里明明声明了」而难以定位根因。

---

## 规则 15：动态内容绝不烤进底图（按层切片拼接，不整图打底）

**症状**：用 @2x 整图当背景后，叠加的 KPI 数值与底图烤死的数字**双影**；真 ECharts 与底图里的样本图表重叠；表格行数被固定死，接口给多少行页面都只显示样本那几行。

**原因**：把整张预览当背景（整图打底）会把设计稿里的**样本数据也一起烤进背景**。页面一旦含图表/表格/实时数值，烤死的样本就会和上层动态组件冲突。

**规则（已按 §3.9 修订）**：按「内容是否随运行时变化」分层，按 `_layer_stack.json` z 序自底向上**切片拼接**——
1. **非信息类**（背景/插画/边框/标题/图标/固定标签等像素不变的）：slice 文件 / 矢量 css 复刻 / base64 落地图 / 活体文本，逐层绝对定位。
2. **信息类**（图表/表格/实时数值）用真组件：真 ECharts、真 v-for 表格、绑定数据的文本，**绝不烤进底图**。
3. **缺源**（动态区干净底 / 装饰底 / 卡片底，无图层无 css 无 asset）→ 列入 `_missing_assets.json` 留空报备设计师补导（见规则 18），对应区域留空，**绝不裁预览、不色块遮盖**。

> ⚠️ **已废止（勿再照做）**：旧版本曾允许「纯静态展示板直接整图打底」，并用「整图打底 / 装饰区裁剪 / 同面板空白裁干净色块 / 提取主色填充」给动态区铺底——§3.9 统一改为按层切片拼接 + 缺源留空报备，不再整图打底、不再裁预览。

**代价**：不分层会双影、真实值穿帮、图表无法随数据更新，且问题往往拖到接入真实数据时才暴露，整页返工。

---

## 规则 16：提取不全 = 复刻偏差的根因
标注 HTML 已呈现全部效果，则所有素材/样式都在 data 字段或引用资源里。任何偏差先归因为「某字段漏提」，而非「设计稿没给」。实证：文本层带双层 `shadows`（投影 + 青色辉光 `#49DFFF 30%`），漏提即丢辉光。脚本必须全字段消费 + `_extraction_coverage.json` 自检。

## 规则 17：复刻 ≠ 图片化；模拟 ≠ 复刻
HTML 本就用 css/渐变表达的矢量层（shape `background-image: linear-gradient(...)`）→ 完整复刻其 css；不强行裁成图片，也不对栅格/复杂视觉凭空捏 css。

## 规则 18：遮挡像素的物理边界 → 留空报备，绝不打补丁
被无独立表示（无切片/css/asset）的上层遮住的像素，仅存在于 preview 且被遮住，任何资源都没有（实证：三库两模型 `98/198` 等约 9 个裸数字脚下为空）。这类缺源 → `_missing_assets.json` 报备设计师补导，留空不色块遮盖。

## 规则 19：asset 引用必经别名映射
`exportable.path` 常写 `xxx-icon.png` 而实际文件是 `xxx-icon@2x.png`（本例 6 处）。直引必引错图，一律走 `resolveAsset()`（精确→@2x→@3x→去@2x）。

## 规则 20：base64 内嵌图必须落地
HTML 内 `data:image;base64,...`（本例 11 处）必须解码写成 PNG 文件再引用，不得内联进 Vue 模板。

## 规则 21：§3.9 验证页禁止混用锚点 overlay + letterbox 误用

**症状 A**：静态层与 KPI/图表 **叠影**。  
**原因**：`_layer_stack` 已渲染该区域，又叠 `CockpitDynamicOverlay` 或 anchor 组件。  
**修复**：skill 验证页 **唯一静态源 = layer_stack**；动态区仅从 stack 排除对应层后加 ECharts/活体文本。

**症状 B**：嵌入 BasicLayout 后无侧栏，或内容窄、两侧黑边、底部被压扁。  
**原因**：路由放顶层全屏 / 未 CONTENT_SHIFT / `scale=min(vw/W,vh/H)`。  
**修复**：见 `meaxure-track.md` Step 0-A0 + 附录「验证页弯路对照」。

**症状 C**：Vue Router 行为异常。  
**原因**：同一 `name` 注册嵌套 + 顶层两条路由。  
**修复**：只保留与宿主模式匹配的一条。

---

## 规则 22：空 group / ghost bitmap → 图标缺口（非 missing-slice）

**症状**：设计稿有 pictogram，页面只有渐变方块或空白；`_missing_assets.json` 无对应项。  
**原因**：MeaXure 导出 **空 group**（HTML 无子 exportable）或 **shape fills/css 皆空**（Sketch 位图未勾选 Exportable）。extract 无法凭空生成 PNG。  
**修复**：
1. Step 0-B 读 `_render_gaps_report.json` → `iconGapCandidates`
2. 从 assets / 旧版项目 / 设计师补导找对应 slice，写 **`_icon_gap_overlays.json`**（elementId→file）
3. Index.vue：`iconGapLayers` 叠加 + `isHiddenVector` 隐藏占位 shape  
**禁止**：引入业务 `CockpitDynamicOverlay`；禁止裁 preview 补图标。

---

## 规则 23：composite 文本 fragment 必须 dedupe

**症状**：`1200tCO2e` 与 `1200`、`tCO2e` 叠影；DIN 字重/颜色看起来「糊」。  
**原因**：`_layer_stack` 同时输出 composite 与 fragment 为 `live-text-*`。  
**修复**：`renderLayers` 内 `dedupeTextLayers`（同坐标 + 同行包含重叠）；`normalizeTextColor` 处理 `#RRGGBB 100%`。  
**检测**：`_render_gaps_report.json` → `duplicateTextGroups`。

---

## 规则 24：假图表 = 识别 + 排除 stack + ECharts（三步缺一不可）

**症状**：ECharts 已挂载但静态柱/网格线仍可见。  
**原因**：假柱为**纯色** background 时旧 `isFakeBarShape` 只认 gradient；或 chart zone 未定义 / 未 `overlapsChartZone` 排除 stack 层。  
**修复**：标题锚定 chart zone → 排除区内 layer_stack 层 → ECharts `overflow:hidden` 容器。见 `element-recognition.md`「Chart Zone 检测」。

---

## 规则 25–29（sampleDashboard 复盘，2026-06-17）

25. **多画板互补拆分**：设计可能拆到多个 artboard（一板背景、一板面板），单独都不完整。
    先逐板算覆盖率，`_artboard_merge_plan.json` 指示合并，`merge-artboards.mjs` 执行。
26. **退化描边路径**：MeaXure `border:Npx solid` 套 5×1 小盒子 = Sketch 描边路径，
    CSS 渲染成 (5+2N)×(1+2N) 实心大色块。`isDegenerateBorderPath` 检测并跳过，保留 ≤2px 细线。
27. **黑底/白底切片**：PNG 含不透明黑/白底时叠深色大屏会突兀。
    `detect-slice-blend` 采样四角+中心 → 黑底 `screen`、白底 `multiply`。让真实切片正确显示，非 CSS 模拟。
28. **颜色形态跨画板不一致**：`borders[].color` 可能是字符串或 `{rgb:{r,g,b}}` 对象或带 `%` 尾缀。
    统一用 `templates/shared/colorParse.mjs#parseColor`，杜绝 `[object Object]`。
29. **图表必须 ECharts 重绘**：图表是动态数据，复刻静态近似无意义且必失真。
    按 `_chart_zones.json` 排除区内静态层 + `templates/echarts` 自渲染。

---

## 规则 30–41（sampleMonitor 复盘，2026-06-17）

---

### 规则 30：Chart Zone 边界必须基于 fakeBarShapes 实际坐标，禁止用面板边界估算

**症状**：ECharts zone 覆盖了无假柱区域（如"图表区域"环形图区）→ 该区所有向量形状和切片被全排除 → 区域渲染完全空白。

**原因**：开发者把面板矩形作为 zone 边界，而不是实际假柱的 bounding box。没有假柱的子区域（如环形图区）被 zone 误覆盖，所有元素被错误排除。

**机械修复流程（低阶模型可直接执行）**：
```javascript
// 第 1 步：从 _render_gaps_report.json 读 fakeBarShapes
const bars = rg.fakeBarShapes || [];

// 第 2 步：按空间聚类（x 间距 < 100px 算同组）
// 第 3 步：每组计算 bounding box
const groups = clusterBars(bars);
groups.forEach(g => {
  console.log(`zone候选: x=${g.minX}, y=${g.minY}, w=${g.maxX+g.maxW-g.minX}, h=${g.maxY+g.maxH-g.minY}`);
});

// 第 4 步：zone rect 仅覆盖假柱 bounding box，加 ±20px 安全边距
// 禁止：把整个面板区域设为一个 zone（必然误覆盖非图表子区域）
```

**诊断命令（执行后对照 zone 定义）**：
```bash
node -e "
const rg = require('./data/_render_gaps_report.json');
const bars = rg.fakeBarShapes || [];
console.log('假柱坐标列表 (x,y,w,h):');
bars.forEach(b => console.log(Math.round(b.rect.x), Math.round(b.rect.y), Math.round(b.rect.w), Math.round(b.rect.h)));
"
```

**代价**：单个过宽 zone 可导致整个面板区域（含环形图/背景切片/标题图标）全部变空白，视觉退行严重且难以溯源。

---

### 规则 31：禁止删除 ECharts zone 而不提供替代渲染

**症状**：删除了一个"图表类型错误"的 ECharts zone（如把 bar 放在了环形图区）→ 区域从"有错误图表"变为"完全空白" → 视觉退行。

**原因**：开发者认为"错误类型的 ECharts 不如 CSS 向量"，于是删掉 zone，但 CSS 向量渲染弧形/折线质量更差，结果更糟。

**决策树（低阶模型照单执行）**：
```
问：这个 zone 内的图表类型是否正确？
  ├── 是 → 保留
  └── 否 → 改图表类型，禁止删 zone
            ├── 原始是环形图 → 改 type 为 'pie'（ECharts 饼图）
            ├── 原始是折线图 → 改 type 为 'line'
            ├── 原始是面积图 → 改 type 为 'area'（带 areaStyle 的 line）
            └── 不确定 → 保留 bar，宁可类型错误也不留空

问：是否确认 CSS 向量渲染效果优于 ECharts？
  ├── 有截图对比证明 → 可删 zone，让 CSS 渲染
  └── 只是猜测 → 禁止删 zone
```

**代价**：删 zone 造成的空白区域在视觉上比错误类型的 ECharts 更差，且改回需要重新分析坐标，返工成本高。

---

### 规则 32：大屏 KPI 数字文本必须 overflow:visible + white-space:nowrap

**症状**：KPI 大数字（如"33224万kw"）被截断显示为"332"或"332..."。

**原因**：设计使用压缩字体（如 `YouSheBiaoTiHei`、`Alibaba PuHuiTi`），这类字体字符极窄；  
缺失时 fallback 字体（如 SimHei/Arial）字符更宽，"33224"溢出 rect 宽度 → `overflow:hidden` 截断。

**必须的 CSS 规则**：
```css
/* ✅ 大屏文字层统一设置 */
.layer-text {
  position: absolute;
  overflow: visible;       /* 禁止 overflow:hidden — fallback 字体宽时会截断数字 */
  white-space: nowrap;     /* 禁止换行 — 换行同样导致数字被分割 */
  pointer-events: none;
  user-select: none;
}
/* ❌ 禁止 */
/* overflow: hidden; text-overflow: ellipsis; */
```

**代价**：text-overflow:ellipsis 在大屏 KPI 场景是反模式。KPI 溢出比截断好，设计稿的 rect 宽度是为原始字体设计的。

---

### 规则 33：KEEP_IN_ZONE_RE 白名单必须覆盖所有区内背景切片

**症状**：面板背景切片（如"编组备份 7"）消失，ECharts 图表浮在透明背景上。

**原因**：背景切片（通常是整个面板的装饰边框图）的**中心点**落在 ECharts zone 内 → `isInsideChartZone` 误排除 → 切片不渲染。

**KEEP_IN_ZONE_RE 标准模板**：
```javascript
// 放入 chartZones.js 或等效文件
const KEEP_IN_ZONE_RE =
  /^(框框|面板背景|矩形|BG|编组备份 [0-9]+|编组 \d+备份.*|编组 16备份.*|配图|工单管理|大屏\/.*|第[一二三]产业)$/

// 规则：
// 1. BG.png（全背景）永远保留
// 2. "编组备份 N"（面板背景切片）永远保留
// 3. "编组 X备份"、"编组 16备份"（子面板背景）永远保留
// 4. 图标切片（配图/工单管理/大屏/...）永远保留
// 5. 新增 zone 时，检查该 zone 内是否有背景切片 → 加到白名单
```

**诊断步骤**：
```bash
# 找出每个 zone 内的背景切片（中心点在 zone 内且是 slice-file）
node -e "
const ls = require('./data/_layer_stack.json');
const slices = ls.layers.filter(l => l.source && l.source.kind === 'slice-file');
const zone = { x: 5480, y: 238, w: 1230, h: 318 }; // 替换为你的 zone
slices.forEach(s => {
  const cx = s.rect.x + s.rect.w/2, cy = s.rect.y + s.rect.h/2;
  if(cx>=zone.x && cx<=zone.x+zone.w && cy>=zone.y && cy<=zone.y+zone.h)
    console.log(s.name, s.rect.w+'x'+s.rect.h);
});
"
# 输出的切片名 → 逐个加入 KEEP_IN_ZONE_RE
```

---

### 规则 34：MeaXure 同名 Group 命名碰撞 → PNG 被错误拉伸

**症状**：某切片（如大尺寸的中心背景"编组"，canvas rect = 2727×1148）实际引用的 PNG 只有 396×203，图像被拉伸 6.9 倍，中心内容失真。

**原因**：Sketch 中多个同名 group 在 MeaXure 导出时共用同一文件名。小的 group（tab 按钮 396×203）先导出，大的 group（中心背景 2727×1148）复用了相同文件，但 canvas rect 记录了大尺寸。

**诊断方法**：
```bash
# 检查 PNG 实际尺寸 vs layer_stack 中记录的 rect 尺寸
python -c "
from PIL import Image
import json, os
ls = json.load(open('./data/_layer_stack.json'))
for l in ls['layers']:
  if l.get('source',{}).get('kind') == 'slice-file':
    f = l['source']['file']
    if os.path.exists(f):
      img = Image.open(f)
      rW = l['rect']['w'] / img.size[0]
      rH = l['rect']['h'] / img.size[1]
      if rW > 3 or rH > 3:
        print(f'[命名碰撞] {l[\"name\"]}  PNG={img.size}  canvas={l[\"rect\"][\"w\"]}x{l[\"rect\"][\"h\"]}  拉伸={rW:.1f}x/{rH:.1f}x')
"
```

**修复代码**：
```javascript
// 在渲染 slice-file 时检测拉伸比
const PNG_NATURAL_SIZES = {
  '编组': { nw: 396, nh: 203 },  // 从诊断脚本输出填写
  // 按项目实际情况添加
}
const STRETCH_MAX_RATIO = 3  // 拉伸超过 3× 才处理

// 在 slice 渲染逻辑中：
const naturalInfo = PNG_NATURAL_SIZES[(layer.name || '').trim()]
if (naturalInfo) {
  const rW = (layer.rect.w || 1) / naturalInfo.nw
  const rH = (layer.rect.h || 1) / naturalInfo.nh
  if (rW > STRETCH_MAX_RATIO || rH > STRETCH_MAX_RATIO) {
    sliceStyle.objectFit = 'none'
    sliceStyle.objectPosition = 'center center'
  }
}
```

---

### 规则 35：无假柱的图表面板也必须定义 ECharts zone

**症状**：右面板右列（含环形图"占比结构A"/"占比结构B"、折线图"月度趋势"）缺失，遗漏 ECharts zone 定义，CSS 向量渲染质量极差。

**原因**：开发者只为 `fakeBarShapes` 存在的区域定义 ECharts zone，误以为"无假柱 = CSS 向量可以胜任"。但弧形（环形图段）、折线（趋势线）都是 CSS 无法准确还原的复杂图形。

**规则（低阶模型照单执行）**：
```
所有在目标设计稿中包含图表的面板，不论是否检测到 fakeBarShapes，一律定义 ECharts zone：
├── 环形图 / 饼图面板 → type: 'pie' 或 'donut'
├── 折线图 / 面积图面板 → type: 'line'（带 areaStyle 的为 area）
├── 柱状图面板（有假柱）→ type: 'bar'（用 fakeBarShapes 坐标精确定界）
└── 柱状图面板（无假柱）→ 检查目标截图；若确有柱，仍定义 zone，type: 'bar'
```

**覆盖完整性检查清单**：
- [ ] 左面板：所有含图表的子区域各自有 zone
- [ ] 右面板左列：上/中/下三个子区域各自有 zone
- [ ] 右面板右列：上/中/下三个子区域各自有 zone
- [ ] 中心区（如有图表面板）：各自有 zone

---

### 规则 36：screen blend 必须有像素采样依据，禁止凭名称通配符盲目应用

**症状 A（过度应用）**：全彩地形图 PNG（如 `编组.png` 含 3D 地图）被应用 screen blend → 暗色区域变透明，地形消失，中心区空洞。

**症状 B（漏应用）**：发光叠加层 PNG（如真正的黑底发光）未应用 screen blend → 黑色区域遮盖背景，显示为黑色方块。

**正确判断方法**：
```bash
# 用 Python 采样 PNG 四角 + 中心，判断是否为黑底发光图
python -c "
from PIL import Image
import sys

def is_dark_bg_glow(path):
    img = Image.open(path).convert('RGBA')
    w, h = img.size
    corners = [img.getpixel((0,0)), img.getpixel((w-1,0)),
               img.getpixel((0,h-1)), img.getpixel((w-1,h-1))]
    center = img.getpixel((w//2, h//2))
    # 黑底发光特征：四角透明（a<50）且中心暗（r+g+b<60）
    corners_transparent = all(p[3] < 50 for p in corners)
    center_dark_or_transparent = (center[3] < 100) or (sum(center[:3]) < 80)
    return corners_transparent and center_dark_or_transparent

import os
for f in os.listdir('.'):
    if f.endswith('.png'):
        verdict = 'screen' if is_dark_bg_glow(f) else 'normal'
        print(f'{verdict}  {f}')
" 2>/dev/null
```

**规则**：
- 四角透明（A<50）+ 中心暗或透明 → **screen blend**（黑底发光覆盖层）
- 其他情况 → **不应用 screen blend**（全彩内容图，正常叠加）
- 禁止用切片名字符串匹配（名称"编组"可能是 tab 按钮也可能是地图图片）

---

### 规则 37：路由自动生成器会覆盖手动路由（Muse CLI / 自动路由框架）

**症状**：手动往 `routerInfo.js` 里加的独立路由（如 `/sampleMonitor`）在 `npm run dev` 后消失，报 404。

**原因**：Muse CLI 等框架通过 `npm run router`（或 `npm run dev` 内置触发）扫描 `src/pages/` 目录，自动重新生成 `routerInfo.js`，覆盖手动编辑。自动生成的路由通常会把页面挂载到 BasicLayout 下作为 children，而非独立顶层路由。

**诊断**：
```bash
# 确认 routerInfo.js 是否被自动覆盖
grep "sampleMonitor" src/router/routerInfo.js
# 若没有，检查 cli.config.json 是否含 autoRouter: true
```

**修复原则**：
1. **优先接受自动生成路由**：检查自动生成的 URL（通常为 `/basePath/页面目录名/文件名`）
2. **全屏页要用 `position:fixed` 穿透 BasicLayout**：即使挂载在 BasicLayout 下，全屏组件用 `position:fixed; inset:0` 也能覆盖壳，视觉上独立
3. **禁止反复手动修改再被覆盖**：若必须保持手动路由，在文档/TODO 中注明"不能跑 `npm run router`"，并在 package.json scripts 里加注释

```javascript
// src/pages/sampleMonitor/Index.vue 中强制全屏
/* <style> */
.nt-jiance-shell {
  position: fixed; /* 关键：穿透 BasicLayout 的容器 */
  inset: 0;        /* 占满全屏 */
  z-index: 1000;
  background: #000;
  overflow: hidden;
}
</style>
```

**代价**：不了解自动路由机制会反复修改→丢失→修改，浪费大量时间在路由 debug 而非功能实现。

---

### 规则 38：`_layer_stack.json` 必须包含 shape/vector 层；缺失时必须从 `_all_elements.json` 补充消费

**症状**：面板背景渐变、顶部导航装饰、城市指示器椭圆等所有矢量形状全部消失，页面只剩切片图片和文字。

**根因**：`extract-all-elements.mjs` 生成 `_all_elements.json` 时包含了 303 个 shape + 207 个 group，但 `_layer_stack.json` 中 `vector-css` 数量为 0。提取脚本未将矢量形状写入 layer_stack，导致渲染循环完全跳过所有形状层。

**诊断命令**：
```bash
node -e "
const ls = require('./data/_layer_stack.json');
const ae = require('./data/_all_elements.json');
const l = ls.layers || ls;
const e = ae.elements || ae;
const lKinds = {};
l.forEach(x => { const k=(x.source||{}).kind||'?'; lKinds[k]=(lKinds[k]||0)+1; });
const eTypes = {};
e.forEach(x => { eTypes[x.type]=(eTypes[x.type]||0)+1; });
console.log('layer_stack kinds:', JSON.stringify(lKinds));
console.log('all_elements types:', JSON.stringify(eTypes));
if((lKinds['vector-css']||0) === 0 && (eTypes['shape']||0) > 0)
  console.log('⚠️  CRITICAL: shape 层全部遗漏！需要从 _all_elements.json 补充消费');
"
```

**补充消费代码（Index.vue renderItems 追加）**：
```javascript
// 补充 shape 层（_layer_stack.json vector-css 为 0 时必加）
const seenShapeRects = new Set()
const shapeItems = elArr
  .filter((e) => {
    if (e.type !== 'shape') return false
    if ((e.name || '').trim() === '蒙版') return false
    const w = e.rect?.w || 0, h = e.rect?.h || 0
    if (Math.max(w, h) < 35) return false  // 排除真小点，保留薄装饰线
    const css = (e.css || []).join(' ')
    const hasFill = css.includes('background-image:') ||
      (css.includes('background:') && !css.includes('rgba(0,0,0,0)') && !css.includes('transparent'))
    if (!hasFill) return false
    // 窄且在 chart zone 内 = 假图表柱，排除
    if (Math.min(w, h) <= 30 && isInsideChartZone(e.rect, e.name)) return false
    return true
  })
  .filter((e) => {
    const key = `${Math.round(e.rect?.x)},${Math.round(e.rect?.y)},${Math.round(e.rect?.w)},${Math.round(e.rect?.h)}`
    if (seenShapeRects.has(key)) return false
    seenShapeRects.add(key)
    return true
  })
  .map((e) => ({
    key: 'shape-' + e.id,
    kind: 'vector',
    name: e.name,
    style: { ...boxStyle(e.rect), zIndex: e.z || 0, ...parseCssArray(e.css || []) },
  }))
```

**代价**：跳过此检查会导致整个页面"扁平化"——只有背景图、文字和 ECharts，所有面板卡片/装饰层/城市指示器全消失，与目标设计相差极大。

---

### 规则 39：切片层要应用 css 的**非几何**字段（blend/filter/opacity），但**几何 transform 必须剔除**（见规则 49）

> ⚠️ **本规则已于 2026-06-17 订正**。早期版本曾写「切片必须应用 css 含 `transform: scaleX(-1)`，漏掉会方向错」——这是**错误的**，正是它导致了 `位图备份 11`（左括号）被渲染成右括号的事故。切片的几何 transform 一律剔除。详见规则 49。

**核心区分**：MeaXure 导出切片 PNG 时，是按图层最终渲染外观截出来的，**翻转/旋转/倾斜已经烘焙进像素**。所以切片消费 css 要分类：

| css 声明 | 切片该怎么做 | 理由 |
|---|---|---|
| `transform`（scaleX/scaleY/rotate/matrix/skew/translate） | **必须剔除（delete）** ⛔ | 已烘焙进 PNG，再施加=二次变换（规则 49） |
| `mix-blend-mode` / `filter` | 应用 ✅ | 叠加阶段属性，非烘焙 |
| `opacity` | 应用 ✅ | 透明度不烘焙进 PNG（导出为不透明像素） |
| `box-shadow` | 应用 ✅ | 投影常在 PNG bounds 外，须 CSS 还原（如三库两模型 `编组 8`） |
| `background-image` | 忽略 ✅ | 切片是 `<img src>`，PNG 比 CSS 渐变精确 |

**正确做法（切片渲染循环中）**：
```javascript
const sliceEl = elMap[layer.id] || {}
if (sliceEl.css && sliceEl.css.length) {
  const sliceCss = parseCssArray(sliceEl.css)
  delete sliceCss.transform   // ⛔ 几何 transform 已烘焙进 PNG，剔除防二次变换（规则 49）
  Object.assign(sliceStyle, sliceCss)  // 保留 opacity / mix-blend-mode / filter 等非烘焙属性
}
```

**对比 render-vector**：矢量按 geometry 实时绘制，没有"烘焙"，`transform` **必须保留**——这是 slice 与 vector 消费 css 的根本区别，不能共用一段无差别 `Object.assign`。

**诊断命令（找所有有 css 的切片）**：
```bash
node -e "
const ae = require('./data/_all_elements.json');
const e = ae.elements || ae;
e.filter(x => x.type==='slice' && x.css && x.css.length > 0)
  .forEach(x => console.log(x.name, '->', x.css.join(' | ')));
"
```

---

### 规则 40：shape 薄装饰线被过度过滤——必须用三层过滤策略

**症状**：面板顶部的发光边框线（如 1263×36 的渐变横线）、导航顶部装饰线（2044×70）不显示，面板卡片"头顶光效"消失。

**根因**：常见的 `min(w,h) < 80` 过滤策略会把所有"有一边 < 80px"的 shape 全排除——包括真正有视觉价值的薄装饰线。

**正确的三层过滤策略**：
```javascript
// 层 1：最大边长过滤（排除"6×6"真小点，保留"1263×36"薄线）
if (Math.max(w, h) < 35) return false

// 层 2：CSS 内容过滤（必须有实际 fill，非透明）
const css = (e.css || []).join(' ')
const hasFill = css.includes('background-image:') || 
  (css.includes('background:') && !css.includes('transparent'))
if (!hasFill) return false

// 层 3：假图表柱过滤（窄 <= 30px 且在 chart zone 内 = 图表假柱，排除）
if (Math.min(w, h) <= 30 && isInsideChartZone(e.rect, e.name)) return false
```

**关键数字**：
- `maxDim < 35`：排除 6×6 点，保留 1263×36 线
- `narrowDim <= 30`：图表柱宽通常 24px 以内，30px 是安全边界
- `isInsideChartZone`：只排除在 ECharts zone 内的窄元素（面板装饰线不在 zone 内）

---

### 规则 41：渲染计划必须做"处置级"完整性校验，而非只查字段覆盖

**症状**：`_extraction_coverage.json` 显示 ok:true，但页面仍大面积缺元素（sampleMonitor 丢 303 个 shape）。

**根因**：字段级自检只验证"每个 JSON 字段被读到"，不验证"每个可见元素被渲染/图表化/显式排除"。两者是正交的完整性口径。

**修复**：用 `scene-graph.json`（保留父子树）+ `audit-scene-graph.mjs`（处置级闸门）：每个节点必须有非空 `disposition.kind`，有 fill 的 shape 不得 unclassified，否则 exit 3 当场点名。

**诊断命令**：
```bash
node scripts/audit-scene-graph.mjs <outDir>/scene-graph.json
```

---

### 规则 42：slice 资产必须确定性审计——重名碰撞/磁盘缺失一律留空，绝不靠猜、绝不裁预览

**症状**：标题 tab、中部地图等元素显示成「别的图」或残缺（sampleMonitor：3 个图层都叫「编组」→ `编组.png` 互相覆盖，地形拿到 tab 按钮被拉伸）。

**根因**：MeaXure 导出时同名 slice 写盘互相覆盖（碰撞），或声明了导出但 PNG 缺失。此时按「名字/尺寸」匹配资产会**用错**；从全页预览裁剪兜底则有 z 序遮挡、烘焙前景等问题，且对低阶模型不友好。

**铁律（已有资源用全、用对、不冗余；缺失精准留空）**：
1. **确定性识别**：深度解析 `let data` 图层树 + 比对 `assets/` 实际文件，`audit-slice-assets.mjs` 产出 `skipIds`（碰撞失败方 + 磁盘缺失）。判定全程机械可复算，**不靠尺寸/AI 看图猜测**。
2. **用对**：消费端渲染 `render-slice` 前查 `SLICE_SKIP`，命中即留空——碰撞「胜出者」（rect≈磁盘尺寸）照常渲染，失败方绝不拿被覆盖的 PNG。
3. **用全**：所有唯一切片一个不漏。
4. **不冗余**：渲染列表按 `kind|位置|源` 去重，过滤设计稿「备份」副本的同位置叠加。
5. **缺失留空 + 缺口清单**：`slice-asset-gap-report.md` 列出所有留空元素（含坐标/尺寸/缺陷类型），交付使用者向设计师索取切图；**禁止裁预览、禁止色块遮盖**。无 `.sketch` 可重导出时，留空比兜底更专业可信。

**诊断命令**：
```bash
node scripts/audit-slice-assets.mjs <index.html> <outDir>/slice-asset-audit.json
```

---

### 规则 43：disposition 的「可渲染」判据必须含描边/阴影/渐变，绝不能只认 fill

**症状**：页面缺大量分隔线、彩色描边框、圆角状态标签、卡片光晕——明明原标注有坐标+样式却没出现。sampleMonitor 实测：82 个 `exclude:ghost` 里有 **68 个其实带可渲染 CSS**（`border: 2px solid #0BFFB6`、`border: 1.11px solid #FFFFFF; opacity: 0.1` 分隔线、`border-radius+border` 圆角彩框、`box-shadow` 光晕），被 disposition 当 ghost 丢弃。

**根因**：`disposition.mjs` 的 `hasFill()` 只检查 `background/background-image/fills[]`。Sketch 里大量「路径/直线/描边框」**只有 border 没有 fill**——这类 shape `fills` 为空，于是被判 `exclude:ghost`，整层连同已标注的坐标和颜色一起丢失。这是「已有样式没充分利用」最隐蔽的大头。

**铁律**：判「shape 是否可渲染」要看**任一可见绘制属性**，不止填充：
```javascript
function hasRenderableStyle(attrs) {
  if (attrs.fills?.length)   return true
  if (attrs.borders?.length) return true   // ← 纯描边路径/分隔线/直线
  if (attrs.shadows?.length) return true   // ← 纯阴影光晕
  for (const decl of (attrs.css || [])) {
    const s = String(decl).toLowerCase()
    if (/background-image\s*:/.test(s)) return true
    if (/background\s*:/.test(s) && !s.includes('transparent') && !s.includes('rgba(0,0,0,0)')) return true
    if (/(^|[;\s])border\s*:\s*[\d.]+px/.test(s)) return true  // 含宽度的实描边（排除 border-radius）
    if (/linear-gradient|radial-gradient/.test(s)) return true
    if (/box-shadow\s*:/.test(s)) return true
  }
  return false
}
```
- 只剩「图片填充未导出 / 仅 `transform`·`opacity` 占位」才判 `exclude:ghost`（无任何可见绘制 → 留空正确）。
- 消费端 `render-vector` 用通用 `parseCssArray(attrs.css)` 即可把 border/opacity/border-radius/box-shadow 原样落成内联 style——无需额外逻辑，低阶模型也零成本。
- 改后 sampleMonitor：`render-vector` 209→277，`exclude:ghost` 82→14，零样式丢失。

**自检**：消费完整性脚本应统计「非渲染处置但 css 含 border/shadow/gradient」的节点数，必须为 0。

---

### 规则 44：禁止「自由发挥」——ECharts/图表只在设计稿真有该图形且能忠实重建时才叠加，否则留空

**症状**：页面比设计稿「多」了元素。sampleMonitor 右列「占比结构A/占比结构B」我们叠了 ECharts 平面圆环，但设计稿是 **3D 实心饼**、位置在面板右侧底座上；结果平面环摆在 zone 中心偏左，和底座并排 = 用户看到「多了两个圆环，设计稿里根本没有」。

**根因（双重自由发挥）**：
1. **造图形**：设计稿的彩色 3D 饼**导出数据里缺失**——切片只烤了「空底座」（半透明发光圆盘，无数据扇区），扇区是布尔 `形状结合/Clip` 矢量（CSS div 无法还原），真图形只存在于扁平预览。我们用 ECharts 平面环顶替 = 凭空造了个形态不符的图形。
2. **造数据**：ECharts 的扇区数值/颜色是手写 mock，与设计无关。

**铁律（反向比对 + 缺失留空）**：
- **正向**（设计→页面）保证不漏；**反向**（页面→设计）保证不多。交付前必做反向比对：逐个 ECharts/overlay 自问「设计稿这个位置真有这个图形吗？形态/位置/数据对得上吗？」对不上就是自由发挥。
- ECharts 叠加**仅**用于设计稿用「真实数据基元」绘制的图表（假柱 fake-bar、折线矢量）——这类是忠实重建。
- 设计稿把图表**烤成切片图**（饼/3D 图）时：切片已忠实呈现 → **不得**再叠 ECharts。
- 切片只烤了「空壳/底座」、真图形导出缺失且无法用 CSS 忠实还原（布尔/Clip 矢量）→ **留空**：只渲染底座+图例，缺图登记 gap 清单，绝不用平面图表顶替。
- **辨别预览 vs 切片**：肉眼读 `assets/编组备份 N.png` 等大切片——若只有底座/空框，说明数据图形未导出，别被扁平预览 `preview/*@2x.png` 里「看得见的图」骗了去造图。

**落地手法**：
- 从 `CHART_ZONES` 移除该 overlay；删对应 option builder 死代码。
- 设「留空区」`PIE_GAP_ZONES` + `isInsidePieGapZone(rect)`，在消费端 **render-vector 分支**抑制区内布尔扇区矢量（避免渲染成彩色方块）；**render-slice 分支不加此检查**，底座照常渲染。
- gap 报告加「设计稿级缺口（手工登记）」节，记录形态/位置/根治方式，注明重跑审计脚本不覆盖。

### 规则 45：切片 rect 与 PNG 自然比例不符必拉伸——按内容定 object-fit，数据驱动落 slice-fit.json

**症状**：KPI 图标（水滴/油桶/火焰）被压成又瘦又高的怪样。`月总指标量.png` 自然 286×94（AR≈3.0，左图标+右装饰连接线的宽条），但 scene-graph 给的 rect 是 144×126（方），`<img>` 默认 `object-fit:fill` 把宽条横向压扁+纵向拉高 = 图标变形。

**根因**：MeaXure 导出里**兄弟节点的 frame 口径不一致**——同一行 6 个 KPI，`指标A/指标B` rect 是 323×93（与 PNG 比例吻合，不失真），但 `指标C/指标D/指标E/指标F` rect 只框了图标部分（144×126），与宽 PNG 比例严重不符。这是导出数据的客观瑕疵，不是消费 bug，但消费端必须防拉伸。

**铁律**：
- `<img>` 切片**默认 `object-fit:fill` 会拉伸**。当 PNG 像素尺寸与 rect **不一致**（`|pngW/rectW - 1| > 0.08` 或 AR 比 > 1.15）→ **必须** `object-fit: contain`（或 `slice-fit.json` 指定 cover）。
- MeaXure 常导出「含阴影 padding 的 PNG」（如 `编组 8.png` 91×92 vs rect 55×52）+ 独立 `box-shadow` css → 消费端须**同时**应用 css 装饰 + contain，禁止 fill 压扁。
- **fit 由内容决定，不能一刀切**：
  - **宽条塞窄框**（boxAR < pngAR，如图标条）→ `cover` + `object-position: left center`：主体（左侧图标）按原比例填满框高、不变形，裁掉右侧装饰线/淡光（装饰可弃）。
  - **窄图塞宽框**（boxAR > pngAR）→ `contain`：不裁不拉，可能留白。
  - **发光/blend 背景层**（如 `编组`/`编组 16备份`，soft glow）→ **保持 fill**：轻微比例差在柔光上不可见，contain/cover 反而会在全幅光效里留缝。审计会列为候选，人工排除。
- **数据驱动**：审计脚本 `audit-asset-consumption.mjs` 产出 `slice-fit.suggest.json`（机器建议，含发光层等噪声）；人工筛选真图标项落到页面 `data/slice-fit.json`（键=资产名去扩展名，值=`{fit,position}`），消费端按此覆盖。机器建议 ≠ 直接采用。

**落地手法**：
- 消费端 render-slice 分支：`const fit = SLICE_FIT[fitKeyOf(filePath)]; if (fit) { style.objectFit=fit.fit; style.objectPosition=fit.position }`。
- 判前先**肉眼看一眼 PNG** 确认内容布局（图标在左/中？是否含文字？含文字慎用 cover 以免裁字），再定 cover/contain 与 position。

### 规则 46：人工挑错前先跑 `audit-asset-consumption.mjs` 做确定性资产体检

**背景**：图片/样式的「漏用、错用、多用」长期靠肉眼逐个对，低阶模型尤其难、易漏。这些问题**全部可由 scene-graph + 资产目录确定性算出**，无需看图猜。

**一条命令**：
```
node audit-asset-consumption.mjs --scene <scene-graph.json> --assets <已部署资产目录>
```

**六类体检**（对应「漏用/错用/多用 × 图片/样式」）：
| 类型 | 含义 | 归类 |
|---|---|---|
| `missing-asset` | render-slice 引用的文件磁盘缺失 → 运行时 404 | 图片漏用（高优先级） |
| `shared-file` | 同名文件被多个切片以不同尺寸引用 → MeaXure 拍平命名碰撞 | 图片错用 |
| `aspect-distort` | rect 比例与 PNG 自然比例严重不符 → fill 拉伸（产出 fit 建议） | 图片错用 |
| `empty-vector` | render-vector 无任何可渲染样式 → 空盒/隐形 | 样式漏用 |
| `text-fragment-overlap` | 复合文本与碎片文本重叠且都非 artifact → 双重渲染 | 样式多用 |
| `unused-asset` | 资产目录有、无切片引用的 PNG | 图片多用/冗余 |

**用法纪律**：
- **早跑**：还原刚出页面、人工验收前先跑，把确定性问题清掉，把人眼留给真正主观的视觉差异。
- **误报偏宽松是设计**：脚本不感知页面自定义过滤（图表区/缺口区/去重/发光层 fill），故 `unused-asset`/`aspect-distort` 会含被页面有意处理的项（如被移除饼图区的标签切片、发光层）。**逐条结合页面逻辑判定**，不是见红就改。
- **高优先级（`missing-asset`）必清**：要么补素材到部署目录，要么登记 gap 清单。
- 产物：`consumption-audit.json`（全量）+ `slice-fit.suggest.json`（fit 建议，供 slice-fit.json 人工确认）。

### 规则 47：MeaXure 不输出渐变描边 CSS——消费端必须从 attrs.borders[] 自行合成（不然描边永远遗漏）

**症状**：形状结合面板（1263×336，渐变背景 + 渐变内描边）只渲染了背景，描边消失——左侧面板的蓝色发光轮廓线不见了。设计标注里能清楚看到 1px Inside 渐变描边（#2A5FA0 0% → #689EE1 100%），但页面上一点没有。

**根因（三层）**：
1. **提取层**（scene-graph）：完整。`attrs.borders[]` 有结构化渐变描边数据（position/thickness/gradient/colorStops），提取没有遗漏。
2. **MeaXure CSS 层**：`attrs.css[]` 里**没有描边 CSS**。原因：CSS `border-image: linear-gradient(...)` 与 `border-radius` 原生不兼容（设 `border-image` 后 `border-radius` 失效），所以 MeaXure 在有 `border-radius` 的渐变描边上直接放弃输出 CSS。这是 MeaXure 工具的已知限制，非提取 bug。
3. **消费层**：`parseCssArray(node.attrs.css)` 只读 CSS 字符串数组，`attrs.borders[]` 结构化数据**完全被忽略**——这是消费侧遗漏。

**铁律**：
- `attrs.css[]` **不完整**，不能作为唯一来源。渐变描边、复杂描边、阴影都可能只存在于结构化字段（`attrs.borders[]`, `attrs.shadows[]`）而不在 `attrs.css[]` 中。
- render-vector 分支**必须**在 `parseCssArray` 之后，追加 `synthBorderFromAttrs(attrs)` 的输出，两者 merge。

**合成策略（CSS 限制下的最优近似）**：
| 描边类型 | CSS 方案 | 理由 |
|---|---|---|
| Inside 渐变描边 | `box-shadow: inset 0 0 0 <thick>px <opaqueStopColor>` | 与 `border-radius` 完全兼容；取不透明度最高 stop 的色作代表色 |
| Inside 纯色描边 | `box-shadow: inset 0 0 0 <thick>px <color>` | 同上 |
| Center/Outside 描边 | `outline: <thick>px solid <color>` | 不影响 box model，`border-radius` 在现代浏览器也支持 |
| 若 `attrs.css[]` 已有 `border:` 声明 | 跳过合成 | 避免重复/覆盖 |

**代码落地**（`renderUtils.js`）：
```js
export function synthBorderFromAttrs(attrs) {
  const borders = attrs.borders || []
  if (!borders.length) return {}
  // 若 css 已有 border: 声明则跳过
  const hasExplicit = (attrs.css||[]).some(c => /^border\s*:/i.test(c) && !/border-radius/i.test(c))
  if (hasExplicit) return {}
  const insetParts = []
  for (const b of borders) {
    const thick = b.thickness || 1
    let color = ''
    if (b.fillType === 'Gradient') {
      const stops = b.gradient?.colorStops || []
      const best = stops.reduce((m,s)=>s.color.alpha>m.color.alpha?s:m, stops[0]||{color:{alpha:0}})
      if (best.color?.rgb) {
        const {r,g,b:bl} = best.color.rgb
        const a = best.color.alpha<=1 ? best.color.alpha : best.color.alpha/255
        color = `rgba(${r},${g},${bl},${a.toFixed(2)})`
      }
    } else if (b.color?.rgb) {
      const {r,g,b:bl} = b.color.rgb
      const a = b.color.alpha<=1 ? b.color.alpha : b.color.alpha/255
      color = `rgba(${r},${g},${bl},${a.toFixed(2)})`
    }
    if (!color) continue
    if ((b.position||'Center')==='Inside') insetParts.push(`inset 0 0 0 ${thick}px ${color}`)
  }
  if (insetParts.length) return { boxShadow: insetParts.join(', ') }
  return {}
}
```

消费端 render-vector：
```js
const style = {
  ...boxStyle(node.rect),
  ...parseCssArray(node.attrs.css || []),
  ...synthBorderFromAttrs(node.attrs),   // ← 补 MeaXure 遗漏的渐变描边
  zIndex: node.z,
}
```

### 规则 48：面板背景层的中心会落在它所包含的图表 zone 内——isInsideChartZone 必须加面积门禁，否则误过滤背景

**症状**：左侧面板整体蓝色渐变背景（opacity 0.63，linear-gradient #0850FF→#0081FF）完全消失。节点是 `render-vector`，CSS 正确，但页面上什么都没有——背景面板被 `isInsideChartZone` 过滤掉了。

**根因**：面板背景元素（1263×336）的**几何中心**（769,400）恰好落在 `carbonStructPie` zone（725,238,540×318）内。zone 过滤只看「中心点是否在 zone 内」，而大面板的中心必然在它所包含的子 zone 内 → 面板背景被误判为图表系列元素被排除。

同理：第二个面板背景（138,643,1263×336）中心落入 `energyTypeTrend` zone，且两者面积几乎相同（ratio≈1.00）→ 同样被误过滤。

**铁律**：
- zone 过滤的**本意**是排除「小图表系列元素」（bar 柱、line 节点、pie 扇区，面积远小于 zone），不应排除「面板背景层」。
- 区分标志：**背景层面积 ≥ zone 面积的 90%** 且 **宽高均 ≥ zone 的 85%**。实际图表元素（柱宽5-20px）面积远达不到这个阈值。
- 定义新图表 zone 时，**必须验证**：该 zone 范围内是否有大面积面板背景（`形状结合`/`矩形`/`编组`），若有须确保面积门禁能正确识别。

**修复代码**（`chartZones.js` 中 `isInsideChartZone`）：
```js
return CHART_ZONES.some((z) => {
  const r = z.rect
  if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) return false
  // 面积 ≥ zone 的 90% 且宽高 ≥ 85% → 面板背景，不过滤
  if (elemW * elemH >= r.w * r.h * 0.9 && elemW >= r.w * 0.85 && elemH >= r.h * 0.85) return false
  return true
})
```

### 规则 49：切片（type:slice）的 transform 已烘焙进导出 PNG——消费端必须剔除，否则二次变换（左括号被翻成右括号）

**症状**：左侧面板装饰应该是「左括号 `(`」（设计稿 + 导出的 `位图备份 11.png` 本身就是左括号），实际渲染成了「右括号 `)`」。

**根因（消费侧二次变换）**：
- 源标注里该切片明确写着 `{"type":"slice","name":"位图备份 11","rect":{x:1285,...},"css":["transform: scaleX(-1);"],"exportable":[{"path":"位图备份 11.png"}]}`。
- **关键事实**：MeaXure / Sketch 导出切片 PNG 时，是按图层在画板上的**最终渲染外观**截出来的——翻转（scaleX/scaleY）、旋转（rotate）、倾斜（skew）**都已经烘焙进 PNG 像素**。导出的 `位图备份 11.png` 打开看就已经是左括号（最终态）。
- `attrs.css` 里那条 `transform: scaleX(-1)` 是 MeaXure 记录的「这张切片是怎么从母版图层推导出来的」**配方元数据**，不是需要再施加一次的样式。
- 消费层 `parseCssArray(node.attrs.css)` 把 `transform` 一并透传给了 slice 的 `<img>` style → 已是左括号的 PNG **被再翻转一次** → 右括号。
- 旁证：右侧镜像装饰 `位图备份 7`（同样形状的右括号）`css:[]` 没有 transform，所以右侧一直正常——正好反证「PNG 已是最终态，无需再 transform」。

**铁律**：
- **`render-slice` 分支必须剔除 `transform`**（scaleX/scaleY/rotate/matrix/skew/translate 全部）。切片由 `rect` 绝对定位 + 已烘焙的像素，任何几何 transform 都是二次变换。
- **`render-vector` 分支保留 `transform`**：矢量是按 geometry 实时绘制的 DOM，没有"烘焙"一说，transform 是必要的。
- 这是 slice 与 vector 在消费 `attrs.css` 上的**根本区别**，不能用同一段代码无差别 `Object.assign`。

**修复代码**（`Index.vue` 的 render-slice 分支）：
```js
if (node.attrs.css && node.attrs.css.length) {
  const sliceCss = parseCssArray(node.attrs.css)
  delete sliceCss.transform   // ← 切片：翻转/旋转已烘焙进 PNG，剔除 transform 防二次变换
  Object.assign(style, sliceCss)
}
```

### 规则 50：素材引用是「位置 → objectID → exportable.path」的唯一确定映射——禁止靠图片 AI 识别、按尺寸/命名相似度猜

**症状/反模式**：调试某个位置该用哪张图时，去 `assets/` 目录用文件名模糊搜索（`*括号*` `*bracket*`）、或按 rect 尺寸去匹配最接近的 PNG、或拿图片喂给视觉模型"看像哪张"。这些都是**猜**——会猜错（命名碰撞、镜像对、近似尺寸），且对低阶模型极不友好。

**铁律（确定性资产解析）**：
1. 标注产物（index.html / `_all_elements.json` / scene-graph）里，每个切片都带 `objectID` + `rect` + `exportable[].path`（或 `exports[].path`）。**某个位置用哪张图是唯一确定的**，直接读这个字段即可。
2. scene-graph 消费时，slice 的 `src` **只能**来自 `node.attrs.exports?.[0]?.path || node.attrs.exportable?.[0]?.path`，经 `getXxxAssetUrl()` 解析为 public 路径。**绝不**用文件名搜索 / 尺寸匹配 / 视觉识别的结果。
3. 同名 PNG 命名碰撞（MeaXure 多图层重名导出覆盖）→ 用 `objectID` 区分、由 slice-asset-audit 标 `skipIds` 留空，**不是**去猜哪张才对。
4. 调试定位问题时，第一步永远是**回到标注源**（grep `位图备份 11` 看它的 `rect`/`css`/`exportable`），而不是去翻 assets 目录。源数据是唯一真相。

**给低阶模型的口诀**：「位置确定 objectID，objectID 确定 exportable.path，path 确定那张图。全程不看图、不比大小、不猜名字。」

### 规则 51：MeaXure 不为椭圆 shape 输出 border-radius——消费端必须按图层名自动补 50%

> 规则 52–55 来源：§3.9 layer_stack 嵌入模式实战验证，覆盖文字全空白、数字单位重叠、字体宽度溢出、容器裁切四类系统性问题。

**症状**：设计稿上明确标注「椭圆形 5」（oval，146×76），渲染后是矩形。

**根因**：Sketch 里椭圆（oval）和矩形（rectangle）在 MeaXure 中都以 `type:shape` 导出，无法从类型字段区分。MeaXure 对椭圆只输出 `background`/`opacity` 等属性，**不输出 `border-radius: 50%`**，因为从 `type:shape` 无法推断。图层名「椭圆形/oval/ellipse」才是唯一可靠的区分标志。

**关联陷阱**：父级编组如果有 PNG 导出（`render-slice`），子椭圆被正确整体渲染；若父编组无导出（`container`），子椭圆 fallthrough 成 `render-vector`，此时缺 `border-radius` → 矩形。

**铁律**：render-vector 分支，凡图层名匹配 `/椭圆|oval|ellipse/i` 且 `parsedCss.borderRadius` 为空 → 补 `borderRadius: '50%'`。

**代码落地**（消费端 render-vector 分支）：
```js
const parsedCss = parseCssArray(node.attrs.css || [])
// 椭圆 shape 补 border-radius（MeaXure 不输出）
if (/椭圆|oval|ellipse/i.test(name) && !parsedCss.borderRadius) {
  parsedCss.borderRadius = '50%'
}
const style = { ...boxStyle(node.rect), ...parsedCss, ...synthBorderFromAttrs(node.attrs), zIndex: node.z }
```

---

### 规则 52：`_layer_stack.json` 文字层 source 无 content/样式——渲染前必须按 id 从 `_all_elements.json` 补全（否则全页文字为空）

**症状**：页面切图/矩形/背景全部正常，但所有文字（标题、KPI 数字、标签名）一个都不显示。模板 `{{ layer.source.content }}` 渲染空字符串。

**根因**：`extract-all-elements.mjs` 生成 `_layer_stack.json` 时，文字层 `source` 只写入类型标记：
```json
{ "kind": "live-text-static" }
```
`content`、`fontFamily`、`fontSize`、`color`、`fills`、`shadows`、`css` 等完整属性**全部留在 `_all_elements.json`**，layer_stack 本身不冗余存储文字数据。

**铁律**：§3.9 layer_stack 切片拼接方案实现 `renderLayers` 时，对每个 `live-text-static` / `live-text-dynamic` 层，**必须**先调用 `enrichTextSource(layer)` 将完整样式从 `_all_elements.json` 按 `layer.id` 查找补全：

```javascript
import allElementsModule from './data/_all_elements.json'

const ELEMENT_BY_ID = Object.create(null)
;(allElementsModule.elements || []).forEach((el) => {
  if (el && el.id) ELEMENT_BY_ID[el.id] = el
})

function enrichTextSource(layer) {
  const src = { ...(layer.source || {}) }
  const el = ELEMENT_BY_ID[layer.id]
  if (el) {
    if (src.content == null || src.content === '') src.content = el.content ?? layer.name
    if (!src.fontFamily && el.fontFamily) src.fontFamily = el.fontFamily
    if (src.fontSize == null && el.fontSize != null) src.fontSize = el.fontSize
    if (src.fontWeight == null && el.fontWeight != null) src.fontWeight = el.fontWeight
    if (!src.color && el.color) src.color = el.color
    if (src.letterSpacing == null && el.letterSpacing != null) src.letterSpacing = el.letterSpacing
    if (src.lineHeight == null && el.lineHeight != null) src.lineHeight = el.lineHeight
    if (!src.textAlign && el.textAlign) src.textAlign = el.textAlign
    if ((!src.fills || !src.fills.length) && el.fills?.length) src.fills = el.fills
    if ((!src.shadows || !src.shadows.length) && el.shadows?.length) src.shadows = el.shadows
    if ((!src.css || !src.css.length) && el.css?.length) src.css = el.css
  } else if (src.content == null || src.content === '') {
    src.content = layer.name  // 兜底：用图层名
  }
  return src
}

// 在 renderLayers computed 内，处理文字层时：
if (kind === 'live-text-static' || kind === 'live-text-dynamic') {
  shifted.source = enrichTextSource(shifted)
}
```

**快速自检**（开始写页面代码前先跑）：
```bash
node -e "
const ls=require('./data/_layer_stack.json');
const ae=require('./data/_all_elements.json');
const byId={}; (ae.elements||[]).forEach(e=>byId[e.id]=e);
let text=0, noContent=0, enrichable=0;
ls.layers.forEach(l=>{
  const k=l.source&&l.source.kind;
  if(k!=='live-text-static'&&k!=='live-text-dynamic') return;
  text++;
  if(!l.source.content) noContent++;
  if(byId[l.id]&&byId[l.id].content) enrichable++;
});
console.log({text,noContent,enrichable});
"
# noContent===enrichable 且均等于 text → 确认需要补全，按本规则处理
```

---

### 规则 53：`duplicateTextGroups.dropId` 必须在进入渲染循环前直接剔除——不能只靠 dedupe 逻辑兜底

**症状**：数字和单位重叠（如 `86户` 与 `86`/`户` 三层叠在一起）；KPI 数字与单位文字视觉粘连模糊。

**根因**：`_render_gaps_report.json` 的 `duplicateTextGroups` 已精确标记 composite 与 fragment 的 keep/drop 关系，但：
1. 旧 `dedupeTextLayers()` 在所有层进入 computed 后才做字符串长度排序去重
2. fragment 层（如单独的 `户`/`tCO2e`/`86`）有时与 composite 层内容不存在包含关系（同坐标但字符串不 includes），dedupe 无法命中 → fragment 残留叠在 composite 上

**铁律**：
1. 必须先构建 `DROP_TEXT_IDS` Set，**在 `for (const l of raw)` 循环入口处直接 `continue`**，不依赖后置 dedupe：
```javascript
const DROP_TEXT_IDS = new Set(
  (gapsReport.duplicateTextGroups || []).map((g) => g.dropId).filter(Boolean)
)

// renderLayers computed 内：
for (const l of raw) {
  if (DROP_TEXT_IDS.has(l.id)) continue  // ← 入口处剔除，最优先
  if (FAKE_BAR_IDS.has(l.id)) continue
  // ...
}
```

2. `dedupeTextLayers()` 作为**第二道防线**保留，但去重条件要收紧——同坐标格去重仅在 composite ⊃ fragment 包含关系时生效，避免误删合法相邻文字：
```javascript
function dedupeTextLayers(textLayers) {
  const filtered = textLayers.filter((t) => !DROP_TEXT_IDS.has(t.id))
  const sorted = [...filtered].sort((a, b) =>
    String(b.source.content || '').length - String(a.source.content || '').length
  )
  const kept = []
  sorted.forEach((t) => {
    const tc = String(t.source.content || '')
    const dup = kept.some((k) => {
      const kc = String(k.source.content || '')
      if (!tc || !kc) return false
      // 同坐标：仅在有包含关系时去重
      const sameCell = Math.abs(k.rect.y - t.rect.y) <= 2 && Math.abs(k.rect.x - t.rect.x) <= 2
      if (sameCell && (kc.includes(tc) || tc.includes(kc))) return true
      // 同行横向重叠 + composite ⊃ fragment（如 1200tCO2e 与 tCO2e）
      if (Math.abs(k.rect.y - t.rect.y) > 2) return false
      if (kc.length <= tc.length || !kc.includes(tc)) return false
      const a = k.rect, b = t.rect
      return !(a.x + a.w < b.x || b.x + b.w < a.x)
    })
    if (!dup) kept.push(t)
  })
  return kept
}
```

**旧写法负优化警告**：`Math.round(k.rect.y / 2) === Math.round(t.rect.y / 2)` — 这个除以 2 的量化会把 y 差值 ≤ 3px 的**不同行**文字误判为同格，导致合法相邻文字（如 `89.2` 与上方标签）被错误去重。

---

### 规则 54：设计稿数字字体 `DIN Alternate` 必须精确入库——禁止用 D-DIN-PRO 等近似字体替代

**症状**：`2004` 与 `户`、`89.2` 与 `%` 之间设计稿间距约 6px，实际渲染数字向右溢出数像素压住单位字符。`overflow: hidden` 的容器甚至直接裁掉单位。

**两个叠加根因**：

1. **字体宽度溢出**：设计稿用 `DIN Alternate`（窄体等宽数字），未打包时回退到更宽的 `sans-serif`，数字渲染宽度超出设计值，压住紧随其后的单位层。
   - **必须**将 `DIN Alternate` 字体文件入库，`@font-face { font-family: "DIN Alternate"; }`
   - **过渡阶段**：`pending_acquire` 时可暂用 `'D-DIN-PRO', 'Arial Narrow', sans-serif`（见 `_font_map.json` substituteStack），**并提示用户**获取真字体
   - **必须**在 `resolveFontFamily()` 中：bundled → 单族名；pending → substituteStack

```javascript
// ✅ 精确族名，无 fallback stack
function resolveFontFamily(family, cssRules) {
  const cssText = (cssRules || []).join(' ')
  if (/DINAlternate|DIN Alternate/i.test(`${family} ${cssText}`)) return "'DIN Alternate'"
  // ... 读 _font_map.json cssAliasToFamily
  if (family) return `'${String(family).replace(/['"]/g, '')}'`
  return "'PingFang SC'"
}
```

2. **容器 `overflow: hidden` 裁切文字**：`board-scaled` 设为 `overflow: hidden`，而文字层因字体宽度或 letterSpacing 略微溢出 `rect.w` 时被截断（单位字符消失）。
   - **大屏/驾驶舱页面**，文字层坐标由设计稿精确给出，绝对定位不存在布局溢出问题
   - `board-scaled`、`board` 以及 span 均应设 `overflow: visible`：

```css
.d2v-board-scaled { overflow: visible; }  /* 不是 hidden */
.d2v-board { overflow: visible; }
.d2v-board :deep(span) {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;  /* 防换行破坏单行 KPI */
}
```

**附加**：文字 inline style 的 `font-family`/`font-size`/`font-weight`/`text-align` 须加 `!important`，防止项目 `global.less` 的 `* { font-family: ...; font-size: ... }` 全局样式覆盖。

---

### 规则 55：`@/components/Echarts` 可能不存在——使用前必须先 `Glob` 确认，不存在则用原生 `echarts.init()` 方案

**症状**：webpack 编译报 `Can't resolve '@/components/Echarts'`，页面无法加载。

**根因**：skill 文档中的 `vue2-runtime.md` 描述的 `Echarts.vue` 封装组件是**部分项目**才有的（如 datav-dashboard 示例），不是 Vue 2 框架的标准组件。许多项目直接使用 `import * as echarts from 'echarts'` 而没有封装组件。

**铁律**：
1. 使用 ECharts 前先 `Glob "src/**/Echarts.vue"` 检查封装组件是否存在
2. 存在 → 按 `vue2-runtime.md` 的 Echarts 组件方式使用
3. 不存在 → 用原生方案（`echarts.init(dom)` + `charts{}` 字典管理实例）：

```javascript
import * as echarts from 'echarts'

// data: charts: {}

// template: <div :ref="'chartDom-' + zone.id" class="chart-dom" />

// methods:
initCharts(retries = 25) {
  let pending = false
  this.chartZoneViews.forEach((zone) => {
    const dom = this.getChartDom(zone.id)
    if (!dom || dom.clientWidth < 4 || dom.clientHeight < 4) { pending = true; return }
    if (!this.charts[zone.id]) {
      try { this.charts[zone.id] = echarts.init(dom) } catch (e) { return }
    }
    try { this.charts[zone.id].setOption(zone.option, true) } catch (e) {}
  })
  if (pending && retries > 0) setTimeout(() => this.initCharts(retries - 1), 80)
},
resizeCharts() {
  Object.values(this.charts).forEach((c) => { try { c.resize() } catch (e) {} })
},
disposeCharts() {
  Object.values(this.charts).forEach((c) => { try { c.dispose() } catch (e) {} })
  this.charts = {}
},

// mounted: this.$nextTick(() => { this.updateViewport(); this.initCharts() })
// beforeDestroy: this.disposeCharts()
// updateViewport 末尾: this.$nextTick(() => this.resizeCharts())
```

**注意**：`vue2-runtime.md` 的 `@/components/Echarts` 描述是 **示例项目的特定封装**，不是通用 API。跨项目移植 skill 产出的 Vue 文件时，图表组件的引用路径是**第一个应检查的编译错误来源**。

---

### 规则 56：切图目录必须对齐目标项目的 devServer static 根——禁止默认写 `public/static/`

**症状**：页面结构/文字正常，**所有 `<img>` 切图全部 broken**（小图裂图标）。`getLayerAssetUrl()` 逻辑正确，basename 提取正确，但 HTTP 404。

**根因**：不同前端项目的 `/static/*` 映射根目录不同：
| 项目类型 | dev 静态根 | 正确放置路径 |
|---------|-----------|-------------|
| **Muse CLI 类** | `{projectRoot}/static/`（见 `@muse/project/env.js` → `staticPath`；`webpack.dev.js` → `devServer.static.directory`） | `static/<模块名>/design-assets/` |
| **Vite / Next 等** | 常为 `public/` | `public/static/...` 或 `public/...` |

误把切图复制到 `public/static/` 而 devServer 读的是 `static/` → 404。**这是路径问题，不是 encodeURIComponent 或 basename 问题。**

**铁律（Step 0-A6 门禁，写 Index.vue 前必做）**：
1. Read 目标项目的 webpack/vite 配置，找到 `devServer.static.directory` 或等价项
2. 切图复制到 `{staticRoot}/<模块名>/design-assets/`
3. **复制后立即 HTTP 探针**（禁止只靠肉眼）：
```bash
# 任取一张切图 basename，替换 <encoded>
curl -sI "http://localhost:<port>/static/<模块>/design-assets/<encoded>.png" | head -1
# 必须 HTTP/1.1 200；404 = 目录仍错
```
4. 页面内 URL 仍用 `resolveStaticPublicUrl('/static/...')`——它只处理 publicPath 前缀，**不**改变 static 根目录

**负优化警告**：不要在 404 时改 `getLayerAssetUrl` 去拼绝对 Windows 路径（`D:\docs\...`）或猜 `public/` 前缀——根因是物理目录与 devServer 不一致。

---

### 规则 57：文字颜色优先级——`fills` 渐变/实色 > 非占位 `css.color` > `color` 字段；`#707070`/`#979797` 是占位色

**症状**：文字位置对，但**颜色/渐变与设计稿不一致**——标签发灰（`#707070`）、KPI 数字不够亮、中心浮动标签缺少 cyan 渐变。

**根因**：
1. MeaXure 导出的 `css[].color` 常含 **占位灰**（`#707070`、`#979797`），真实视觉色在 `fills`（渐变 `gradientStops` 或 solid）
2. 消费端先写 `style.color = s.color` 再 `applyTextCssRules`，或 gradient 与 css color 顺序错误 → 占位色覆盖渐变
3. `Yuanti SC` / `STYuanti-SC-Bold` 等字体未打包，回退后颜色对了但字重仍偏

**铁律（Implement 层 `resolveTextFillStyle` 顺序）**：
```
1. fills 含 gradient（≥2 stops）→ background-clip:text 渐变
2. fills 含 solid color           → 用 solid.color
3. css.color 且非占位色           → 用 css.color
4. element.color 字段             → 兜底
5. rgba(255,255,255,0.92)         → 最终兜底
```

占位色判定：`#707070` / `#979797`（可扩展，**不要**把 `#FFFFFF` 当占位——KPI 数字就是白色）

**Typography 还需**：
- `css` 权威：`font-size` / `letter-spacing` / `line-height` / `text-shadow` / `font-weight` 从 `css[]` 读取
- `font-family` 走 `resolveFontFamily()` → `_font_map.json` 精确族名（见规则 58、59）
- `DINAlternate-Bold` / `STYuanti-SC-Bold` → 推断 `font-weight: 700`
- 全局 `* { font-family; font-size }` 项目：`font-family` / `font-size` / `color` / `letter-spacing` / `line-height` / `text-shadow` / `font-weight` 均加 `!important`

---

### 规则 58：Step 0-A 必须生成 `_font_map.json`——bundled 精确族名，pending 暂用替代并提示用户

**症状**：数字字体偏细/偏宽、标题字体不对——**位置对但 typography 不像设计稿**；或缺字体时页面全回退系统宋体且用户不知情。

**铁律**：
1. Step 0-B 后运行 `scripts/audit-project-fonts.mjs`（见 `references/font-bundling.md`）
2. `_font_map.json`：`cssAliasToFamily` + `families`（含 `status`、`substituteStack`、`acquireVia`）
3. `status === 'bundled'` → `resolveFontFamily()` 只返回 `'${canonicalFamily}'`
4. `status === 'pending_acquire'` → 返回 `substituteStack`（**必须**来自项目已打包字体）
5. **必须向用户输出**待入库清单与获取方式（`_font_acquire.json` 的 `userPrompt` / `summaryForUser`）
6. **禁止**静默回退：不记录、不提示的凑合视为缺陷

**负优化警告**：不要对所有文字统一设 `color: white` / `font-size: 14px`「修对齐」。

---

### 规则 59：字体文件只在指定范围内查找——范围外禁止盲搜，缺失则互联网合法获取

**症状**：Agent 递归搜索 `D:\docs`、`C:\Windows\Fonts` 数小时仍找不到字体，或找到近似字体后视觉仍不对。

**允许搜索范围（仅此四处）**：
1. `{projectRoot}/src/assets/font/`
2. `{exportDir}/fonts/` 或 `{exportDir}/assets/fonts/`
3. `{pageOutDir}/../fonts/`（页面私有）
4. `global.less` / `fonts.less` 中 `@font-face src:` 已声明路径

**禁止**：Windows Fonts、全盘 `*.ttf` 搜索、递归设计归档根目录、**不记录不提示**的静默替代。

**允许**：`pending_acquire` 时用 `_font_map.json` 的 `substituteStack` 暂代，**并**向用户输出 `acquireVia`（见 `font-bundling.md` §5）。

**范围内未命中** → 互联网/npm 获取 → 仍无法获取则 **`pending_acquire` + `substituteStack` + 向用户提示 `acquireVia`**（见 `font-bundling.md` §3、§5）。**不要**扩大搜索范围；**不要**不提示就暂用替代。

---

### 规则 60：有 fills/css 的 shape 必须走 vector-css——禁止误标 report-to-designer

**症状**：table 行 `background: rgba(13,69,126,0.30);` 高 28px 不显示；分隔线 `border: 0.9px solid` 丢失。

**根因（双重负优化）**：
1. **`rectContains` 过度「烤入切片」**：父级 exportable 组切片 bbox 包含子 shape → 一律从 layer_stack 剔除，但组切片 PNG **不含**子层 CSS（如 table 行底色）
2. **render plan 一刀切**：凡无 exportable 的 shape → `report-to-designer`，未调用 `disposition.hasRenderableStyle()`

**正优化（`extract-all-elements.mjs` + `disposition.mjs`）**：
```javascript
// 有可渲染样式 → 必须 standalone + vector-css，即使落在组切片 bbox 内
const standaloneShapes = shapeEls.filter(sh =>
  hasRenderableStyle(sh) || !sliceEls.some(sl => rectContains(sl.rect, sh.rect)));

// render plan：hasRenderableStyle → vector-css；仅 ghost 位图 → report-to-designer
```

**Implement 兜底**：layer_stack 遗漏时从 `_all_elements` 补 `supplemental-vector`（同 `hasRenderableStyle` 判据）。

**自检**：重跑 extract 后 `report-to-designer` 中**不得**含 `hasRenderableStyle===true` 的 shape（`test-vector-css-disposition.mjs`）。

---

### 规则 61：切片须 enrichSliceSource + object-fit contain——禁止裸 `<img>` fill 拉伸

**症状**：三库两模型 3D 图标（`编组 8`）被压扁、缺 `box-shadow`；PNG 91×92 塞进 rect 55×52 变形。

**根因**：
1. `layer_stack` 的 `slice-file` 未带 `css[]`（仅 file 路径）
2. 切片样式分支漏消费 `box-shadow` / `filter`
3. `<img>` 默认 `object-fit: fill` + PNG 像素尺寸 ≠ rect（规则 45）

**正优化**：extract 写入 `css` + `_slice_scale_audit.json`；Implement 用 `enrichSliceSource` + `applySliceDecorCss`（剔除 transform）+ 默认 `contain` + `slice-fit.json`；跑 `audit-asset-consumption.mjs`。

---

### 规则 62：对称 KPI 须「参考行替换」——非单纯 dy 镜像、非漏层补洞

**症状**：
- 存量/增量「指标率」卡片 Sketch 一致，页面上一侧正常、一侧背景/icon 异常（方框 icon、灰角标、缺辉光）
- 或「修增量」后**错误区块**出现多余卡片（如模块C表格上浮动指标率）

**根因（三类，须分诊）**：

| 类型 | 特征 | 本案例 |
|------|------|--------|
| **A. 漏导** | 目标 y 区 0 个 168×83 卡片 | ❌ panel11 @543 有层 |
| **B. 处置不一致** | 同视觉组件 export 为不同 disposition（slice vs vector-css） | ✅ panel12=`矩形背景2+编组40` slice；panel11=`矩形备份5`+isometric 矢量 |
| **C. dy 锚点错** | clone 落点跨业务 panel | ✅ 误把 543+282→825 落入 panel10 模块C区 |

**Extract / Plan**：
```bash
node <skill>/scripts/detect-symmetric-module-gaps.mjs <outDir>/_all_elements.json
# 产出 dispositionMismatches + gaps；见 references/symmetric-kpi-override.md
```

**Implement 正优化（B 类，已验证）**：
1. 锁定**视觉正确参考行**（常为含 `矩形背景 2` + `编组 40` slice 的行，非 `矩形备份 5` 矢量栈）
2. `data/_symmetric_module_clones.json`：
   - `excludeNativeIds`：隐藏目标行错误原生层（底框、isometric 矢量、路径角标、同位文案）
   - `specs[].dy` = **参考行.y − 目标参考行.y**（panel12→panel11 常为 **282**，不是 panel11→panel10）
   - `zOverrideBySourceId`：clone 切片 z 对齐被替换原生层（例 241/246/244）
3. `renderLayers` 过滤 `excludeNativeIds`；clone 层 concat 进 stack
4. `enrichTextSource` / `enrichSliceSource`：**最长 idSuffix 优先**回查源 id

**禁止**：
- 用 `矩形备份 5` 矢量栈 clone 到「应对齐 slice 行」的槽位
- 带入 `kpi-icon-backup`（x≈2153，盒状 icon）
- 无 panel 校验地 `KPI.y + panelPitch` 落到下一业务区块
- 纯色 div 模拟卡片

**案例文档**：`references/symmetric-kpi-override.md`

---

### 规则 63：`icon/`、`pic/` 子目录必须在 URL 中保留——禁止 basename-only

**症状**：页面文字/布局正常，**大量小图标 broken**（浏览器裂图）；`static/.../design-assets/icon/foo.png` 物理存在且 curl 200，但页面请求 `.../design-assets/foo.png` → 404。

**根因（双杀）**：
1. `assetUrl()` 只取 `path.basename()`，丢弃 `icon/`、`pic/` 前缀
2. `relativeAssetPath()` 二次调用：已相对路径 `icon/xxx.png` 无 `/assets/` 段时又被退化成 basename

**铁律（Implement 层 `layerUrl.js`）**：
```javascript
function relativeAssetPath(filePath) {
  const raw = String(filePath || '').replace(/\\/g, '/').trim()
  if (!raw) return ''
  if (raw.includes('/assets/')) return raw.slice(raw.indexOf('/assets/') + 8)
  return raw.replace(/^\/+/, '')  // 已是 icon/xxx.png 则原样保留
}
function getLayerPublicPath(filePath) {
  const rel = relativeAssetPath(filePath)
  const encoded = rel.split('/').map(encodeURIComponent).join('/')
  return resolveStaticPublicUrl(`${STATIC_BASE}/${encoded}`)
}
```

**消费侧**：
- `buildBoardRenderPlan` 切片：`src: getLayerPublicPath(src.file)` — **禁止**先 `relativeAssetPath` 再传入
- overlay：`file` 字段写 `icon/<slice-basename>.png`（相对 deployed static 根，**含子目录**）

**自检**：
```bash
curl -sI "http://localhost:<port>/static/<module>/design-assets/icon/<encoded>.png" | head -1  # 200
curl -sI "http://localhost:<port>/static/<module>/design-assets/<encoded>.png" | head -1       # 404（无子目录时）
```

**标准实现**：`templates/shared/layerUrl.mjs`

---

### 规则 64：全屏背景（BG备份）不得映射为小 ghost 的 icon overlay

**症状**：中心/侧边出现**大块黑/白矩形**或整屏背景被缩进小图标位；修复路径后仍有个别区域异常。

**根因**：`gen-icon-gap-candidates` 在 score=0 时以 `rect-nearest` 兜底，常把 `BG备份.png` 推荐给小 ghost；写入 `_icon_gap_overlays.json` 后在小 rect 上 `object-fit: contain/fill` 渲染整屏背景。

**铁律**：
1. `gen-icon-gap-candidates.mjs`：ghost 面积 < 画板 35% 时，候选列表**排除** `BG备份.png` 等 backdrop
2. `gen-icon-overlays.mjs`：二次过滤 + 邻近文本匹配 `icon/` 文件名
3. `BG备份.png` 只作 `.dcm-board { background-image }`，不进 overlay items

**禁止**：把 `recommended.file === 'BG备份.png' && score === 0` 批量写入 overlays。

---

### 规则 65：图标缺口两阶段流水线——candidates → overlays，禁止跳步

**症状**：手写 `_icon_gap_overlays.json` 漏项、elementId 拼错、或 64 条全映射 BG 导致更糟。

**标准流水线（§3.9）**：
```bash
# 1) 候选（设计稿 assetsDir，含 icon/ 子目录扫描）
node <skill>/scripts/gen-icon-gap-candidates.mjs <outDir> <designAssetsDir>

# 2) 落盘映射（已部署 static 目录，保留相对路径）
node <skill>/scripts/gen-icon-overlays.mjs <outDir> <projectStatic/design-assets> [boardW] [boardH]

# 3) 人工：仅处理 overlays 未覆盖的 unresolved + needs-review
```

**产出字段**：`items[].file` 必须是相对 `design-assets/` 的路径（如 `icon/feature-a.png`），与 `layerUrl.relativeAssetPath` 输出一致。

**验证**：跑 `test-gen-icon-overlays.mjs`；交付前对真实 `outDir` 跑两阶段脚本，人工仅核对 `unresolved`。

---

### 规则 67：图表区必须用 gen-chart-zones.mjs 生成 chartZones.json——禁止手填单列假柱 rect

**症状**：Sketch 原图表位置出现黑块/空白；或 ECharts 只覆盖 115×184 窄条，分组柱图其余区域无渲染；假柱已从 stack 排除但无 ECharts 接管。

**根因**：
1. 未跑 `gen-chart-zones.mjs`，`chartZones.json` 只有手工写的 per-column zone（每个假柱一 zone）
2. `monitorBoardRender` 未消费 `excludeLayerIds`，只靠 `isFakeBarLayer` 全局剔除 → 网格线/折线节点仍渲染或误删
3. 无 `chartPanels.json` 标题锚定 → 折线/雷达/面积图面板（无 fakeBarShapes）无 ECharts zone（规则 35）

**机械流程**：
```bash
# 1. 编写 chartPanels.json（面板标题 + left/width/chartType）
# 2. 生成 chartZones.json（假柱聚类 bbox + excludeLayerIds）
node <skill>/scripts/gen-chart-zones.mjs <dataDir> --panels chartPanels.json --out chartZones.json
# 3. chartOptions.js 按 zone.chartType dispatch（bar/groupBar/line/radar）
# 4. buildBoardRenderPlan 消费 excludeLayerIds + KEEP_IN_ZONE_RE（规则 33）
```

**分组柱合并**：同 y 带 ≥12 根假柱且 x 跨度 >400px → 单 `groupBar` zone，禁止拆成 N 个单列 zone。

---

### 规则 66：parseCssArray 必须剥离 MeaXure css 行尾分号——否则全部 vector 背景失效

**症状**：`形状结合` 等 vector-css 层数据完整（含 `background-image: linear-gradient(...)`），render plan 也有该层，但页面上**所有面板渐变背景消失**。

**根因**：MeaXure 导出的 css 行格式为 `"opacity: 0.63;"`、`"background-image: linear-gradient(...);"`——`parseCssArray` 若把尾部分号写入 Vue inline style：
```js
backgroundImage: 'linear-gradient(...);'  // ⛔ 非法，浏览器整项忽略
opacity: '0.63;'                          // ⛔ 非法
```

**铁律**：
```js
let val = m[2].trim().replace(/;\s*$/, '').replace(/\bNaNpx\b/g, '0')
```

**标准实现**：`templates/shared/vectorStyle.mjs` 的 `parseCssArray` + `buildVectorStyle`（含规则 47 渐变描边 `synthBorderFromAttrs`）。

---

### 规则 68：Sketch 裁剪蒙版层（蒙版 + #FFFFFF fill）必须从渲染计划中完全过滤

**症状**：面板标题区出现白色横条矩形覆盖在标题文字/渐变背景上；调整 chart zone 边界后白色矩形突然出现。

**根因**：  
Sketch 的裁剪蒙版（Clip Mask）在 MeaXure 导出后变成 `source.kind === 'vector-css'`，CSS 为 `background: #FFFFFF`（白色实色填充），用于定义哪些区域可见，**本身不是可见元素**。  
在旧 zone 边界下这些层被 chart zone 误排除，边界缩小后暴露出来渲染成白色矩形。

**识别特征**（三个条件同时满足才是 Clip Mask）：
1. 层名以 `蒙版` 开头
2. `source.kind === 'vector-css'`
3. CSS 包含 `background: #FFFFFF` 或 `background: rgba(255, 255, 255, 1)`

**机械修复**（在 `buildBoardRenderPlan` 主循环最早处添加）：
```javascript
/** Sketch 裁剪蒙版：纯白填充 vector-css，不渲染为可见元素 */
function isSketchClipMask(layer) {
  if (!layer.name || !/^蒙版/.test(layer.name)) return false
  if (layer.source?.kind !== 'vector-css') return false
  const css = (layer.source?.css || []).join(' ')
  return /background\s*:\s*#[Ff]{3,6}\b|background\s*:\s*rgba?\(\s*255[\s,]/.test(css)
}

// 在主循环中（degenerate 检查之后）：
if (isSketchClipMask(layer)) return  // 跳过 Sketch clip mask
```

**验证**：运行诊断脚本确认数量匹配（面板数 × panel 数 ≈ 5-8 个）：
```javascript
const masks = ls.layers.filter(l =>
  /^蒙版/.test(l.name || '') &&
  l.source?.kind === 'vector-css' &&
  /background\s*:\s*#[Ff]{3,6}\b/.test((l.source?.css || []).join(' '))
)
console.log('Clip masks to exclude:', masks.length)
```

**注意**：其他名称含"蒙版"但有蓝色渐变的层（如光效蒙版）不受影响，因为它们的 CSS 不含白色背景。

---

### 规则 69：chart zone 边界不能覆盖相邻静态区域（表格 / icon 卡片 / KPI 行）

**症状**：面板内的静态数据表格、icon 卡片、KPI 指标行等内容变空白；区域整体消失但面板背景还在。

**根因**：`chartPanels.json` 的 `width` 或 `zoneHeight` 过大，将紧邻图表的静态内容区也纳入 chart zone，导致该区域所有切片/文字被 `excludeLayerIds` 排除，但 ECharts 又没有覆盖到这部分。

**机械决策（写 chartPanels.json 时）**：
```
① 打开设计稿截图，目测图表绘制区的右边界 x_right 和下边界 y_bottom
② 如果右侧或下方紧邻静态内容（数据表格/icon 卡片/文字列表），zone 宽/高 必须止步于静态内容起始位置
③ 切记：一个面板可能包含「折线图（ECharts）+ 数据表格（静态）」两个子区域 → 只为折线图部分建 zone
```

**高风险场景一览**：

| 设计稿模式 | 错误做法 | 正确做法 |
|---|---|---|
| 同面板左半是图表、右半是静态数据表格 | `width` 覆盖全宽 | `width` 止步于表格左边界 |
| 同面板上部是分组柱图、下部是 icon+数字 KPI 卡片 | 一个 zone 覆盖全高 | 建单 zone 仅覆盖柱图，卡片区不建 zone |
| 面板底部有 KPI 数字行（无坐标轴） | 把 KPI 行高度算入 `zoneHeight` | `zoneHeight` 截止在 KPI 行开始前 |

**检查脚本（写完 chartPanels.json 后必须运行）**：
```javascript
// 验证每个 zone 没有意外包含静态 slice-file 层
const cz = require('./data/chartZones.json')
const ls = require('./data/_layer_stack.json')
cz.zones.forEach(z => {
  const r = z.rect
  const covered = ls.layers.filter(l => {
    const lr = l.rect
    const cx = lr.x + lr.w / 2, cy = lr.y + lr.h / 2
    return l.source?.kind === 'slice-file' &&
      cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
  })
  if (covered.length > 0) {
    console.warn(`zone ${z.id} 覆盖了 ${covered.length} 个静态切片:`, covered.map(l => l.name))
  }
})
```

---

### 规则 70：跨画板资产（artboard1）必须检查并手动合入主渲染层

**症状**：大屏装饰性边框/背景图片不显示，但文件确实存在于 static 目录；检查 `_layer_stack.json` 找不到对应层。

**根因**：某些设计资产（如全屏边框、overlay 装饰图）在 Sketch 中属于**另一个画板**（artboard1），MeaXure 生成的 `data/artboard1/scene-graph.json` 有这些层，但**主渲染用的 `_layer_stack.json` 来自主画板**，不包含这些资产。

**必须执行的检查步骤**：
```bash
# 1. 检查 artboard1 是否存在
ls data/artboard1/

# 2. 找出 artboard1 中的 slice 节点（这些需要手动合入）
node -e "
const sg = require('./data/artboard1/scene-graph.json')
const slices = sg.nodes.filter(n => n.type === 'slice')
slices.forEach(n => console.log(n.name, n.rect, n.attrs?.css))
"

# 3. 复制资产文件到 static 目录
cp <designAssetsDir>/overlay-a.png  static/design-assets/
```

**手动合入方法**（在 Index.vue 模板最顶部，主 renderLayers 循环之前）：
```html
<!-- artboard1 跨画板资产：手动合入，坐标取自 artboard1/scene-graph.json 的 rect 字段 -->
<img
  v-for="extra in extraArtboardLayers"
  :key="extra.name"
  class="d2v-layer d2v-layer-slice"
  :src="extra.src"
  :alt="extra.name"
  draggable="false"
  :style="extra.style"
/>
```

```javascript
// 在 data() 或 computed 中硬编码跨画板层（坐标来自 artboard1/scene-graph.json）
extraArtboardLayers: [
  {
    name: 'overlay-left',
    src: getAssetPath('overlay-left.png'),
    style: 'position:absolute; left:Xpx; top:Ypx; width:Wpx; height:Hpx; z-index:900; transform:scaleX(-1);'
    // transform 来自 artboard1 节点的 attrs.css
  },
  {
    name: 'overlay-right',
    src: getAssetPath('overlay-right.png'),
    style: 'position:absolute; left:Xpx; top:Ypx; width:Wpx; height:Hpx; z-index:900;'
  },
]
```

**注意**：
- 坐标（left/top/width/height）来自 `artboard1/scene-graph.json` 的 `rect` 字段，不能猜
- `attrs.css` 中若有 `transform: scaleX(-1)` 等变换，必须保留
- 文件名含中文/空格时必须 URL 编码（规则 1）

---

### 规则 71：KEEP_IN_ZONE_RE 白名单必须先于 excludeLayerIds 检查——否则白名单失效

**症状**：雷达图静态切片、面板边框（框框）等明确在 KEEP_IN_ZONE_RE 白名单中的层仍然被排除；调试发现这些层的 id 在 `chartExcludeIds` 中。

**根因**：`shouldExcludeFromChartZone` 先检查 `excludeLayerIds`，后检查白名单 → 白名单规则形同虚设。

**错误代码（❌）**：
```javascript
function shouldExcludeFromChartZone(layer, zones, chartExcludeIds) {
  if (chartExcludeIds.has(layer.id)) return true  // ❌ 先检查 excludeIds
  if (KEEP_IN_ZONE_RE.test(layer.name || '')) return false
  return overlapsChartZone(layer.rect, zones)
}
```

**正确代码（✅）**：
```javascript
function shouldExcludeFromChartZone(layer, zones, chartExcludeIds) {
  if (KEEP_IN_ZONE_RE.test(layer.name || '')) return false  // ✅ 白名单最优先
  if (chartExcludeIds.has(layer.id)) return true
  return overlapsChartZone(layer.rect, zones)
}
```

**铁律**：白名单（KEEP_IN_ZONE_RE）= 绝对不排除，优先级高于一切。`gen-chart-zones.mjs` 生成 `excludeLayerIds` 时已过滤白名单，但 `buildBoardRenderPlan` 消费时必须再次保证顺序。

---

### 规则 72：大屏 transform:scale 模式下 ECharts 必须用 init({width,height})，禁止 resize()

**症状**：ECharts 图表区出现空白或渲染错位；调整浏览器窗口时图表位置偏移。

**根因**：  
大屏用 CSS `transform: scale(s)` 整体缩放，ECharts 的 DOM 尺寸在画板坐标系中是固定的（如 780×340px）。若让 ECharts 自动测量 DOM 尺寸（默认行为），scale 后的视觉尺寸与画板坐标尺寸不一致，导致图表错位。`chart.resize()` 会触发 ECharts 重新测量，反而把尺寸搞错。

**正确初始化模式**：
```javascript
initChartZones() {
  this.chartZones.forEach((zone) => {
    const refKey = `chart-${zone.id}`
    const dom = this.$refs[refKey]
    const el = Array.isArray(dom) ? dom[0] : dom
    if (!el) return

    // 明确传入画板坐标尺寸（不让 ECharts 自测 DOM）
    const r = zone.rect
    el.style.width = r.w + 'px'
    el.style.height = r.h + 'px'
    const chart = echarts.init(el, null, { width: r.w, height: r.h })
    const option = this.chartOptionsMap[zone.id]
    if (option) chart.setOption(option, true)
    this.chartInstances[zone.id] = chart
  })
},

resizeCharts() {
  // transform:scale 大屏：CSS 整体缩放，ECharts 无需 resize
  // 不调用 chart.resize()
},
```

**类比**：就像 Retina 屏幕下用 `canvas.width = 2×` 一样——坐标系固定，缩放交给外层 CSS。

---

### 规则 73：图表类型识别决策矩阵——从设计稿截图到 chartType 的机械推断

**症状**：ECharts 图表与设计稿严重不符（柱图渲染成折线、多系列渲染成单系列、静态卡片被 ECharts 覆盖）。

**决策矩阵**（按优先级逐项检查）：

| 设计稿视觉特征 | chartType | 备注 |
|---|---|---|
| 同一 x 位置有 2-5 根颜色不同的柱子 | `groupBar` | 多系列分组柱 |
| 每个 x 位置只有 1 根柱子（含渐变） | `bar` | 单系列柱图 |
| 平滑曲线 + 半透明填充区域 | `area` | 面积图 |
| 多条不同颜色折线（无面积填充） | `multiLine` | 多系列折线 |
| 两条折线（实际 + 预测/目标） | `dualLine` | 双系列折线，配色差异化 |
| 左侧圆形轴 + 多边形数据区域 | `radar` | 雷达图（多为静态切片，慎建 zone） |
| 带节点和流向箭头/曲线的流图 | `sankey` | 桑基图/能量流向图 |
| 圆形/扇形区域 | `pie` | 饼图 |
| 图标 + 数字卡片（无坐标轴）| **不建 zone** | 静态 KPI 卡片，不是 ECharts |
| 表格行列（文字对齐排列）| **不建 zone** | 静态数据表，不是 ECharts |

**高频误判场景（通用模式，不含具体业务名）**：
- 看起来像多根柱子的图 → 先数每个 x 位置有几根：≥2 根不同色 = `groupBar`，1 根 = `bar`
- 平滑曲线有颜色面积填充 = `area`；无填充的线 = `line`/`multiLine`
- 节点+流向曲线连接 = `sankey`（能量流/资金流/物料流通用）
- 两条颜色明显不同的折线（一条实线/一条虚线或更亮） = `dualLine`
- 只有 icon 图标 + 数字、没有坐标轴 = **不建 zone**，这是静态 KPI 卡片
- 文字整齐排列成行列 = **不建 zone**，这是静态数据表格

**chartOptions.js 推荐模式**（按 zone.id 精确分发，避免 chartType 字符串歧义）：
```javascript
// 按 zone.id 精确分发（优先）
const ID_DISPATCH = {
  'chart-panel-a': groupBarOption,    // 设计稿视觉：多色分组柱
  'chart-panel-b': multiLineOption,   // 设计稿视觉：多系列折线
  'chart-panel-c': sankeyOption,      // 设计稿视觉：流向图
  'chart-panel-d': dualLineOption,    // 设计稿视觉：实际+预测双折线
}

// chartType 字符串兜底（zone.id 未命中时）
const TYPE_DISPATCH = {
  groupBar:  groupBarOption,
  multiLine: multiLineOption,
  sankey:    sankeyOption,
  dualLine:  dualLineOption,
  bar:       defaultBarOption,
  line:      defaultLineOption,
  area:      defaultAreaOption,
}

export function buildChartOptionsMap() {
  const options = {}
  chartZones.zones.forEach((zone) => {
    const fn = ID_DISPATCH[zone.id] || TYPE_DISPATCH[zone.chartType] || defaultAreaOption
    options[zone.id] = fn(zone)
  })
  return options
}
```

---

### 规则 74：复制 boardRender 时 slice 与 icon-gap 必须共用同一 `resolveAssetUrl`——禁止遗留其他模块函数名

**症状**：页面只有全屏背景、硬编码括号装饰、ECharts 图表可见；**所有**文字、面板矢量、中心地图切片、icon 缺口补图全部消失。控制台可能有 `ReferenceError: getXxxLayerPublicPath is not defined`。

**根因**：从 sibling 页面 copy-paste `*BoardRender.js` 时，主循环里的 slice 已改为 `getEcmLayerPublicPath`，但 **icon-gap overlay 分支仍调用** `getMonitorLayerPublicPath`（或其他模块名）。`buildBoardRenderPlan()` 在 `created()` / `computed` 首次求值时抛错 → Vue 捕获后 `renderLayers` / `renderItems` 恒为 `[]`，页面退化为「空壳 + 图表」。

**铁律**：
1. **禁止**各项目维护多份几乎相同的 `*BoardRender.js`。标准实现：`templates/shared/boardRender.mjs`，入参 `resolveAssetUrl(filePath)`。
2. slice 分支与 icon-gap 分支**必须**调用同一函数：
```javascript
import { buildBoardRenderPlan, indexElements } from '<skill>/templates/shared/boardRender.mjs'
import { getLayerPublicPath } from './layerUrl.js'

const resolveAssetUrl = (file) => getLayerPublicPath(STATIC_BASE, file, resolveStaticPublicUrl)

export function buildPageRenderPlan(opts) {
  return buildBoardRenderPlan({ ...opts, resolveAssetUrl })
}
```
3. copy-paste 后 **grep 旧模块名**：`getMonitorLayerPublicPath|getCockpitLayerPublicPath|getProjectALayerPath` 等必须为 0 命中。
4. `Index.vue` 的 `created()` 或 plan 构建处加 try/catch 并 `console.error`，避免静默空数组。

**交付前门禁**：
```bash
node <skill>/scripts/verify-board-render-plan.mjs ./data
# exit 0 且 plan.total 与 stack hint 数量级一致
```

---

### 规则 75：§3.9 三层 DOM 渲染顺序——切片/矢量 → ECharts → 文字

**症状**：ECharts 正常，但文字被面板半透明矢量盖住；或图表被静态切片压在下面看不见。

**铁律（Index.vue template 分三段 v-for，禁止单循环混排）**：

| 段 | 内容 | z-index 策略 |
|---|---|---|
| ① 静态底 | slice + vector（来自 plan，kind !== text） | 原 stack z |
| ② 图表 | ECharts 容器 | 固定 ≥ 5000 |
| ③ 文字顶 | text / live-text | 固定 ≥ 9000 |

括号/全屏 BG 若由 Index.vue 硬编码单独渲染，仍放在 ① 之前或作为 boardStyle 背景，**不**进入 layer_stack 循环（见 `DEFAULT_SKIP_SLICE_NAMES`）。

---

### 规则 76：「仅 BG + 括号 + 图表」空页面——先查 plan 是否抛错，再查过滤

**症状**：背景图、装饰括号、ECharts 都在，但中间地图/面板/标题文字全无。

**分诊顺序（机械，禁止先调 CSS）**：

```
1. 浏览器 Console 有无 ReferenceError / buildBoardRenderPlan 相关错误？
   → 有：规则 74（resolveAssetUrl / 遗留函数名）

2. node verify-board-render-plan.mjs <dataDir>
   → exit 2：plan 构建抛错（同上）
   → exit 1：plan 层数远低于 stack hint（过滤过狠 / enrich 缺失）

3. plan 层数正常但页面仍空？
   → Index.vue 是否 try/catch 吞掉错误后返回 []
   → 渲染顺序是否把 text 放在 ECharts 下方（规则 75）
   → enrichTextSource 是否按 id 从 _all_elements 补全（规则 52）

4. 仅缺 icon 小图？
   → icon-gap overlay 是否走 resolveAssetUrl（规则 74）
   → icon/ 子目录是否保留（规则 63）
```

**快速计数**（dataDir 下）：
```bash
node -e "
const { buildBoardRenderPlan, indexElements } = require('./path/to/boardRender'); // 或 verify 脚本
const ls=require('./data/_layer_stack.json');
console.log('stack layers', ls.layers.length);
"
node <skill>/scripts/verify-board-render-plan.mjs ./data
```
