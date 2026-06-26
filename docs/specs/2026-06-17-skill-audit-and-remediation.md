# design-to-vue 技能整体审计与修复方案

> **审计日期**：2026-06-17
> **审计范围**：`~/.claude\skills\design-to-vue\` 全量（SKILL.md + 19 个 references/*.md + 49 个脚本 + templates + sync）
> **审计目标**：在保证低阶模型也能优秀完成任务的前提下，查冗余 / 残缺 / 缺陷 / 漂移，谨慎优化、绝不误删有价值内容。
> **方法**：2 个只读探查代理（脚本完整性 + 文档交叉引用）+ 人工核实最高危项。
> **决策**：用户选择修复全部四级（第三级删除逐项确认）。

---

## 核心结论

- 技能体量大、内容活跃、质量高，**不存在需要为"精简"而删减的有价值内容**。
- 对低阶模型危害最大的是**矛盾型重复**（同一规则不同结论）与**导航漂移**（计数滞后、失效指针、新规则未进触发表）。
- 分层冗余（SKILL 速查 + references 详解）是**有益的**，应保留。
- 优化主轴 = **消歧 + 补导航 + 谨慎清理**，而非"删内容"。

---

## 🔴 第一级：正确性缺陷（会让低阶模型产出错误代码）

### T1-1　规则 39 ⟷ 规则 49 直接矛盾（slice transform）— 最高危
- **证据**：`hard-won-rules.md:716-739`（规则 39）说"切片必须应用 `transform: scaleX(-1)`，漏掉会方向错误"；`hard-won-rules.md:988-1011`（规则 49）说"transform 已烘焙进 PNG，必须 `delete transform`，再施加=二次变换"。**同一案例 `位图备份 11`，结论相反**。
- **连带**：`SKILL.md:249`（禁止事项 32）仍指向旧规则 39 的"必须应用 css 含 transform"。
- **根因**：这是 2026-06-17 早些时候修复左/右括号 bug 时的认知迭代——当时改了 `scene-graph-consumption-pitfalls.md` 的 2-B 并新增规则 49，但未回头清算规则 39。
- **修复方案**：重写规则 39——区分 slice（剔除几何 transform，保留 opacity/blend）与 vector（保留 transform）；指向规则 49。同步改 SKILL 禁止事项 32 表述。
- **状态**：✅ 已修复

### T1-2　"preview 降级兜底" ⟷ "禁止裁预览"矛盾
- **证据**：`SKILL.md:230`（禁止 13）、`hard-won-rules.md` 规则 12 写"补导出或 preview 降级兜底"；`SKILL.md:233-234`（禁止 16/17）与 meaxure-track §3.9 全文写"禁止裁预览，缺源留空报备 `_missing_assets.json`"。
- **根因**：前者是 §3.9 之前的残留表述。
- **修复方案**：将禁止 13 与规则 12 的"preview 降级兜底"改为与现行政策一致的"留空 + 报备"，明确 preview 仅作验证基准。
- **状态**：✅ 已修复

### T1-3　reading-guide 阶段编号与 meaxure-track 语义错位
- **证据**：`reading-guide.md:109` "阶段1=静态基线"→ 指向 meaxure-track "阶段1"，但 `meaxure-track.md:667` 的"阶段1=数据提取"，静态基线实为"阶段2"。
- **危害**：低阶模型按 reading-guide 读"阶段1"会读到数据提取脚本，而非静态基线 HTML。
- **修复方案**：reading-guide 阶段表与 meaxure-track 真实阶段对齐，或显式给出映射。
- **状态**：✅ 已修复

---

## 🟠 第二级：导航漂移（低阶模型找错路/漏读新内容）

### T2-1　计数全面滞后
| 位置 | 声称 | 实际 |
|---|---|---|
| `SKILL.md:216` | 禁止事项 24 条 | 39 条 |
| `SKILL.md:289` | hard-won-rules 48 条 | 51 条 |
| `hard-won-rules.md:1` | 标题"20 条" | 51 条 |
| `reading-guide.md:215` | "~900 行（48 条）" | 1044 行，51 条 |
| `anti-patterns.md:1` | 25 条 | 26 条 |
| `anti-patterns.md:7` | 架构类 7 条 | 8 条 |
| `SKILL.md:290`/`scene-graph-consumption-pitfalls.md:32` | 消费遗漏 7 类 | 5 类（2-A~2-E） |
| `SKILL.md:295` | translate-recipe 5 种 pattern | 6 种 |
| `meaxure-track.md:1142` | 完整表 ~40 条 | visual-diff 实际 45 条 |
- **状态**：✅ 已修复

### T2-2　规则 49/50/51 未进 SKILL/reading-guide 触发表
- **证据**：`SKILL.md:148,289`、`reading-guide.md:23` 只写到"规则 43-48"。最新三条（49 transform / 50 资产确定性 / 51 椭圆 border-radius）低阶模型不会被导航到。
- **状态**：✅ 已修复

### T2-3　规则 51 排在规则 50 之前（文件内顺序乱）
- **证据**：`hard-won-rules.md:1013` 规则 51 在 `1033` 规则 50 之前。
- **状态**：✅ 已修复（调整为升序）

### T2-4　失效章节名指针
- **证据**：`SKILL.md:118`/`reading-guide.md:58,158` 引用 `coordinate-system.md` §「嵌入 BasicLayout 模式/公式」——实际标题为 `## CONTENT_SHIFT 处理`、`## 自适应缩放四模式`、`## 核心公式`；`reading-guide.md:157,159` 引用 `hard-won-rules.md` §「文件名陷阱」「背景/样式覆盖」——不存在。
- **状态**：✅ 已修复

