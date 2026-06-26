# Skill 内容中立性规范

design-to-vue 是**跨项目、跨行业**的还原 skill。以下内容只应出现在**用户项目**的 `outDir/` 或任务对话中，**不得**写入 skill 包内的 `.md` / `.mjs` / 模板（测试与 fixture 除外，且 fixture 须中性化）。

## 禁止写入 skill 包

| 类别 | 反例 | 应改为 |
|------|------|--------|
| 业务指标/行业文案 | `行业专有指标名称`、`政策目标词`、`行业KPI` | `feature-a`、`指标标签`、`Metric Label` |
| 真实项目模块名 | `myCompanyCockpit`、`my-web`（作唯一示例） | `<module>`、`my-dashboard` |
| 真实画板尺寸作默认值 | 默认 `6880×1462` 写死在脚本 fallback | 从 `_all_elements.json` 读；fallback 用 `1920×1080` |
| 真实项目坐标 | `rect: { x: 5000, y: 500, … }` 从某次交付复制 | 测试用最小 rect（如 `10,10,48,48`），仅验证算法 |
| 真实案例段落 | 「某功能修复前 67 缺口…」 | 「两阶段脚本 + curl 探针验证」 |

## 允许保留

- **MeaXure 导出惯例名**：`BG备份.png`、`编组 40`、`位图备份 11`（工具链通用，非某客户业务）
- **算法常量**：`SMALL_GHOST_AREA_RATIO = 0.35`、Jaccard 阈值
- **框架/工具指称**：`Vue 2`、`ECharts`、`resolveStaticPublicUrl`（技术中性）
- **docs/fixtures/** 下简化几何：可用小整数 rect，但不含客户专有名词

## 测试脚本约定

1. 资产文件名：`icon/feature-a.png`、`backdrop.png`
2. 画板：独立常量 `FIXTURE_BOARD = { w: 800, h: 600 }`，与生产默认值解耦
3. 文本邻近匹配测试：用 `Feature Label B` ↔ `icon/feature-label-b.png`，不用真实 KPI 名
4. 新增回归时 **禁止** 从 `_all_elements.json` 复制真实 elementId/rect（除非放入 `docs/fixtures/<name>/` 并去标识化）

## 文档中的「案例」

- `references/symmetric-kpi-override.md` 等**模式文档**可保留「某驾驶舱曾出现」的叙述，但应标注为 *historical pattern*，且不得作为 skill 默认常量来源。
- `hard-won-rules.md` 新规则只用占位符路径（`icon/foo.png`）。

## 自检命令

```bash
# 在 skill 根目录：不应命中客户/行业专有词（可按需扩展 pattern）
rg -n "myCompanyCockpit|行业专有词|项目专有名|my-web" references scripts templates SKILL.md \
  --glob '!docs/**' --glob '!**/symmetric-kpi-override.md'
```

命中项须改为占位符或移到 `docs/fixtures/` / 用户项目。
