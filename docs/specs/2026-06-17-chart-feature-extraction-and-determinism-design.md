# design-to-vue 完善设计：图表特征提取 + 确定性渲染管线

- 日期：2026-06-17
- 主题：把"靠模型临场推断"的高方差环节前移为"确定性脚本产出 + 模板消费"
- 触发背景：示例 `sampleDashboard`（Sketch MeaXure → Vue2 大屏）还原过程中反复修改 8+ 轮
- 目标读者：design-to-vue skill 维护者

---

## 1. 背景与问题

`sampleDashboard` 还原过程暴露出现有 skill 的覆盖缺口。这些缺口导致**靠用户截图一处处反推修复**，而不是一次产出正确结果。逐条复盘：

| # | 踩坑 | 根因 | 现有 skill 是否覆盖 |
|---|------|------|--------------------|
| 1 | 中心背景大面积缺失，反复 42.7% 空洞 | 设计被拆到 **两个 artboard**（artboard0=左右面板，artboard1=中心3D背景），单独都不完整，需合并 | ❌ 只支持选单个 artboardIndex |
| 2 | 左下角绿/蓝大色块混乱 | MeaXure 用 `border:90px solid` 套 5×1 盒子表示**描边路径**，CSS 渲染成 390×203 实心块 | ❌ 不在 `_render_gaps_report` |
| 3 | 中心 3D 底座黑块 | `编组.png` 含不透明黑底，应透出深蓝背景（需 `mix-blend-mode:screen`） | ❌ 未覆盖 |
| 4 | 雷达图白底突兀 | `雷达图.jpg` 白底（最终改 ECharts，但白底切片是通用问题，需 `multiply`） | ❌ 未覆盖 |
| 5 | 柱/饼图条完全不渲染 | artboard0 的 `borders[].color` 是 `{rgb:{r,g,b}}` 对象，artboard1 是字符串；统一代码生成 `[object Object]` | ❌ 颜色解析不健壮 |
| 6 | 6 个图表全靠手工推断类型/挑色/编数据 | 图表特征无提取器；`fakeBarShapes` 只识别小柱，漏雷达(jpg)/桑基(描边流)/面积/折线 | ⚠️ 仅小柱 |
| 7 | 元问题：靠截图迭代而非一次成型 | 缺"渲染前充分诊断 + 交付前消费审计"的硬闸门 | ⚠️ 部分（_consume_audit 偏弱） |

**双重目标**：
1. **低阶模型也能胜任**：把高方差推断动作变成"运行脚本 → 读报告 → 填模板"的低方差流程，让低阶模型达到堪比高阶模型的还原效果（尤其是图表）。
2. **不限制高阶模型**：见 §2 设计哲学。

---

## 2. 设计哲学：地板而非天花板（关键约束）

脚本与模板提供的是**质量地板（保证基线）**，绝不是**能力天花板**。

- 低阶模型：照单消费脚本产出 + 套用模板 → 稳定达标。
- 高阶模型：可以**覆盖模板 option**、追加更高保真处理、识别脚本漏检的边缘情况、对 `needsConfirm` 候选自主裁决。
- 每个模块在 skill 文档中都标注 **「默认快路径」**（必做、保底）与 **「可增强点」**（高阶模型可选做得更好）。
- 闸门只校验**结果**（每层是否已消费/排除/图表化、每图表区是否有 ECharts、黑白底切片是否已 blend），**不规定唯一实现方式**——高阶模型用更优手段达成同样结果同样通过。

---

## 3. 模块设计

### 模块 1（核心）：Sketch 图表特征提取器 + ECharts 模板库

#### 1.1 产物：`_chart_zones.json`

新增脚本 `scripts/extract-chart-features.mjs`（或并入 `extract-all-elements.mjs` 的后处理阶段）。对每个 section 标题锚定的图表区，产出结构化特征：

```jsonc
{
  "zones": [
    {
      "id": "bar",
      "title": "趋势分析",
      "rect": { "x": 155, "y": 232, "w": 625, "h": 312 },
      "chartType": "dualAxisBar",
      "confidence": "high",          // high=标题锚定自动排除；low=needsConfirm
      "needsConfirm": false,
      "evidence": ["标题锚定:趋势分析", "区内 10 等距 gradient 小柱", "X轴 5 年份 text", "双侧 Y 轴刻度"],
      "axis": {
        "yLeft":  { "max": 150, "interval": 25, "unit": "万tce",  "ticks": [0,25,50,75,100,125,150] },
        "yRight": { "max": 150, "interval": 25, "unit": "万tCO₂", "ticks": [0,25,50,75,100,125,150] }
      },
      "categories": ["2020年","2021年","2022年","2023年","2024年"],
      "legend": [
        { "name": "指标总量", "color": "#1DE4FF" },
        { "name": "指标总量", "color": "#0BFFB6" }
      ],
      "series": [
        { "name":"指标总量","color":"#1DE4FF","yAxisIndex":0,"data":[98,112,128,118,134],"dataSource":"geom" },
        { "name":"指标总量","color":"#0BFFB6","yAxisIndex":1,"data":[76,84,96,88,104],"dataSource":"geom" }
      ],
      "radar": null,
      "sankey": null,
      "excludeLayerIds": ["...区内被排除的静态层 id..."]
    }
  ]
}
```

