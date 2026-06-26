<div align="center">

# design-to-vue

**Sketch MeaXure / MasterGo 设计稿 → 像素级 Vue 页面**  
一套运行在 Claude Code / Cursor 中的 AI Skill，让 AI 把设计工具的导出物转换成真正可运行的 Vue 2 / Vue 3 组件——不猜测、不幻觉、像素对齐。

[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-blue.svg)](LICENSE)
[![Vue 2 & 3](https://img.shields.io/badge/Vue-2%20%7C%203-42b883?logo=vue.js)](https://vuejs.org/)
[![Works with Claude](https://img.shields.io/badge/Works%20with-Claude%20Code-5a5aff?logo=anthropic)](https://claude.ai/code)
[![Works with Cursor](https://img.shields.io/badge/Works%20with-Cursor-000?logo=cursor)](https://cursor.sh/)

[English](#english) · [安装](#安装) · [快速开始](#快速开始) · [三条轨道](#三条输入轨道) · [脚本手册](#脚本手册) · [License](#license)

</div>

---

## 这是什么？

`design-to-vue` 是一套专门为 **大屏 / 驾驶舱 / Dashboard** 类页面设计的 AI Skill，  
解决"设计稿转代码"领域最难的一类场景：

| 普通 D2C 工具的问题 | design-to-vue 的解法 |
|---|---|
| 只生成静态 HTML，图表区变成截图 | 识别图表特征 → 生成 ECharts 可数据绑定组件 |
| 图片路径靠猜，404 一堆 | 从导出源数据确定性解析，无猜测 |
| 多图层叠压/层级错误 | Scene Graph（有向图）精确还原 z-order |
| 字体/颜色/边框丢失 | 全量 CSS 提取 + 渐变边框/阴影/椭圆自动合成 |
| AI 自由发挥产生幻觉内容 | 四项铁律 + 消费侧审计门禁，强制可验证 |
| 大屏缩放/宿主嵌入踩坑 | 宿主布局决策脚本 + letterbox/CONTENT_SHIFT 公式 |

---

## 支持的设计工具

| 轨道 | 输入格式 | 典型场景 |
|------|----------|---------|
| **A · Sketch MeaXure** | `index.html` + `assets/` | Sketch 标注导出，批量切图 |
| **B · MasterGo 导出包** | `FILE_DATA.json` + `data/exports/` | MasterGo 离线导出 |
| **C · MasterGo MCP** | `mastergo.com` 链接 / fileId | 在线实时读取 DSL |

---

## 核心能力

- **确定性资产解析**：图片路径来自 `objectID`+`exportable.path`，不靠文件大小/颜色猜测
- **Scene Graph（有向图）**：父子层级 + 语义边 + disposition 分类，任何嵌套深度的元素都能挖出
- **ECharts 图表自动识别**：柱图/折线/饼图/雷达区域 → 生成可绑 mock 数据的 ECharts 组件
- **渲染三件套检测**：图标缺口 / 文字叠影 / 假图表残留，交付前自动扫描
- **消费侧全量审计**：漏用/错用/多用资产一键检出，给出 `slice-fit` 修复建议
- **双端同步**：Claude Code (`~/.claude/skills/`) ↔ Cursor (`~/.cursor/skills/`) NTFS Junction
- **Vue 2 & Vue 3 双支持**：自动检测 `package.json` 框架版本，模板分别适配

---

## 安装

> **前置要求**：Node.js 18+，Python 3.9+（仅 C 轨道），Claude Code 或 Cursor

### 方式一：Clone 到全局 Skill 目录（推荐）

```bash
# Claude Code
git clone https://github.com/chenboxun87/design-to-vue.git ~/.claude/skills/design-to-vue

# Cursor（创建 Junction 指向同一目录，Windows）
cd ~/.cursor/skills
New-Item -ItemType Junction -Name design-to-vue -Target "$env:USERPROFILE\.claude\skills\design-to-vue"

# 安装脚本依赖
cd ~/.claude/skills/design-to-vue/scripts
npm install
```

### 方式二：自定义路径

```bash
git clone https://github.com/chenboxun87/design-to-vue.git /path/to/skill
export DESIGN_TO_VUE_SKILL_ROOT=/path/to/skill
```

> 详细安装与同步说明 → [`sync/INSTALL.md`](sync/INSTALL.md)

---

## 快速开始

### Cursor 中使用

1. 打开 Cursor → 新建 Agent 对话
2. 输入触发词：`切图`、`MeaXure`、`MasterGo`、`大屏还原`、`驾驶舱`、`design-to-vue`
3. AI 自动加载 Skill，按提示填写「项目变量映射表」

### Claude Code 中使用

```bash
# 在项目根目录
/use-skill design-to-vue

# 或在对话中直接描述需求
# 示例："把 D:/docs/myDesign 目录里的 MeaXure 导出物转成 Vue3 大屏页面"
```

---

## 三条输入轨道

### A 轨道：Sketch MeaXure

```
your-design/
├── index.html          ← 含 "let data = {" 的标注数据
├── assets/             ← 切图 PNG/SVG
├── links/              ← （可选）多画板链接
└── preview/            ← （可选）预览图
```

```bash
# Step 1：提取所有元素 + 场景图
node ~/.claude/skills/design-to-vue/scripts/extract-all-elements.mjs \
  index.html assets/ ./out

# Step 2：宿主布局决策
node ~/.claude/skills/design-to-vue/scripts/decide-host-layout.mjs ./out \
  --arch layerStack

# Step 3：告诉 AI "请基于 ./out 目录生成 Vue 组件"
```

### B 轨道：MasterGo 导出包

```bash
node ~/.claude/skills/design-to-vue/scripts/extract-mastergo-all.mjs \
  --dir "./export" --design-root "./" --frame "主画板" --out "./pilot/data"
```

### C 轨道：MasterGo MCP（在线）

```bash
export MASTERGO_TOKEN=your_token_here
python ~/.claude/skills/design-to-vue/scripts/mastergo_get_dsl.py \
  --file-id "abc123" --layer-id "xyz456"
```

---

## 脚本手册

<details>
<summary><b>A 轨道（Sketch MeaXure）— 展开查看全部命令</b></summary>

```bash
# 数据提取
node scripts/extract-meaxure.mjs          index.html layers.json
node scripts/extract-all-elements.mjs     index.html assetsDir outDir
node scripts/extract-meaxure-data.py      index.html [artboardIndex]

# 多画板
node scripts/merge-artboards.mjs          <dataDir>
node scripts/measure-artboard-coverage.mjs <dataDir> [W] [H]
node scripts/detect-artboard-merge.mjs    <dataDir>

# 图表识别
node scripts/extract-chart-features.mjs  <dataDir> <panels.json>

# 场景图
node scripts/audit-scene-graph.mjs       <outDir>/scene-graph.json
node scripts/gen-vue-from-scene-graph.mjs <outDir>/scene-graph.json <chartZones> <outDir>

# 资产审计（交付前必跑）
node scripts/audit-asset-consumption.mjs --scene <outDir>/scene-graph.json --assets <assetsDir>

# 渲染计划门禁
node scripts/verify-board-render-plan.mjs <outDir>

# KPI 活体覆盖层
node scripts/gen-kpi-overlays.mjs  --elements <outDir>/_all_elements.json \
  --board board@2x.png --out kpiOverlays.json

# 静态 HTML 基线
node scripts/emit-html.mjs  layers.json  assetsDir  outDir

# 锚区计算
node scripts/meaxure-anchor-regions.mjs  --html index.html \
  --rules anchorMeasureRules.json  --out anchorRegions.json

# 字体审计
node scripts/audit-project-fonts.mjs  <outDir>

# 对称 KPI 漏导检测
node scripts/detect-symmetric-module-gaps.mjs <outDir>/_all_elements.json
```
</details>

<details>
<summary><b>B 轨道（MasterGo 导出包）— 展开查看全部命令</b></summary>

```bash
# 全量提取
node scripts/extract-mastergo-all.mjs  --dir "<导出>" --design-root "./" \
  --frame "<帧名>" --out "<pilot>/data"

# 轻量 CSS 提取（支持多帧）
node scripts/extract-mastergo-css.mjs  --dir "<导出>" --frame "<帧名>" [--vue] [--out file.json]

# 静态 emit 基线
node scripts/emit-mastergo-html.mjs  "<pilot>/data" "<导出>/data/exports" "<pilot>/emit-baseline"

# G9 闸门验证
node scripts/verify-mg-g9.mjs  "<pilot>/emit-baseline"  "<pilot>/data"
```
</details>

<details>
<summary><b>C 轨道（MasterGo MCP）— 展开查看全部命令</b></summary>

```bash
python scripts/mastergo_analyze.py    "https://mastergo.com/goto/xxx"
python scripts/mastergo_get_dsl.py    --file-id "<id>" --layer-id "<id>"
python scripts/mastergo_fetch_docs.py --from-dsl

node   scripts/fetch-mg-dsl.mjs  --file-id "<id>" --layer-id "<id>" --out path.json
```
</details>

<details>
<summary><b>回归测试</b></summary>

```bash
cd scripts
node test-all.mjs    # 全量回归（~30 秒，全 Pass 才可提交）
```
</details>

---

## 目录结构

```
design-to-vue/
├── SKILL.md                    ← AI 主入口（Cursor/Claude Code 自动加载）
├── SECURITY.md                 ← 安全说明（网络边界 / token 处理）
├── scripts/                    ← 30+ 提取 / 审计 / 生成脚本
│   ├── extract-all-elements.mjs
│   ├── extract-chart-features.mjs
│   ├── audit-asset-consumption.mjs
│   ├── gen-vue-from-scene-graph.mjs
│   └── test-all.mjs            ← 全量回归入口
├── references/                 ← 分阶段规则文档（24 份，约 8k 行）
│   ├── reading-guide.md        ← 阅读导航（每阶段必读文件索引）
│   ├── hard-won-rules.md       ← 踩坑规则（55+ 条，大屏必读）
│   ├── meaxure-track.md        ← A 轨道完整流程
│   ├── mastergo-export-track.md
│   └── ...
├── templates/                  ← Vue / ECharts 可复用模板
│   ├── vue/
│   ├── echarts/
│   └── shared/
├── assets/                     ← 可复制 JSON 配置模板
├── docs/
│   ├── fixtures/               ← 中性化回归测试夹具
│   ├── plans/                  ← 内部开发记录（可选阅读）
│   └── specs/                  ← 内部设计规格（可选阅读）
└── sync/                       ← 双端同步脚本
    ├── INSTALL.md
    ├── sync-to-cursor.ps1
    └── verify-sync.ps1
```

---

## 为什么不用现有 D2C 工具？

| 工具 | 缺点 |
|------|------|
| Figma Dev Mode / MasterGo 导出 | 只生成静态 CSS，无法绑数据，图表变图片 |
| Locofy / Anima | 针对普通网页，无法处理大屏层叠/z-order/ECharts |
| GPT-4V / Claude Vision | 视觉猜测，字体/颜色/尺寸误差大，图片路径全猜 |
| 手写 | 大屏页面 200+ 图层，手写一周起步 |

`design-to-vue` 的核心差异：**从设计工具的原始导出数据（JSON/HTML/DSL）直接解析，不依赖截图识别，任何细节都有原始数据作为唯一来源。**

---

## 贡献指南

欢迎 PR 和 Issue！提交前请：

1. 运行 `cd scripts && node test-all.mjs` 确保全部通过
2. 新脚本需附带对应的 `test-xxx.mjs` 测试文件
3. 文档修改需同步更新 `references/reading-guide.md` 的行号引用

---

## English

`design-to-vue` is an AI Skill for Claude Code / Cursor that converts Sketch MeaXure or MasterGo design exports into pixel-perfect Vue 2/3 components.

**Key differentiator**: All asset paths, colors, fonts, and positions are resolved deterministically from exported JSON/HTML data — no visual guessing, no hallucination.

**Best suited for**: Dashboard/cockpit/big-screen pages with complex layering, ECharts integrations, and strict pixel-alignment requirements.

### Quick install

```bash
git clone https://github.com/chenboxun87/design-to-vue.git ~/.claude/skills/design-to-vue
cd ~/.claude/skills/design-to-vue/scripts && npm install
```

Then in Cursor or Claude Code, mention any of: `MeaXure`, `MasterGo`, `design-to-vue`, `cockpit`, `dashboard restore`.

---

## License

本项目采用 [CC BY-NC-ND 4.0](LICENSE) 协议。

**你可以**：在署名条件下免费使用本 Skill（个人学习、非商业项目）。  
**你不可以**：  
- 将本项目复制或搬运到自己的 GitHub / 任何平台作为自己的成果发布  
- 去除或修改版权信息后再分发  
- 用于任何商业目的（含接单、SaaS、付费服务）  
- 发布修改后的衍生版本（NoDerivatives）

Original author: **chenboxun87** · Hosted at: https://github.com/chenboxun87/design-to-vue

---

<div align="center">
如果这个项目对你有帮助，请点 ⭐ Star 支持一下！
</div>
