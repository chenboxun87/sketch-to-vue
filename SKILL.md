<!--
  Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/design-to-vue
  Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
-->
---
name: design-to-vue
description: >-
  将设计工具产物还原为像素精准的 Vue 组件（Vue 2 / Vue 3 均支持）。
  触发词：切图、MeaXure、MasterGo、FILE_DATA.json、manifest.json、index.html let data、
  大屏还原、驾驶舱、设计稿转 Vue、D2C、设计转代码、还原页面、对齐 UI、大屏页面、
  sketch、meaxure、cockpit。
  支持三种输入：① Sketch MeaXure 导出（index.html + assets/）
               ② MasterGo 导出包（FILE_DATA.json + data/exports/）
               ③ MasterGo 链接/fileId（需 MasterGo MCP）
---

# design-to-vue

将 Sketch MeaXure / MasterGo 设计产物还原为像素精准的 Vue 页面或组件。

## 全局安装位置

| 环境 | 路径 |
|------|------|
| **Claude Code（主源，在此编辑）** | `<skill-root>`（默认 `~/.claude/skills/design-to-vue/`） |
| **Cursor 全局** | `~/.cursor/skills/design-to-vue/` |

克隆到 GitHub 后可将 `<skill-root>` 设为任意目录；同步脚本支持 `DESIGN_TO_VUE_SKILL_ROOT`（见 `sync/INSTALL.md`）。

双端同步：`sync/sync-to-cursor.ps1` → `sync/verify-sync.ps1`（详见 `sync/INSTALL.md`）。  
旧 skill **meaxure-vue-restore** 已迁移，请勿再使用。

## 包结构（显式索引）

| 目录 | 内容 | 入口 |
|------|------|------|
| **`scripts/`** | 提取 / 审计 / 图表 / MasterGo 包装 | 「脚本快捷参考」；回归 `node scripts/test-all.mjs` |
| **`references/`** | 分阶段规则与轨道文档 | 「参考文档索引」；`references/reading-guide.md` |
| **`templates/`** | Vue / ECharts / 共享渲染模块 | `templates/vue/README.md` |
| **`assets/`** | 可复制 JSON 模板 | `assets/README.md` |
| **`docs/fixtures/`** | 中性化回归夹具 | `docs/fixtures/sceneGraph/README.md` |
| **`docs/plans/`、`docs/specs/`** | 可选内部开发记录 | 各目录 `README.md` |
| **`sync/`** | 双端同步 | `sync/INSTALL.md` |

**安全与出站** → [`SECURITY.md`](SECURITY.md)

---

## ⚡ 按阶段读取协议（强制门禁，优先于一切）

> **禁止通读全量文档。** 直接跳到当前所处阶段，只读对应段落。
>
> | 阶段 | 跳到 |
> |------|------|
> | 首次接触 / 选轨道 | 下方「第一步」~ 「第二步半」（本文件内） |
> | Step 0-A0 宿主决策 | `references/meaxure-track.md` 第 25–140 行 |
> | Step 0-B 提取 + audit | 直接跑命令（见「第二步半」检测命令块） |
> | Step 0-C 覆盖率 | `classify-coverage-gaps.mjs` 输出 |
> | Step 0-E 字体落地 | `references/font-bundling.md` + `scripts/audit-project-fonts.mjs` |
> | 阶段 3 组件化 | `references/translate-recipe.md` |
> | Step 4-A 视觉循环 | `references/visual-diff-root-cause.md` 按分类查 |
> | 卡壳 / 失败 ≥2 次 | `references/hard-won-rules.md` + `browser-verification.md` |
>
> **完整阶段索引** → `references/reading-guide.md`（含每阶段必读文件和行号范围）

---

## 三条铁律（每次都遵守，无例外）

1. **代码优先于肉眼**：尺寸/颜色/贴图映射一律从导出源数据读取（JSON/index.html），禁止视觉猜测。文件名和缩略图都会骗人。
2. **零推断补全**：MasterGo 样式不得用几何/尺寸/对齐猜测；FILE_DATA 不足则加强 extract、export 切片或 MCP DSL，见 `references/mastergo-extraction-completeness.md`。
3. **卡壳即取证**：同一问题失败 ≤2 次后**停止改代码**，用浏览器 CDP 检查真实 DOM（见 `references/browser-verification.md`）。
4. **完成前用浏览器校验**：用计算样式/bounding rect/视口比例验证像素对齐，不靠截图肉眼判断。