雷达专用字段：`radar.indicators=[{name:"电",max:100},...]`；桑基专用：`sankey.nodes=[{name,color}]` + `sankey.links=[{source,target,value,valueSource}]`。

#### 1.2 图表类型推断（确定性签名表）

| chartType | 识别签名（区内元素） |
|-----------|--------------------|
| `bar` / `dualAxisBar` | 等距小柱（w≈6–18, h≥30, gradient 或纯色）；双侧 Y 轴刻度 → dualAxis |
| `groupBar` | 每个 X 类目下 2–4 根紧邻小柱、按系列色循环 |
| `line` | 折线点序列（小圆点 + 连线 path） |
| `area` | 底部 `linear-gradient(...0%, color 100%)` 大 div + 顶部匹配色点 |
| `radar` | 面板内 jpg/png 切片含多边形网格；周围 3–6 个维度 text |
| `sankey` | 多色描边路径簇（`border:Npx`）+ 分列节点 text |
| `pie` / `gauge` | 环/弧（`border-radius:50%` 或弧形 path）+ 中心数值 |

推断输出 `evidence[]`，便于审计与高阶模型复核。

#### 1.3 特征提取细则（全部"真实提取不目测"，遵守铁律 #1/#12）

- **categories**：X 轴 text 行（年份/能源名）按 x 排序
- **radar.indicators**：雷达切片周边 text（电/氢气/热/油/气）
- **sankey.nodes**：分列节点 text（来源A/来源B/…→ 产出A/产出B → 区域A/区域B/区域C）
- **axis.max/interval/unit**：Y 轴刻度 text（0/25/…/150）反推 max+interval；单位 text → name
- **series[].color**：图例点色块色 + 假柱/面积/折线 fills 提取
- **series[].data**：
  - `dataSource:"geom"`：柱高/折线点 y 几何反推（bar/line/area，形状还原）
  - `dataSource:"mock"`：雷达/桑基难准确反推 → 合理 mock 占位，**醒目注释 + 预留 `// TODO: 接入接口` 替换位**

#### 1.4 ECharts 模板库 `templates/echarts/`

dark 大屏主题 token 化（轴色/网格/图例/字号统一常量）。`chartType → buildOption(zone)`：

覆盖：`bar` `dualAxisBar` `groupBar` `line` `area` `radar` `sankey` `pie` `gauge`。

- **默认快路径**：模型 `import { buildOption } from templates/echarts` → `buildOption(zone)`，零手写 option。
- **可增强点**：高阶模型可深拷贝模板返回值后局部覆盖（动画、富 tooltip、视觉映射），或完全自写 option——只要图表区有 ECharts 即通过闸门。

#### 1.5 置信度与排除

- `confidence:"high"`（标题锚定）：自动把 `excludeLayerIds` 从 layer_stack 排除 + 自动接 ECharts。
- `confidence:"low"`（仅假柱聚类、无标题）：`needsConfirm:true`，模型须确认后再排除（B+C 混合策略）。

---

### 模块 2：渲染缺口检测增强（确定性过滤）

扩展 `extract-all-elements.mjs` 与 `_render_gaps_report.json`：

#### 2.1 退化描边路径 `degenerateBorderPaths`
- 判定：`border:Npx solid`（N>2）且 `N*2 > rect.w 或 N*2 > rect.h` 且 rect 较小（w<60 或 h<60）
- 消费：渲染层自动跳过；保留 ≤2px 正常细线
- 直接修复踩坑 #2

#### 2.2 黑底/白底切片 `blendHints`
- 用已内置 `pngjs` 采样切片四角 + 中心像素：
  - 四角接近纯黑（且非透明）→ `blendMode:"screen"`
  - 四角接近纯白 → `blendMode:"multiply"`
- 消费：对应 `<img>` 自动加 `mix-blend-mode`
- 注意：这是**让真实切片正确显示**，不违反禁令 #18（非 CSS 模拟视觉）
- 直接修复踩坑 #3/#4

#### 2.3 健壮颜色解析器（共享 util）
- 统一解析 `"#RRGGBB"` / `"rgba(...)"` / `{rgb:{r,g,b},alpha}` / `"#hex 100%"`（带百分号尾缀）
- 落在 `templates/shared/`（A/B/C 共用，呼应"提炼通用层"）
- 直接修复踩坑 #5

