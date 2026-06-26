# 按阶段读取协议（Reading Guide）

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

> **用途**：每个阶段只读对应的文件/段落，避免一次性通读 1500+ 行文档。
> 从当前所处阶段开始读，**不要跳跃**。
>
> 核心原则：**需要什么读什么，不需要就不读**。

---

## 阶段索引（快速定位）

| 当前任务 | 必读（本阶段前必须读完） | 按需（卡壳时读） |
|---------|----------------------|----------------|
| [初次接触任务](#0-初次接触任务) | SKILL.md §第一步 + §第二步 + §第二步半 | — |
| [Step 0-A0 宿主决策](#step-0-a0-宿主决策) | meaxure-track.md 25-140 行 | coordinate-system.md §嵌入模式 |
| [Step 0-B 全量提取](#step-0-b-全量提取) | SKILL.md 命令行即可 | — |
| [Step 0-B skip 审计](#step-0-b-skip-审计) | `audit-skip-layers.mjs` 输出 | — |
| [Step 0-C 覆盖率](#step-0-c-覆盖率) | `classify-coverage-gaps.mjs` 输出 | meaxure-track.md Step 0-C 段 |
| [Step 0-D Pattern 识别](#step-0-d-pattern-识别) | element-recognition.md | — |
| [Step 0-E Gate Check](#step-0-e-gate-check) | meaxure-track.md Step 0-E 段 | — |
| [阶段 1 静态基线](#阶段-1-静态基线) | meaxure-track.md **§阶段 2：静态基线 HTML 生成**（924 行起）+ MeaXureFullscreenPage 模板 | — |
| [阶段 2 §3.9 渲染三件套](#阶段-2-渲染三件套) | meaxure-track.md **§3.9 渲染层三件套**（824 行起）+ **`templates/shared/boardRender.mjs`** | visual-diff-root-cause.md |
| [**空页面 / plan 层数为 0**](#空页面--plan-层数为-0) | **chart-feature-playbook.md §11** + hard-won-rules **规则 74–76** | `scripts/verify-board-render-plan.mjs` 输出 |
| [**消费遗漏 / 过滤误判**](#消费遗漏--过滤误判重难点) | **scene-graph-consumption-pitfalls.md**（A 轨道重难点专项） | hard-won-rules.md 规则 43-51 |
| [阶段 3 组件化](#阶段-3-组件化) | translate-recipe.md + `_group_analysis.json` | — |
| [Step 4-A 视觉循环](#step-4-a-视觉循环) | visual-diff-root-cause.md 对应分类 | browser-verification.md |
| [卡壳 / 反复失败](#卡壳--反复失败) | hard-won-rules.md + browser-verification.md | anti-patterns.md |

> ⚠️ **阶段编号映射**：本指南的「阶段 1/2/3」是**面向任务的读取分组**，与 `meaxure-track.md` 内部的 `## 阶段 0-4` **标题编号不一一对应**。对照如下，按本列「读哪一节」为准：
>
> | 本指南分组 | 对应 meaxure-track.md 章节 |
> |---|---|
> | 阶段 1 静态基线 | `## 阶段 2：静态基线 HTML 生成`（924 行） |
> | 阶段 2 §3.9 渲染三件套 | `#### §3.9 渲染层三件套`（824 行，位于 meaxure 阶段 1 实现段内） |
> | 阶段 3 组件化 | `## 阶段 3：静态基线 → 可维护 Vue`（984 行） |

---

## 各阶段详细说明

---

### 0. 初次接触任务

**必读（按顺序）**：

1. `SKILL.md` §「第一步：判断来源格式 → 选择轨道」（选 A/B/C）
2. `SKILL.md` §「第二步：判断目标框架」（Vue 2 / Vue 3）
3. `SKILL.md` §「第二步半：宿主布局决策」（运行 `decide-host-layout.mjs`）
4. 填写 `SKILL.md` §「项目变量映射表」（必填完才能继续）

**不需要读**：references/ 中的任何文档（此时还不需要）。

---

### Step 0-A0：宿主决策

**必读**：`meaxure-track.md` 第 25-140 行（Step 0-A0 节）

**必须运行的命令**：
```bash
node <skill>/scripts/extract-all-elements.mjs <index.html> <assetsDir> <outDir>
node <skill>/scripts/decide-host-layout.mjs <outDir> --arch <layerStack|anchorComponents>
# exit 0 才能继续
```

**按需读**：`coordinate-system.md` §「CONTENT_SHIFT 处理」+ §「自适应缩放四模式与得失对比」（仅在嵌入模式下需要）

---

### Step 0-B：全量提取

**不需要读文档**。命令已在 `SKILL.md` §检测命令 列出，直接运行：
```bash
node <skill>/scripts/extract-all-elements.mjs <index.html> <assetsDir> <outDir>
```

运行后查看输出统计，无报错即可继续。

---

### Step 0-B skip 审计

**不需要读文档**。直接运行：
```bash
node <skill>/scripts/audit-skip-layers.mjs <outDir>
# exit 0 → 放行  exit 2 → 确认 warn 数量  exit 3 → 必须处理 error
```

读 `_skip_audit.json` 的 `errors[]` 处理即可。

---

### Step 0-C：覆盖率

**必须运行**：
```bash
node <skill>/scripts/classify-coverage-gaps.mjs <outDir>
# exit 0 → 放行  exit 2 → probable-gap 须验证  exit 3 → critical-gap 必须处理
```

**按需读**：`meaxure-track.md` §Step 0-C 段（仅当 exit 3 时，需要了解补导出 / 留空报备流程）

---

### Step 0-D：Pattern 识别

**必读**：`element-recognition.md`（仅该文件，~100 行）

---

### Step 0-E：Gate Check + 字体落地

**必读**：
1. `meaxure-track.md` 仅 Step 0-E 节（约 50 行，含 15 项门禁清单）
2. **`font-bundling.md`**（字体搜索范围、禁止盲搜、互联网获取、`_font_acquire.json`）
3. 运行 `scripts/audit-project-fonts.mjs` 生成缺字体台账

---

### 阶段 1：静态基线

**必读**：

1. `meaxure-track.md` §「**阶段 2：静态基线 HTML 生成**」节（924 行起，约 60 行渲染规则）
2. `templates/vue/MeaXureFullscreenPage.template.vue`（骨架，直接复制）

**不需要读**：其他 references 文档。

---

### 阶段 2：渲染三件套（§3.9）

**必读**：`meaxure-track.md` §「**§3.9 渲染层三件套**」节（824 行起，约 100 行，含 icon gap / dedupe text / fake chart）；图标映射另读 `hard-won-rules.md` 规则 **63–65** + `templates/shared/layerUrl.mjs`

**按需读**：`visual-diff-root-cause.md` 中对应分类（发现视觉差异后再查）

---

### 阶段 3：组件化

**必读**：

1. 运行 `gen-component-skeleton.mjs <outDir>` 产出 `_group_analysis.json`
2. `references/translate-recipe.md` 中对应 pattern 的模板段落（仅读命中 pattern 那一节）

**不需要通读** `translate-recipe.md` 全文。

---

### Step 4-A：视觉循环

**标准流程**：截图 → 比对 → 查根因表 → 修复 → 重截图

**查根因表**：只读 `visual-diff-root-cause.md` 中与差异现象匹配的**分类**（一个分类约 10 行），不要通读全文。

**按需读**：`browser-verification.md`（需要 CDP 取证时）

**未命中时**：执行 `visual-diff-root-cause.md` 末节「未命中升级协议」（最多 2 轮，第 3 轮停止报告）。

---

### 卡壳 / 反复失败

**只有在以下情况才读这些文件**：

| 情况 | 读哪个文件 |
|------|----------|
| 文件名/路径 404 | `hard-won-rules.md` 规则 1（中文/空格文件名 URL 编码）/ 规则 3（Node 列文件）/ 规则 5（图标名与内容不符） |
| 坐标系统性偏移 | `coordinate-system.md` §「核心公式」+ §「CONTENT_SHIFT 处理」 |
| 背景色不生效 | `browser-verification.md` CDP Computed Style 配方（+ `hard-won-rules.md` 规则 48 面板背景被过滤） |
| CSS 不符预期 | `browser-verification.md` CDP Computed Style 配方 |
| 不确定是否违规 | `anti-patterns.md`（禁止清单，遇到疑问时查） |
| 同一问题失败 ≥2 次 | 停止改代码，执行 `browser-verification.md` 取证协议 |

---

---

### 消费遗漏 / 过滤误判（重难点）

**触发时机**：写完 Index.vue render-vector / render-slice 分支后，发现页面元素消失或样式缺失。

**必读**：`scene-graph-consumption-pitfalls.md`（全文，约 200 行，直接定位对应症状章节）

**速查入口**：

| 症状 | 读哪一节 |
|---|---|
| 渐变描边消失 | §2-A（synthBorderFromAttrs 合成规则） |
| 面板背景渐变消失 | §3-A（isInsideChartZone 面积门禁） |
| 背景切片在图表区消失 | §3-B（KEEP_IN_ZONE_RE 白名单扫描） |
| 元素有切片但不显示 | §3-C（SLICE_SKIP 碰撞集合） |
| 切片 PNG 拉伸变形 | §2-E（object-fit + slice-fit.json） |
| 对称 KPI 一侧背景/icon 异常 | 规则 62 + `symmetric-kpi-override.md`（excludeNativeIds + 参考行 clone） |
| 某文字消失 | §3-F（TEXT_ARTIFACT_RE 误过滤） |
| 两个元素只渲染一个 | §3-E（去重 dupKey 碰撞） |
| 什么都不知道为何消失 | §六（决策树）→ 逐步排查 |

**交付前必跑**（见 §四 系统性自检流程）：
```bash
node <skill>/scripts/audit-asset-consumption.mjs --scene data/scene-graph.json --assets <资产目录>
# 结果: HIGH=0 方可交付

# 多 panel 对称模块（规则 62）
node <skill>/scripts/detect-symmetric-module-gaps.mjs data/_all_elements.json
# dispositionMismatches / iconGaps / gaps 均为 0，或已落地 _symmetric_module_clones.json

# §3.9 渲染计划门禁（规则 74/76；catch copy-paste 遗留函数名）
node <skill>/scripts/verify-board-render-plan.mjs data/
```

---

## 空页面 / plan 层数为 0

**现象**：只有全屏 BG、括号装饰、ECharts；文字/面板/地图切片全无。

**必读**：`chart-feature-playbook.md` §11 → `hard-won-rules.md` 规则 74–76

**机械步骤**：
1. 浏览器 Console 查 `ReferenceError` / `buildBoardRenderPlan`
2. `node <skill>/scripts/verify-board-render-plan.mjs <dataDir>`（exit 2 = 构建抛错）
3. grep 项目 `getMonitorLayerPublicPath` 等 sibling 函数名 → 改为 `templates/shared/boardRender.mjs` + 单一 `resolveAssetUrl`
4. 确认 Index.vue 三段渲染顺序（规则 75）

---

## 强制读取门禁

每进入一个新阶段，在第一行工具调用前：

1. **确认已读本阶段的「必读」文件段落**（不多读，也不少读）
2. **把必读内容对应的关键变量写入 TodoWrite**（如：STAGE_W、CONTENT_SHIFT、renderArch）
3. **禁止在 TodoWrite 填完之前写任何业务代码**

---

## 文件体积参考（帮助判断是否需要分段读）

| 文件 | 估计行数 | 建议 |
|------|---------|------|
| `SKILL.md` | ~300 行 | 通读（仅一次，首次上手时） |
| `meaxure-track.md` | ~1420 行 | **按阶段段落读，禁止通读** |
| `translate-recipe.md` | ~390 行 | 按命中 pattern 读对应节 |
| `visual-diff-root-cause.md` | ~140 行 | 按现象匹配分类，读对应节 |
| `element-recognition.md` | ~175 行 | 通读（Step 0-D 时一次） |
| `coordinate-system.md` | ~200 行 | 按需读对应公式段 |
| `hard-won-rules.md` | ~1050 行（51 条规则） | 按需查，不通读 |
| `browser-verification.md` | ~85 行 | 卡壳时通读 |
| `anti-patterns.md` | ~145 行 | 审查时通读 |
| `scene-graph-consumption-pitfalls.md` | ~460 行 | **元素消失/样式缺失时通读**（A 轨道重难点，触发即读）|