---

## 设计哲学：脚本与模板是地板，不是天花板

本 skill 的脚本（`extract-chart-features`、`merge-artboards`、`_render_gaps_report` 等）与
`templates/echarts/` 模板提供**保证基线（地板）**：低阶模型照单消费即可达标。
高阶模型可**覆盖模板 option、追加更高保真处理、自主裁决 needsConfirm 候选**——
闸门只校验**结果**（每层已消费/排除/图表化、每图表区有 ECharts、黑白底切片已 blend、无退化路径被渲染），
不规定唯一实现方式。用更优手段达成同样结果同样通过。

---

## 第一步：判断来源格式 → 选择轨道

```
输入中有什么？
│
├── index.html 含 "let data = {" 或 links/ preview/ 目录
│     └── → A 轨道：Sketch MeaXure  → 读 references/meaxure-track.md
│
├── FILE_DATA.json (+ data/exports/ 目录)
│     └── → B 轨道：MasterGo 导出包 → 读 references/mastergo-export-track.md
│
└── mastergo.com 链接 / shortLink / fileId / layerId
      └── → C 轨道：MasterGo MCP   → 读 references/mastergo-mcp-track.md
```

## 第二步：判断目标框架

```
检测方式（按优先级）：
1. 读 package.json → "vue": "^2" 或 "^3"
2. 看已有页面文件（Options API / setup() + defineComponent）
3. 看 CLAUDE.md / README 说明
4. 用户明确说明

Vue 2 → 读 references/vue2-runtime.md（vmd-ui/ls-*/ViewContent/Echarts）
Vue 3 → 读 references/vue3-runtime.md（字体打包/ScreenStage/ECharts composable）
```

## 第二步半：宿主布局决策（大屏/驾驶舱必做，写任何 Index.vue 前）

> **示例 sampleCockpitV2 验证页教训**：跳过本步会导致反复改路由/缩放/overlay；布局收敛后仍可能踩 **§3.9 渲染三件套**（图标缺口/文本叠影/假图表残留）— 见 `meaxure-track.md`「渲染层三件套」与附录 V5。

**用 TodoWrite 记录以下三项，未填完禁止写页面代码：**

| 决策项 | 选项 | 后果 |
|--------|------|------|
| **宿主** | **嵌入 BasicLayout**（平台已有侧栏+顶栏） / **全屏独立路由**（无壳纯像素验收） | 嵌入须 CONTENT_SHIFT + 嵌套路由；全屏用 letterbox |
| **渲染架构** | **§3.9 切片拼接**（`_layer_stack.json` z 序 v-for） / **锚点+动态组件**（anchors + Panel + 可选业务 overlay） | **禁止混用**——layer_stack 再叠项目 overlay = 叠影 |
| **缩放策略**（嵌入模式） | **宽度铺满 + 纵向滚动** / **letterbox 整页适配** | 前者 `scale=vw/contentW`；后者 `scale=min(vw/W,vh/H)` 会牺牲宽度 |

检测命令：
```bash
# 1. 先跑全量提取，产出 _host_layout_hint.json（含 decision 块）
node <skill>/scripts/extract-all-elements.mjs <index.html> <assetsDir> <outDir>

# 2. 决策门禁：--arch 由任务意图给定（layerStack=切片拼接 / anchorComponents=锚点组件）
node <skill>/scripts/decide-host-layout.mjs <outDir> --arch <layerStack|anchorComponents>
#   exit 0 = 决策已定，读 <outDir>/_host_decision.json 填变量表后放行
#   exit 3 = 需人工确认：补 --arch，或写 <outDir>/_host_decision.confirm.json 后重跑
#   exit 1 = 输入错误（缺 hint / --arch 非法）
```

**未达 exit 0 禁止写 Index.vue。** `_host_decision.json` 的 `host`/`scale`/`renderArchitecture` 即三决策唯一来源。

嵌入模式 canonical 实现见 `meaxure-track.md` §「技能验证页」；坐标/缩放细节见 `coordinate-system.md` §「CONTENT_SHIFT 处理」+ §「自适应缩放四模式与得失对比」。

---

## 📋 项目变量映射表（A 轨道首次使用必填）

