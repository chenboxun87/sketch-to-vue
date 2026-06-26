# design-to-vue 安全说明

本 skill 为**本地设计还原工具链**，不收集用户数据、不持久化密钥、不访问用户项目以外的路径（除非你在命令行显式传入）。

## 包结构（SKILL.md 显式索引）

| 目录 | 用途 | 入口 |
|------|------|------|
| `scripts/` | 提取、审计、图表特征、MasterGo 包装器 | `SKILL.md` →「脚本快捷参考」；聚合测试 `node scripts/test-all.mjs` |
| `references/` | 分阶段规则与踩坑文档 | `SKILL.md` →「参考文档索引」；导航 `references/reading-guide.md` |
| `templates/` | Vue/ECharts/共享样式模板 | `templates/vue/README.md`、`templates/shared/*.mjs` |
| `assets/` | 可复制的 JSON 模板（如对称 KPI clone 规格） | `assets/symmetric_module_clones.template.json` |
| `docs/fixtures/` | 中性化回归夹具 | `docs/fixtures/sceneGraph/README.md` |
| `docs/plans/`、`docs/specs/` | **可选**内部开发记录，运行 skill 不必读 | 各目录 `README.md` |
| `sync/` | Claude ↔ Cursor 双端同步 | `sync/INSTALL.md` |

## 网络出站（唯一会主动联网的脚本）

| 脚本 | 何时联网 | 目标 | 凭证 |
|------|---------|------|------|
| `scripts/mastergo_get_dsl.py` | C 轨道拉 DSL | **仅** `https://mastergo.com`（或 `MASTERGO_ENDPOINT` 同域） | `MASTERGO_TOKEN` / `--token` |
| `scripts/mastergo_fetch_docs.py` | DSL 返回的组件文档链接 | **HTTPS 公网**；阻断 localhost / 私网 / 元数据地址（SSRF） | 无 |
| `scripts/fetch-mg-dsl.mjs` | 包装上述 Python | 不直接联网 | 同上 |
| `scripts/extract-mastergo-all.mjs` | 仅 `--fetch-dsl` 时 | 经 Python 同上 | 同上 |

**默认 A/B 轨道（MeaXure / MasterGo 导出包）全程离线**，只读写你传入的 `index.html`、`assets/`、`FILE_DATA.json`。

文档中的 `curl http://localhost:...` 仅为**本地 dev server 探针示例**，脚本不会自动执行。

## 环境变量（测试 / 可选功能）

| 变量 | 用途 | 是否必需 |
|------|------|---------|
| `MASTERGO_TOKEN` | MasterGo API（C 轨道） | 仅 C 轨道 |
| `MASTERGO_ENDPOINT` | 覆盖 API 根（须仍为 mastergo.com 域） | 否 |
| `D2V_FIXTURE_SRC` | 集成测试用外部 MeaXure 目录 | 否；未设则 SKIP |
| `D2V_HINT_FIXTURE_CHROME` / `D2V_HINT_FIXTURE_PLAIN` | 宿主布局 hint 测试 | 否；未设则 SKIP |
| `DESIGN_TO_VUE_SKILL_ROOT` | 覆盖 skill 根目录（同步脚本） | 否；默认 `$HOME/.claude/skills/design-to-vue` |

**禁止**将 token 写入 skill 包或提交到 Git；仅通过 shell 环境或 `--token` 传入。

## 子进程与依赖

| 能力 | 实现 | 说明 |
|------|------|------|
| 测试聚合 | `test-all.mjs` → `child_process.execSync` | 仅执行本包 `scripts/test-*.mjs` |
| MasterGo DSL | `spawnSync('python', ...)` | 调用同目录 `.py`，不下载任意代码 |
| Base64 解码 | `extract-all-elements.mjs` 等 | 仅解码 MeaXure 标注内嵌 PNG，非混淆 |
| Playwright（可选） | `verify-mg-g9.mjs` | **未列入默认依赖**；缺失时 exit 并提示安装，不影响 A 轨道 |

安装脚本依赖：`cd scripts && npm install`（仅 `pngjs`）。Playwright 按需：`npm install -D playwright`（见 `verify-mg-g9.mjs` 提示）。

## 路径与「Agent 记忆」误报

文档中的 `~/.claude/skills/design-to-vue` 表示**本 skill 的全局安装位置**，不是读取其他 Agent 记忆。同步脚本使用 `$env:USERPROFILE` 或 `DESIGN_TO_VUE_SKILL_ROOT`，可设环境变量指向任意克隆目录。

## 报告安全问题

若发现 skill 包内存在硬编码密钥、非 MasterGo 的未文档化出站请求、或 SSRF 绕过，请提 Issue 并附文件路径与复现命令。