### T2-5　死文档链接
- **证据**：`SKILL.md:262` 指向 `docs/superpowers/specs/2026-06-15-...-design.md`，该文件不在技能包内。
- **状态**：✅ 已修复

### T2-6　引用了不存在的脚本
- **证据**：`hard-won-rules.md:213,216` 引用 `check-app-ready.mjs`；`meaxure-track.md:947` 引用 `sketch-meaxure-emit-html.test.mjs`——均不存在。
- **状态**：✅ 已修复

### T2-7　行数估算大面积过时
- **证据**：`reading-guide.md` 体积参考表中 SKILL 260→302、translate-recipe 200→389、element-recognition 100→174、coordinate-system 80→198、scene-graph-pitfalls 200→458、meaxure-track 1350→1422 等。
- **状态**：✅ 已修复

---

## 🟡 第三级：冗余/清理（用户「遵从推荐」，逐项处置）

| # | 项 | 证据 | 处置 | 状态 |
|---|---|---|---|---|
| T3-1 | 孤儿脚本 `gen-kpi-overlays.mjs` | 硬编码 V4 驾驶舱绝对路径，零引用 | **泛化保留**：去硬编码→命令行参数（`--elements/--board/--out/--exclude/--num`），保留全部价值逻辑（前导数字过滤/去重/碎片抑制/环带背景采样）+ 补 SKILL 脚本文档 | ✅ |
| T3-2 | 孤儿脚本 `mastergo_utils.py` | 零 import，逻辑已内联进 `mastergo_get_dsl.py` | **删除** | ✅ |
| T3-3 | `fetch-mg-dsl.mjs` / `verify-mg-g9.mjs` | 无文档但有用（G9 验证 / DSL Node 包装） | **保留 + 补进 SKILL 脚本参考**（C 轨道 fetch-mg-dsl、B 轨道 G9 verify） | ✅ |
| T3-4 | `sync/checksum.txt` 陈旧 | 缺 10+ scene-graph 时代脚本 | **由 sync-to-cursor.ps1 重新生成**（收尾步骤一次性） | ✅ |
| T3-5 | 占位符残留 | `visual-diff-root-cause.md:138` "（待填）"空行 | **保留**：是「项目专属根因扩展」节由 AI 后续填写的模板脚手架，删了反而丢格式示例 | ✅（保留） |
| T3-6 | `crop-from-preview.mjs` 已废止仍留仓 | hard-won-rules 标注废止 | **保留**（规则 13 历史教训引用） | ✅（保留） |