开始任务前用 Glob/Read 查出实际值，填入右列，并用 **TodoWrite 保存**。
`meaxure-track.md` 中凡出现左列「示例值」，自动替换为右列实际值。

| 示例值 | 你的项目实际值 | 推荐查找命令 |
|--------|--------------|------------|
| `Cockpit`（Vue 组件 PascalCase 前缀） | | `Glob "**/*Anchor.vue"` 看实际前缀 |
| `sample-cockpit`（静态资源目录） | | 看 manifest.json 父目录 |
| `2912×1248`（设计稿画板尺寸） | | Read manifest.json artboard 字段 |
| `279×86`（CONTENT_SHIFT，嵌入模式） | | 读 `_host_layout_hint.json` 的 `contentShift` |
| `嵌入 BasicLayout` / `全屏独立`（宿主模式） | | 读 `_host_decision.json` 的 `decision.host` |
| §3.9 layer_stack / 锚点+组件（渲染架构） | | decide-host-layout.mjs --arch（写入 _host_decision.json） |
| `DingTalkJinBuTi`（设计稿字体名） | | Step 0-B 全量样式提取后查 font-family |
| `/your-web/sampleCockpit`（路由路径） | | `Grep "router/index"` |
| `9588`（dev server 端口） | | Read cli.config.json / vite.config.* |
| 设计稿源目录 | | 用户提供，或 README / CLAUDE.md |

**填完判定**：上述各项均有对应实际值，已写入 TodoWrite。**未填完禁止进入阶段 0。**

---

## 轨道快捷路由表

