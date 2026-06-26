<div align="center">

# sketch-to-vue

### Sketch MeaXure / MasterGo → Pixel-Perfect Vue 2 / Vue 3

**The only AI Skill that converts design tool exports into truly runnable Vue components —  
no guessing, no hallucination, pixel-aligned.**

> Also supports MasterGo export packages and MasterGo MCP (online DSL).  
> Best suited for **Dashboard · Cockpit · Big-Screen** pages with complex layering & ECharts.

[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-blue.svg)](LICENSE)
[![Vue 2 & 3](https://img.shields.io/badge/Vue-2%20%7C%203-42b883?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Works with Claude](https://img.shields.io/badge/Works%20with-Claude%20Code-5a5aff?logo=anthropic&logoColor=white)](https://claude.ai/code)
[![Works with Cursor](https://img.shields.io/badge/Works%20with-Cursor-000?logo=cursor&logoColor=white)](https://cursor.sh/)
[![Node 18+](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

[中文说明](#中文说明) · [Install](#install) · [Quick Start](#quick-start) · [3 Input Tracks](#3-input-tracks) · [Script Reference](#script-reference) · [FAQ](#faq) · [License](#license)

</div>

---

## Why sketch-to-vue?

Most design-to-code tools generate static HTML or broken React components.  
**sketch-to-vue** tackles the hardest class of pages: **data-driven dashboards with 200+ layers, ECharts integrations, and sub-pixel alignment requirements.**

| Pain point | How sketch-to-vue solves it |
|---|---|
| Image paths always 404 | Resolved deterministically from `objectID` + `exportable.path` — zero guessing |
| Charts become screenshots | Detects bar/line/pie/radar zones → generates ECharts components with bindable mock data |
| Layer order wrong | Scene Graph (directed acyclic graph) preserves exact z-order across any nesting depth |
| Font / color / border lost | Full CSS extraction + gradient border synthesis + ellipse auto-detection |
| AI makes things up | 4 iron rules + consumption-side audit gate — every pixel has a source |
| Big-screen scaling nightmares | Host layout decision script + letterbox / CONTENT_SHIFT formulas |

---

## Supported Design Tools

| Track | Input Format | Typical Use |
|---|---|---|
| **A · Sketch MeaXure** | `index.html` + `assets/` | Sketch annotation export |
| **B · MasterGo Export Package** | `FILE_DATA.json` + `data/exports/` | MasterGo offline export |
| **C · MasterGo MCP** | `mastergo.com` link / fileId | Online real-time DSL |

---

## Core Features

- **Deterministic asset resolution** — image paths from `objectID`+`exportable.path`, never from file size or color heuristics
- **Scene Graph (DAG)** — parent-child hierarchy + semantic edges + disposition classification; no element hidden at any depth
- **ECharts auto-detection** — bar / line / pie / radar regions → bindable ECharts components
- **Render triplet detection** — icon gaps / text overlaps / ghost charts scanned before delivery
- **Full consumption audit** — missing / wrong / duplicate assets detected in one command, with `slice-fit` fix suggestions
- **Dual sync** — Claude Code (`~/.claude/skills/`) ↔ Cursor (`~/.cursor/skills/`) via NTFS Junction
- **Vue 2 & Vue 3** — auto-detects `package.json` version, separate template sets

---

## Install

> **Requirements**: Node.js 18+, Python 3.9+ (C-track only), Claude Code or Cursor

```bash
# Clone to global skill directory
git clone https://github.com/chenboxun87/sketch-to-vue.git ~/.claude/skills/sketch-to-vue

# Cursor (Windows — create Junction pointing to the same directory)
cd ~/.cursor/skills
New-Item -ItemType Junction -Name sketch-to-vue -Target "$env:USERPROFILE\.claude\skills\sketch-to-vue"

# Install script dependencies
cd ~/.claude/skills/sketch-to-vue/scripts && npm install
```

**Custom path:**
```bash
git clone https://github.com/chenboxun87/sketch-to-vue.git /any/path
export DESIGN_TO_VUE_SKILL_ROOT=/any/path
```

> Full install & sync guide → [`sync/INSTALL.md`](sync/INSTALL.md)

---

## Quick Start

### In Cursor

1. Open Cursor → New Agent chat
2. Type any trigger word: `MeaXure`, `Sketch`, `MasterGo`, `big-screen restore`, `cockpit`, `sketch-to-vue`
3. The AI loads the Skill automatically — follow the "Project Variable Mapping Table" prompt

### In Claude Code

```bash
# In your project root
/use-skill sketch-to-vue

# Or describe your need directly:
# "Convert the MeaXure export at D:/designs/myDashboard into a Vue 3 full-screen page"
```

---

## 3 Input Tracks

<details>
<summary><b>Track A · Sketch MeaXure (most common)</b></summary>

**Expected export structure:**
```
your-design/
├── index.html     ← annotation data (contains "let data = {")
├── assets/        ← slice PNGs / SVGs
├── links/         ← (optional) multi-artboard links
└── preview/       ← (optional) preview images
```

**Steps:**
```bash
# 1. Extract all elements + scene graph
node ~/.claude/skills/sketch-to-vue/scripts/extract-all-elements.mjs \
  index.html assets/ ./out

# 2. Host layout decision (required before writing any Index.vue)
node ~/.claude/skills/sketch-to-vue/scripts/decide-host-layout.mjs ./out \
  --arch layerStack

# 3. Tell AI: "Generate Vue component based on ./out directory"
```
</details>

<details>
<summary><b>Track B · MasterGo Export Package</b></summary>

```bash
node ~/.claude/skills/sketch-to-vue/scripts/extract-mastergo-all.mjs \
  --dir "./export" --design-root "./" --frame "MainFrame" --out "./pilot/data"
```
</details>

<details>
<summary><b>Track C · MasterGo MCP (online)</b></summary>

```bash
export MASTERGO_TOKEN=your_token_here
python ~/.claude/skills/sketch-to-vue/scripts/mastergo_get_dsl.py \
  --file-id "abc123" --layer-id "xyz456"
```
</details>

---

## Script Reference

<details>
<summary><b>Track A — Full Command List</b></summary>

```bash
# Data extraction
node scripts/extract-meaxure.mjs          index.html layers.json
node scripts/extract-all-elements.mjs     index.html assetsDir outDir
python scripts/extract-meaxure-data.py    index.html [artboardIndex]

# Multi-artboard
node scripts/merge-artboards.mjs          <dataDir>
node scripts/measure-artboard-coverage.mjs <dataDir> [W] [H]
node scripts/detect-artboard-merge.mjs    <dataDir>

# Chart detection
node scripts/extract-chart-features.mjs  <dataDir> <panels.json>

# Scene graph
node scripts/audit-scene-graph.mjs       <outDir>/scene-graph.json
node scripts/gen-vue-from-scene-graph.mjs <outDir>/scene-graph.json <chartZones> <outDir>

# Asset audit (run before manual review)
node scripts/audit-asset-consumption.mjs \
  --scene <outDir>/scene-graph.json --assets <assetsDir>

# Render plan gate
node scripts/verify-board-render-plan.mjs <outDir>

# KPI live overlay
node scripts/gen-kpi-overlays.mjs \
  --elements <outDir>/_all_elements.json \
  --board board@2x.png --out kpiOverlays.json

# Static HTML baseline
node scripts/emit-html.mjs  layers.json  assetsDir  outDir

# Anchor region calculation
node scripts/meaxure-anchor-regions.mjs \
  --html index.html --rules anchorMeasureRules.json --out anchorRegions.json

# Font audit
node scripts/audit-project-fonts.mjs  <outDir>

# Symmetric KPI gap detection
node scripts/detect-symmetric-module-gaps.mjs <outDir>/_all_elements.json
```
</details>

<details>
<summary><b>Track B — Full Command List</b></summary>

```bash
node scripts/extract-mastergo-all.mjs \
  --dir "<export>" --design-root "./" --frame "<frame>" --out "<pilot>/data"

node scripts/extract-mastergo-css.mjs \
  --dir "<export>" --frame "<frame>" [--vue] [--out file.json]

node scripts/emit-mastergo-html.mjs \
  "<pilot>/data" "<export>/data/exports" "<pilot>/emit-baseline"

node scripts/verify-mg-g9.mjs  "<pilot>/emit-baseline"  "<pilot>/data"
```
</details>

<details>
<summary><b>Track C — Full Command List</b></summary>

```bash
python scripts/mastergo_analyze.py    "https://mastergo.com/goto/xxx"
python scripts/mastergo_get_dsl.py    --file-id "<id>" --layer-id "<id>"
python scripts/mastergo_fetch_docs.py --from-dsl
node   scripts/fetch-mg-dsl.mjs       --file-id "<id>" --layer-id "<id>" --out path.json
```
</details>

<details>
<summary><b>Regression Tests</b></summary>

```bash
cd scripts && node test-all.mjs   # ~30s, all must pass before committing
```
</details>

---

## Directory Structure

```
sketch-to-vue/
├── SKILL.md                    ← AI entry point (auto-loaded by Cursor/Claude Code)
├── SECURITY.md                 ← Security policy (network boundaries / token handling)
├── scripts/                    ← 30+ extraction / audit / generation scripts
│   ├── extract-all-elements.mjs   ← Full MeaXure element extraction
│   ├── extract-chart-features.mjs ← ECharts zone detection
│   ├── audit-asset-consumption.mjs← Missing/wrong/duplicate asset audit
│   ├── gen-vue-from-scene-graph.mjs← Vue codegen from scene graph
│   └── test-all.mjs               ← Full regression suite
├── references/                 ← 24 stage-based rule documents (~8k lines)
│   ├── reading-guide.md           ← Navigation guide (stage → file → line)
│   ├── hard-won-rules.md          ← 55+ battle-tested rules (must-read for big screens)
│   ├── meaxure-track.md           ← Track A full workflow
│   └── ...
├── templates/                  ← Vue / ECharts reusable templates
│   ├── vue/
│   ├── echarts/
│   └── shared/                    ← boardRender, textStyle, vectorStyle, colorParse
├── assets/                     ← Copyable JSON config templates
├── docs/
│   ├── fixtures/               ← Neutralized regression fixtures
│   └── specs/ plans/           ← Internal development records
└── sync/                       ← Dual-sync scripts (Claude ↔ Cursor)
    ├── INSTALL.md
    └── sync-to-cursor.ps1 / verify-sync.ps1
```

---

## FAQ

**Q: Does it work without a MasterGo account?**  
A: Tracks A and B work completely offline from exported files. Track C requires a MasterGo token.

**Q: Vue 2 or Vue 3?**  
A: Auto-detected from `package.json`. Separate template sets for each. Explicitly say `vue3` to force Vue 3 mode.

**Q: What about Figma?**  
A: Not yet. Figma exports a different format. A Track D (Figma) is on the roadmap.

**Q: Can I use this in a team / company?**  
A: Yes, for internal non-commercial use with attribution. See [LICENSE](LICENSE) for details.

**Q: The AI skips some layers — why?**  
A: Run `audit-asset-consumption.mjs` first. It reports missing/filtered elements with reasons. Each filtered element has a documented justification (chart zone, ghost shape, dedup, etc.).

---

## 中文说明

`sketch-to-vue` 是专为 **大屏 / 驾驶舱 / Dashboard** 设计的 AI Skill，运行在 Claude Code 或 Cursor 中。

将 Sketch MeaXure 标注产物（`index.html` + `assets/`）或 MasterGo 导出包，转换为像素级对齐的 Vue 2 / Vue 3 组件，图表区域自动生成可绑数据的 ECharts 组件。

**核心差异**：所有图片路径、颜色、字体、位置均从导出的 JSON/HTML 原始数据中确定性解析——不依赖截图识别，不靠猜测，任何细节都有原始数据作为唯一来源。

### 快速安装

```bash
git clone https://github.com/chenboxun87/sketch-to-vue.git ~/.claude/skills/sketch-to-vue
cd ~/.claude/skills/sketch-to-vue/scripts && npm install
```

在 Cursor 或 Claude Code 中说出：`MeaXure`、`Sketch`、`MasterGo`、`大屏还原`、`驾驶舱`、`sketch-to-vue` 即可触发。

---

## Roadmap

- [ ] Track D: Figma export support
- [ ] Auto-generate ECharts mock data from design annotations
- [ ] VS Code extension for one-click conversion
- [ ] Web UI for non-technical designers

---

## Contributing

PRs and Issues are welcome! Before submitting:
1. Run `cd scripts && node test-all.mjs` — all tests must pass
2. New scripts need a corresponding `test-xxx.mjs`
3. Doc changes must update line references in `references/reading-guide.md`

---

## License

Copyright (c) 2026 **chenboxun87** · [https://github.com/chenboxun87/sketch-to-vue](https://github.com/chenboxun87/sketch-to-vue)

Licensed under [CC BY-NC-ND 4.0](LICENSE).

✅ Free for personal & non-commercial use with attribution  
❌ No commercial use · No derivative redistribution · No republishing as your own work

---

<div align="center">

**If this project saves you time, please give it a ⭐ Star!**  
It helps more developers discover this tool.

[⭐ Star on GitHub](https://github.com/chenboxun87/sketch-to-vue) · [🐛 Report Issue](https://github.com/chenboxun87/sketch-to-vue/issues) · [💡 Request Feature](https://github.com/chenboxun87/sketch-to-vue/issues)

</div>