---

## 🟢 第四级：测试覆盖缺口

核心 CLI 缺独立测试：`extract-meaxure.mjs`、`emit-html.mjs`、`audit-slice-assets.mjs`、`emit-mastergo-html.mjs`、`extract-mastergo-css.mjs`。

- **已补**：`test-extract-meaxure.mjs`（10 断言，覆盖 `let data` 括号深度解析/rect 归一化/exportable→exports/z 序）、`test-emit-html.mjs`（7 断言，覆盖 text/shape/slice 渲染 + 参考图切片排除）。这两个是 A 轨道核心「提取→静态基线」链路，且 meaxure-track 文档已引用 `test-emit-html.mjs`。两者均被 `test-all.mjs` 自动聚合，回归全绿。
- **后续跟踪（未补，原因：需较重 MasterGo/资产夹具，强造测试脆弱且低价值）**：`audit-slice-assets.mjs`、`emit-mastergo-html.mjs`、`extract-mastergo-css.mjs`。建议后续配真实 B 轨道 pilot 夹具时补集成测试。
- **状态**：✅ 核心两项已补 + 回归通过；3 项 B 轨道集成测试登记为后续跟踪。

---

## 追加清理：node_modules 瘦身（2026-06-17）

- **删除 `scripts/node_modules/playwright` + `playwright-core` + .bin 残留**（17.4MB → 0.6MB，释放 ~16.8MB）。依据：
  - `scripts/package.json` 只声明 `pngjs`，playwright 是**未声明的孤儿包**（临时 `npm install` 残留）。
  - 唯一使用者 `verify-mg-g9.mjs` 用**惰性 `await import('playwright')` + try/catch**，缺失时优雅提示 `npm install -D playwright && npx playwright install chromium`，按需重装即可。
  - chromium 浏览器二进制本就不在 node_modules（需另跑 `playwright install`），故该包单独存在并不可用。
  - `node_modules` 不参与 Cursor 同步（sync-to-cursor.ps1 与 checksum 均排除），删除不影响双端一致性。
- **保留 `scripts/node_modules/pngjs`**（0.6MB）——`gen-kpi-overlays` / `test-emit-html` / `extract-all-elements` / `detect-slice-blend` / `enrich-mg-frame-png` 等依赖。删除后跑 `test-emit-html.mjs` 仍 7/7 通过。
- **顶层 `node_modules/pngjs`（0.6MB）**：冗余副本（无根级消费者，所有 pngjs 引用都在 scripts/ 下），可选删除，影响微小，暂留。

---

## 回归验证

`node scripts/test-all.mjs` → **ALL test files passed**（exit 0，含新增 2 个测试，2026-06-17）。
全部 35 个 test-*.mjs 由 test-all 自动扫描聚合，无遗漏。

---

## 附：审计代理原始产出存档

- 脚本完整性审计代理：49 源脚本中 4 孤儿（gen-kpi-overlays / fetch-mg-dsl / verify-mg-g9 / mastergo_utils）；2 处引用缺失文件；test-all.mjs 自动聚合全部 32 测试；图表检测与 MeaXure 提取为 intentional 双轨。
- 文档交叉引用审计代理：计数漂移多处；规则 39↔49 矛盾；preview 降级↔禁止裁预览矛盾；reading-guide 阶段语义错位；失效 § 指针若干。

> 本文件为审计与修复的**唯一事实来源**。每完成一项，更新对应"状态"。