| 来源 | 必读 References | 按需加载 |
|------|----------------|---------|
| A: Sketch MeaXure | `meaxure-track.md` + `vue2/vue3-runtime.md` + **`browser-verification.md`**（完成前验证） | `element-recognition.md`（Fake chart/**Chart zone/文本 dedupe**）**`chart-feature-playbook.md`（大屏图表必读：10 步流水线 + 7 问决策树 + §11 空页面分诊）**`coordinate-system.md`（锚点/缩放/**嵌入宿主**）`hard-won-rules.md`（踩坑，含规则 22–76；**大屏必读：30/31/32/33/35**；**消费侧必读：47/48/49/50/51**；**boardRender 必读：74/75/76**）`layout-strategy.md`（**大屏推荐**）`state-coverage.md`（**开始实现前推荐**） |
| B: MasterGo 导出包 | `mastergo-export-track.md` + **`mastergo-extraction-completeness.md`**（零推断/提取完整性）+ `vue2/vue3-runtime.md` + **`browser-verification.md`** | `coordinate-system.md` `hard-won-rules.md` `layout-strategy.md`（**大屏推荐**）`state-coverage.md`（**开始实现前推荐**） |
| C: MasterGo MCP | `mastergo-mcp-track.md` + `vue2/vue3-runtime.md` | `element-recognition.md` `anti-patterns.md` `browser-verification.md` `layout-strategy.md`（**大屏推荐**）`state-coverage.md`（**开始实现前推荐**） |

> ⚠️ **JS vs Python 字段名差异**：A 轨道的两个脚本输出格式不同——
> - `extract-meaxure.mjs` → 每个 layer 坐标在 `rect: {x, y, w, h}`（供 `emit-html.mjs` 消费）
> - `extract-meaxure-data.py` → 坐标在顶层 `left / top / width / height`（供 Python 布局检测消费）
> 混用时注意字段名转换，避免取 `undefined`。

---

## 脚本快捷参考

```bash
# A 轨道 - 提取 MeaXure 数据（两种方式任选）
node  scripts/extract-meaxure.mjs  index.html  layers.json
node  scripts/extract-all-elements.mjs  index.html  assetsDir  outDir  [artboardIndex]
# 产出含 _host_layout_hint.json（contentShift/stage 建议）；回归：node scripts/test-host-layout-hint.mjs
# 产出含 _render_gaps_report.json（§3.9 图标/叠字/假柱检测）
# 图标缺口两阶段：gen-icon-gap-candidates.mjs → gen-icon-overlays.mjs → 人工核对 unresolved
node scripts/gen-icon-gap-candidates.mjs <outDir> [designAssetsDir]
node scripts/gen-icon-overlays.mjs <outDir> <deployedStatic/design-assets> [boardW] [boardH]
python scripts/extract-meaxure-data.py  index.html  [artboardIndex]

# A 轨道 - 多画板合并（_artboard_merge_plan.json 指示互补合并时）
node scripts/merge-artboards.mjs <dataDir>
# A 轨道 - 多画板覆盖率检测（若有 artboard0/ artboard1/ 子目录）
node scripts/measure-artboard-coverage.mjs <dataDir> [boardW] [boardH]  # 产出 _artboard_coverage.json
node scripts/detect-artboard-merge.mjs <dataDir>                         # 读取 coverage → 产出 _artboard_merge_plan.json
# A 轨道 - 图表特征提取（产出 _chart_zones.json，消费 templates/echarts）
node scripts/extract-chart-features.mjs <dataDir> <panels.json>

# A 轨道 - 生成静态基线 HTML（对比验证用）
node  scripts/emit-html.mjs  layers.json  assetsDir  outDir

# A 轨道 - 场景图（M1+）：父子树 + 语义边 + disposition + 子树图表检测
#   由 extract-all-elements.mjs 自动产出 scene-graph.json / _scene_graph_audit.json / _chart_zones_sg.json
node scripts/audit-scene-graph.mjs <outDir>/scene-graph.json     # 处置级闸门（exit 3 = 有 unclassified/孤立假柱）
node scripts/gen-vue-from-scene-graph.mjs <outDir>/scene-graph.json <outDir>/_chart_zones_sg.json <outDir> --host fullscreen

# A 轨道 - 资产消费自检（人工验收前必跑，确定性查「漏用/错用/多用」，见规则 45/46）
#   六类：missing-asset(404) / shared-file(命名碰撞) / aspect-distort(拉伸+fit建议) / empty-vector(空盒) / text-fragment-overlap(双渲染) / unused-asset(冗余)
#   产出 consumption-audit.json + slice-fit.suggest.json（fit 建议→人工筛选落 data/slice-fit.json）
node scripts/audit-asset-consumption.mjs --scene <outDir>/scene-graph.json --assets <已部署资产目录>

# A 轨道 - 渲染计划门禁（§3.9 交付前必跑；catch icon-gap 遗留函数名等致命 copy-paste 错误，见规则 74/76）
node scripts/verify-board-render-plan.mjs <outDir>

# A 轨道 - 对称 KPI 漏导 / 处置不一致（规则 62；产出 dispositionMismatches）
node scripts/detect-symmetric-module-gaps.mjs <outDir>/_all_elements.json

# B 轨道 - 全量 extract（推荐）
node  scripts/extract-mastergo-all.mjs  --dir "<导出目录>"  --design-root "<父目录>"  --frame "<帧名>"  --out "<pilot>/data"
# pilot 可选 data/_dynamic_zones.json 声明活体区；产出 _mg_consume_audit.json（G8）

# B 轨道 - 轻量 CSS 节点提取（支持多帧：--frame "帧A,帧B"；--vue 输出 Less；默认输出 JSON）
node  scripts/extract-mastergo-css.mjs  --dir "<导出目录>"  --frame "<帧名>"  [--vue]  [--out <outFile>]

# A 轨道 - 大屏锚区计算（规则驱动，从 MeaXure 图层自动推算各动态区域坐标）
#   先写 anchorMeasureRules.json（关键词/范围/padding），每次设计更新后重跑即可
node  scripts/meaxure-anchor-regions.mjs  --html <index.html>  --rules <anchorMeasureRules.json>  --out <anchorRegions.json>
node  scripts/meaxure-anchor-regions.mjs  --self-test

# A 轨道 - KPI 活体数值覆盖层（把烘焙/静态 KPI 数字换成可绑 mock 的 overlay；确定性提取位置/字号/色/局部底色，见规则 9）
#   --exclude 传动态区域逻辑坐标 [[x0,y0,x1,y1],...]；--num preserve 保留原值，给固定值则全部覆盖（演示活体）
node  scripts/gen-kpi-overlays.mjs  --elements <outDir>/_all_elements.json  --board <board@2x.png>  --out <outDir>/kpiOverlays.json  [--scale 2]  [--exclude <regions.json>]  [--num preserve]

# B 轨道 - 静态 emit 基线（G9）
node  scripts/emit-mastergo-html.mjs  "<pilot>/data"  "<导出目录>/data/exports"  "<pilot>/emit-baseline"
# B 轨道 - G9 闸门验证：emit 基线 vs MasterGo 标注稿坐标对齐（CDP ≤2px）
node  scripts/verify-mg-g9.mjs  "<pilot>/emit-baseline"  "<pilot>/data"

# C 轨道 - MasterGo MCP 结构分析（出站仅限 mastergo.com，见 SECURITY.md）
python scripts/mastergo_analyze.py  "https://mastergo.com/goto/xxx"
python scripts/mastergo_get_dsl.py  --file-id "<id>" --layer-id "<id>" [--token ...]
python scripts/mastergo_fetch_docs.py  --from-dsl   # 从 stdin 读 DSL，仅 fetch HTTPS 公网文档
# C 轨道 - Node 包装器（spawn mastergo_get_dsl.py）
node   scripts/fetch-mg-dsl.mjs  --file-id "<id>" --layer-id "<id>" --out "<path.json>" [--token ...]

# 安全：token 仅经环境变量或 --token 传入，禁止写入 skill 包
test -n "$MASTERGO_TOKEN" && echo "Token set" || echo "Token NOT set"
```

---

## 禁止事项摘要（39 条）

1. 禁止视觉猜测颜色/尺寸——必须从源数据提取
2. 禁止把全页背景用 `<img>` 标签——必须用 `background-image`（Vue 2/datav-dashboard 项目）
3. 禁止 @2x 文件 CSS 尺寸除以 2——manifest/JSON 里的 w/h 直接用
4. 禁止用 Windows `dir` 命令列中文文件名——用 Node.js 列出
5. 禁止嵌套 `/deep/`——每条穿透样式单独写（Vue 2）
6. 禁止表格列设 `:width`——只用 `:min-width`（Vue 2/vmd-ui）
7. 禁止把 ECharts 轴刻度文字写成 DOM 元素——ECharts 自渲染
8. 禁止靠截图肉眼验收——用浏览器 CDP 量计算样式
9. 禁止硬编码中文/空格文件路径——通过 `getAssetPath()` URL 编码
10. 禁止把 D2C 结果直接当最终代码提交（MasterGo MCP 轨道）
11. 禁止在用户项目目录中创建临时 DSL 文件（MasterGo MCP 轨道）
12. 禁止凭目测填写任何元素的坐标/尺寸/颜色/字号/字体/渐变——所有视觉属性必须来自 `_all_elements.json`（按元素 id/name 查询）；设计稿里没有无用内容，提取不到=复现必然失真
13. 禁止忽略画板未覆盖区域——Step 0-C 检出的真缺失空洞（经 preview 交叉验证非设计留白）必须处理：**引导补导出，或留空报备 `_missing_assets.json`**（preview 仅作验证基准，禁止裁 preview 当像素兜底，见禁止 16/17），不得放任中心/大块背景缺失
14. 禁止跳过字体落地——needsBundling 须 bundled 或 **pending_acquire + substituteStack + 向用户提示获取方式**（见 `font-bundling.md`）；禁止在 Windows Fonts / 全盘盲搜；禁止不记录、不提示的静默替代
15. 禁止跳过整页量化门禁——交付前必须执行 Step 4-A2 坐标消费抽查 + Step 4-E 整页 SSIM/像素差异门禁，不得仅凭「看起来差不多」主观验收
16. 禁止「完全整图打底」与「从合并预览裁任何元素」——边界不准且必带 z 层遮盖（裁按钮底图会带进按钮文字）。合并 `@2x preview` **仅作验证基准**，不为任何元素提供像素。
17. 禁止任何形式的「打补丁遮盖」（色块/纯色/裁图盖旧数字）——缺源宁可留空 + 报备设计师（`_missing_assets.json`），绝不降低任一处标准。
18. 禁止凭空捏 CSS 模拟栅格/复杂视觉（全息图/辉光/纹理必须用真实图片：slice 或设计师补导）；但 HTML 本就以 css/渐变表达的矢量层（shape）**必须完整复刻其 css/fills**（这是复刻，不是模拟）。
19. 禁止提取不全导致复刻偏差——`extract-all-elements.mjs` 必须全字段消费并通过 `_extraction_coverage.json` 自检（含 shadows 多层/辉光、letterSpacing、lineHeight、fontFace、fills 渐变角度+stops、borders、radius、rotation、opacity、css、顶层 colors/languages/slices、base64）；存在未映射字段即视为缺陷。
20. 禁止 `exportable.path` 直引文件——必须经 `resolveAsset()` 做 @2x/@3x 别名映射，杜绝引错图；base64 内嵌图必须解码落地为 PNG 再引用。
21. 禁止把图表区静态矢量/切片近似当最终渲染——必须按 `_chart_zones.json` 用 `templates/echarts` ECharts 自渲染（雷达/桑基/面积/折线/柱同理）
22. 禁止渲染 `_render_gaps_report.degenerateBorderPaths`——MeaXure `border:Npx` 描边路径套小盒子会成实心大色块，须跳过
23. 禁止忽略 `_render_gaps_report.blendHints`——黑底切片须 `mix-blend-mode:screen`、白底须 `multiply`（让真实切片正确显示，非 CSS 模拟）
24. 禁止多画板互补拆分时只取单板——必须按 `_artboard_merge_plan.json` 合并，未合并禁止渲染
25. **禁止用面板边界作为 Chart Zone 边界**——zone rect 必须基于 `fakeBarShapes` 实际坐标聚类的 bounding box（±20px 安全边距），面板边界比假柱 bbox 大时必然误覆盖非图表区（规则 30）
26. **禁止删除 ECharts zone 而不提供替代渲染**——错误图表类型（bar 填充环形图区）仍优于空白；先改 type（→pie/line），再看 CSS 向量质量，最后才能删 zone（规则 31）
27. **禁止大屏文字层使用 `overflow:hidden; text-overflow:ellipsis`**——必须用 `overflow:visible; white-space:nowrap`，防止 fallback 字体截断 KPI 数字（规则 32）
28. **禁止向 KEEP_IN_ZONE_RE 遗漏背景切片名**——定义新 zone 后必须检查区内所有切片，背景切片（编组备份 N / 编组 16备份 等）必须加入白名单（规则 33）
29. **禁止对切片应用 screen blend 时凭名称通配符推断**——必须用 Pillow 采样四角+中心像素：四角 A<50 且中心暗/透明 → screen；否则不应用（规则 36）
30. **禁止只为有假柱的区域定义 ECharts zone**——环形图/折线图/面积图面板同样必须定义 ECharts zone（type: pie/line），CSS 向量无法还原弧形和曲线（规则 35）
31. **禁止在 shape 渲染时用 `min(w,h) < 80` 过滤**——正确策略为三层：`max(w,h)<35` 排真小点 + CSS fill 验证 + `narrow≤30 AND inZone` 排假图表柱；否则薄装饰横线全部丢失（规则 40）
32. **切片渲染消费 css 要分类**——`opacity`/`mix-blend-mode`/`filter` 必须应用，但**几何 `transform`（scaleX/rotate/…）必须 `delete`**（已烘焙进 PNG，再施加=二次变换，左括号变右括号）；`render-vector` 才保留 transform（规则 39 + 规则 49）
33. **禁止脚本生成 `_layer_stack.json` 时不验证 vector-css 数量**——若 `vector-css == 0` 且 shape 数量 > 0，必须从 `_all_elements.json` 补充消费，否则所有面板背景装饰层全部消失（规则 38）
34. **禁止只用字段级覆盖（_extraction_coverage）判定提取完整**——必须叠加处置级闸门（_scene_graph_audit）：每个可见节点要么有渲染去向、要么 exclude+reason，禁止 unclassified（规则 41）
35. **禁止 render-vector 分支只调用 parseCssArray**——必须同时调用 `synthBorderFromAttrs(attrs)` 并 merge；MeaXure 对渐变描边不输出 CSS，仅靠 parseCssArray 会导致描边系统性消失（规则 47）
36. **禁止只靠中心点判断 isInsideChartZone**——必须加面积门禁：元素面积 ≥ zone 面积 90% 且宽高 ≥ 85% 时视为背景层保留；否则面板背景因中心落在子 zone 内被误过滤（规则 48）
37. **禁止定义新 Chart Zone 后不扫描区内切片白名单**——定义 zone 后必须执行 "zone 区域 render-slice 扫描"，缺失的背景切片名必须加入 KEEP_IN_ZONE_RE（规则 33/3-B）
38. **禁止 audit-asset-consumption.mjs 产出的 slice-fit.suggest.json 直接采用**——机器建议含发光层噪声，必须人工肉眼确认 PNG 内容（主体在左/中？是否含文字？）后才落地 slice-fit.json（规则 45）
39. **禁止交付前不跑资产消费体检**——必须运行 `audit-asset-consumption.mjs` 清零 missing-asset，漏跑则 404/拉伸/空盒等问题无法提前发现（规则 46）
40. **禁止对称 KPI 视觉不一致时先调 CSS**——须先跑 `detect-symmetric-module-gaps.mjs`；有 `dispositionMismatches` 时用 `excludeNativeIds` + 参考行 clone（规则 62），**禁止** `KPI.y + panelPitch` 盲 clone 到下一业务 panel
41. **禁止 slice URL 只用 basename**——`icon/`、`pic/` 子目录必须保留；Windows 路径先 `\`→`/` 再取 `/assets/` 后段（规则 63；`templates/shared/layerUrl.mjs`）
42. **禁止 BG备份 映射为小 ghost overlay**——全屏背景只作 `background-image`（规则 64）
43. **禁止跳过 gen-icon-overlays 直接复制 candidates**——须两阶段流水线 + 人工核对 unresolved（规则 65）
44. **禁止在 skill 源码/文档中硬编码业务文案、真实项目坐标或模块名**——测试/fixture/示例仅用 `feature-a`、`icon/kpi-chip.png`、`rect {x:10,y:10,w:48,h:48}` 等中性占位；真实数据只出现在用户项目的 `outDir/`，见 `references/skill-content-neutrality.md`
45. **禁止 chartPanels.json 的 width/zoneHeight 覆盖静态数据表格或 KPI 卡片区**——zone 必须止步于纯图表绘图区边界；违反时静态内容消失且 ECharts 无渲染（规则 69；见 `chart-feature-playbook.md` §2.2）
46. **禁止 ECharts 消费侧忽略 resolveGradients()**——`buildOption` 返回的 `{__gradient}` 占位若不转换，图表颜色全部降级为 `undefined`（见 `chart-feature-playbook.md` §6.2 + `templates/echarts/index.mjs`）
47. **禁止凭视觉猜测 chartType——必须走 7 问决策树**（`chart-feature-playbook.md` §1.2）：先数柱根数/颜色分组，再看折线条数，再看有无渐变面积，最后看节点流向；顺序错误则类型必然误判
48. **禁止 copy-paste boardRender 后 slice 与 icon-gap 使用不同 URL 解析函数**——必须共用 `resolveAssetUrl`；优先 `templates/shared/boardRender.mjs`（规则 74）
49. **禁止 §3.9 单循环混排 slice/vector/text/ECharts**——须三段渲染：静态底 → ECharts（z≥5000）→ 文字顶（z≥9000）（规则 75）
50. **禁止交付前不跑 `verify-board-render-plan.mjs`**——「仅 BG+括号+图表」空页面多为 plan 构建抛错被吞（规则 76；见 `chart-feature-playbook.md` §11）

---

## 双轨 Pilot 验收闸门（G1–G9）

A/B 共享改动合并前：跑 `node scripts/test-all.mjs`（聚合全部回归，含 `test-text-style.mjs`）；B 轨道 `_render_gaps_report.json` 无 `unmappedImages`；V2 页不回退。双轨设计依据见技能包内 `docs/specs/`（如 `2026-06-17-chart-feature-extraction-and-determinism-design.md`）与 `docs/plans/`。

| 闸门 | 轨道 | 条件 |
|------|------|------|
| G4-B | B | `_render_gaps_report` 无 high severity；禁止 `css:*` asset |
| G8 | B | `_mg_consume_audit.json` → `ok === true` |
| G9 | B | `emit-mastergo-html` 基线与 MasterGo 标注稿视觉对齐（CDP ≤2px） |

**共享内核：** `templates/shared/textStyle.mjs` + `templates/shared/mgStyle.mjs` + **`templates/shared/boardRender.mjs`**（§3.9 渲染计划，入参 `resolveAssetUrl`）  
**B 全量 extract：** `scripts/extract-mastergo-all.mjs` → `_layer_stack.json` + `_mg_consume_audit.json`  
**B emit 基线：** `scripts/emit-mastergo-html.mjs`  
**A 消费审计：** `_consume_audit.json`

---

## 参考文档索引

| 文件 | 内容 | 加载时机 |
|------|------|---------|
| [`SECURITY.md`](../SECURITY.md) | 出站网络、环境变量、可选依赖、误报说明 | 上传公开仓库 / 安全扫描前读 |
| `references/reading-guide.md` | 按阶段读取协议（每阶段必读文件+行号范围） | **首次接触时读（替代通读全量文档）** |
| `references/meaxure-track.md` | MeaXure 三阶段：提取→基线→Vue | A 轨道必读 |
| `references/mastergo-export-track.md` | MasterGo 导出包六步流程 | B 轨道必读 |
| `references/mastergo-mcp-track.md` | MasterGo MCP 完整工作流 | C 轨道必读 |
| `references/vue2-runtime.md` | Vue 2 框架规范（vmd-ui/ls-*） | Vue 2 项目必读 |
| `references/vue3-runtime.md` | Vue 3 框架规范（字体/ECharts/GSAP） | Vue 3 项目必读 |
| `references/coordinate-system.md` | 坐标系/锚点推导/布局判定 | 有锚点系统时读 |
| `references/element-recognition.md` | UI 元素识别 + Fake chart 识别 | 需识别元素类型时读 |
|| `references/chart-feature-playbook.md` | **ECharts 图表特征提取与重绘作战手册**（10 步流水线 + 7 问决策矩阵 + 颜色提取 + 消费模板 + 调试检查清单）；低阶 AI 照单执行即可达标 | **大屏含图表时优先读（和 element-recognition.md 配合）** |
| `references/hard-won-rules.md` | 踩坑录（**76 条**高风险规则，含规则 43-48 消费侧/过滤专项 + **49–51 slice/资产/椭圆** + **62 对称 KPI 参考行替换** + **63–65 icon 子目录/BG overlay/两阶段映射** + **74–76 boardRender/空页面分诊**） | 遇到文件名/背景/坐标/CSS 模拟/缺失切图/Chart zone 误覆盖/删 zone 退行/文字截断/背景切片被排除/PNG 拉伸/图表区漏定义/screen blend/路由被覆盖/**渐变描边消失（规则 47）/面板背景被过滤（规则 48）/切片翻转方向错（规则 49）/素材引错图（规则 50）/椭圆变矩形（规则 51）/对称 KPI 处置不一致（规则 62）/icon 子目录 404（规则 63）/BG 误映射 overlay（规则 64）/仅 BG+图表空页面（规则 74–76）**时读 |
| `references/skill-content-neutrality.md` | **skill 包中立性**：禁止业务文案/真实坐标/项目模块名 | 新增规则/测试/fixture 前读 |
| `references/symmetric-kpi-override.md` | 对称 KPI：参考行 clone + excludeNativeIds 实操 | 存量/增量 KPI 视觉不一致或 clone 落错区块时读 |
| `references/scene-graph-consumption-pitfalls.md` | **消费侧遗漏 + 错误过滤专项手册**（A 轨道两大重难点）：5 类消费遗漏模式（2-A~2-E）、6 类错误过滤模式（3-A~3-F）、快速决策树、系统自检流程、可运行诊断脚本 | **A 轨道写 Index.vue 时必读**（元素消失/样式缺失时优先读此文档）|
| `references/browser-verification.md` | CDP 校验协议（5 个诊断配方） | **A/B 轨道必读**（完成前）；C 轨道卡壳时读 |
| `references/anti-patterns.md` | 禁止清单（26 条，分类） | 代码审查时读 |
| `references/layout-strategy.md` | absolute/flex/grid 决策树 + 5 种典型布局 | 确定布局策略时读 |
| `references/state-coverage.md` | 三轨道统一状态覆盖规范 | 开始实现前读（识别状态缺口）|
| `references/translate-recipe.md` | group→Vue 组件转译配方（6 种 pattern：kpi-row/list/chart-container/card/title/generic + 机械填充清单） | 阶段 3 开始前读（配合 `gen-component-skeleton.mjs`）|
| `references/visual-diff-root-cause.md` | 视觉差异根因速查（5分类~45条 + 未命中升级协议） | Step 4-A 截图比对后查（未命中必须升级）|
| `references/mastergo-dsl-types.md` | 完整 DSL TypeScript 类型定义 | C 轨道遇到未知 NodeType 时读 |
| `templates/mastergo-prompts.md` | 4 个即用型 MasterGo 提示词模板 | C 轨道发起任务时复制 |
| `templates/mastergo-component.vue` | MasterGo 组件骨架 | B 轨道第 3 步复制 |