---

### 模块 3：多画板覆盖检测 + 合并

#### 3.1 检测
- 解析 `index.html` 全部 artboard，逐画板算 Step 0-C 覆盖率
- 识别"互补拆分"：画板 A 大背景覆盖中心、画板 B 覆盖左右面板，二者并集才完整

#### 3.2 产物 `_artboard_merge_plan.json`
```jsonc
{
  "multiArtboard": true,
  "strategy": "complementary-merge",
  "base": 1,                    // 以 artboard1 为底（含背景+中心）
  "overlays": [
    { "from": 0, "filter": "panels(cx<1600 || cx>4700)", "zOffset": 2000 }
  ],
  "reason": "artboard0 缺中心背景(42.7%空洞)；artboard1 缺左右面板图表"
}
```
- 附通用脚本 `scripts/merge-artboards.mjs`（本次临时手写脚本通用化：合并 `_layer_stack.json` + `_all_elements.json`，按 plan 做 z 偏移）

#### 3.3 闸门
- >1 画板且覆盖互补 → 必须按 plan 合并，未合并禁止进入渲染（直接修复踩坑 #1）

---

### 模块 4：SKILL.md 阶段闸门 + checklist（prose）

#### 4.1 渲染前闸门（写 Index.vue 前）
必须已消费三份报告，未读禁止写页面代码：
- [ ] `_artboard_merge_plan.json`（若多画板已合并）
- [ ] `_render_gaps_report.json`（degenerateBorderPaths/blendHints/duplicateTextGroups/iconGapCandidates 已处理）
- [ ] `_chart_zones.json`（high 自动排除+接 ECharts；low 已确认）

#### 4.2 交付前消费审计闸门（硬阻断）
新增/强化 `_consume_audit.json`，校验**结果**（不限实现）：
- [ ] 每个 layer_stack 图层：已渲染 / 已排除(图表区或缺口) / 已图表化 —— 三选一，无遗漏
- [ ] 每个 `confidence:"high"` chart zone：有对应 ECharts 容器
- [ ] 每个 `blendHints` 切片：已加 mix-blend-mode
- [ ] 无 `degenerateBorderPaths` 被渲染
- [ ] `needsConfirm` 候选：已全部裁决
- 审计不过 → 不算完成（呼应铁律 #4「不靠截图肉眼验收」）

#### 4.3 文档落点
- `references/meaxure-track.md`：多画板合并、渲染缺口增强、阶段闸门
- `references/element-recognition.md`：图表类型签名表、特征提取细则
- `references/hard-won-rules.md`：追加踩坑 #1–#5 条目
- `SKILL.md`：禁止事项追加；阶段闸门串联；"地板非天花板"哲学

---

### 模块 5：回归验证夹具

- 把 `sampleDashboard` 设计源沉淀为 skill 端到端回归夹具
- 快照期望产物：`_chart_zones.json` / `_render_gaps_report.json` / `_artboard_merge_plan.json`
- 新增 `scripts/test-chart-features.mjs` 等回归测试，改 skill 后跑一遍防回退
- 与现有 G1–G9 闸门体系并列

---

## 4. 验收标准

1. 对 `sampleDashboard` 设计源跑增强后的提取脚本，`_chart_zones.json` 自动识别全部 6 个图表区（类型/轴/图例/配色/类目正确），无需手工补充。
2. `_render_gaps_report.json` 自动列出退化描边路径 + 黑白底切片 blend 提示。
3. 多画板自动产出合并方案。
4. 交付前消费审计能检出"图表区未接 ECharts""黑底切片未 blend""退化路径被渲染"等缺陷并阻断。
5. 文档同步到 Cursor 副本（`sync/sync-to-cursor.ps1` + `verify-sync.ps1`）。
6. 高阶模型路径不被限制：闸门只校验结果，模板可覆盖。

## 5. 非目标（YAGNI）

- 不做 100% 像素级图表数据还原（雷达/桑基 mock 占位即可）。
- 不重写 B/C 轨道主流程，仅提炼通用层（颜色解析、ECharts 模板、blend 检测）供其复用。
- 不引入新运行时依赖（复用项目已有 echarts、skill 已有 pngjs）。

## 6. 影响的文件

**新增**：
- `scripts/extract-chart-features.mjs`
- `scripts/merge-artboards.mjs`
- `templates/echarts/`（9 类图表 option builder + 主题 token）
- `templates/shared/colorParse.mjs`
- `scripts/test-chart-features.mjs`、回归夹具

**修改**：
- `scripts/extract-all-elements.mjs`（degenerateBorderPaths / blendHints / 多画板覆盖）
- `references/meaxure-track.md`、`element-recognition.md`、`hard-won-rules.md`
- `SKILL.md`（禁令、闸门、设计哲学）
- `sync/checksum.txt`（同步）
