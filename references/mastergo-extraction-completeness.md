# MasterGo B 轨道：零推断 · 提取完整性

## 核心原则（与 SKILL 铁律一致）

1. **禁止推断补全**：不得用几何位置、尺寸阈值、对齐方式等猜测圆角/渐变/布局。
2. **只消费 FILE_DATA 显式字段**：`cornerRadius`、`rectangleCornerRadii`、`fills`、`strokes`、`effects`、`gradientHandlePositions`、`type` 等。
3. **信息不足 = extract 不足**：缺口须通过 **加强解析**、**设计稿 export 切片** 或 **MCP get_dsl** 解决，而非 CSS 猜测。
4. **允许的类型映射**（非推断）：`type:ELLIPSE` → `border-radius:50%`（MasterGo 显式声明的图元类型）。

---

## FILE_DATA 已知缺口（实测）

| 现象 | FILE_DATA 现状 | 正确补全路径 |
|------|----------------|-------------|
| `cornerRadius: Symbol(mg.mixed)` + `rectangleCornerRadii: [null,null,null,null]` | 无数值、无 vectorNetwork | 该层 **export PNG**、**帧 PNG 裁剪**（`data/{frameId}.png`）或 **MCP DSL** |
| `isMaskOutline: true` 的 PEN | 无路径数据 | 同上 |
| `strokes[].isVisible: false` | 有数据，须过滤 | normalize 已消费 |
| `gradientHandlePositions` | 有数据 | `mgGradientToCss` 已消费 |

Pilot 帧「示例弹窗帧」中 **无 export 的 mixed PEN**：

- `11:6508` 用户气泡
- `11:7917` 历史步骤侧栏

→ extract 报 **`STYLE_DATA_INCOMPLETE`（high）**，`audit ok: false`，直至设计稿补 export。

---

## 消费策略（无推断版）

```
有 export PNG 且磁盘存在？
  ├─ 是 → renderAs: img（视觉与 MasterGo 渲染一致）
  └─ 否 → FILE_DATA 有完整 fills/strokes/radius？
           ├─ 是 → renderAs: div + mgStyle CSS
           └─ 否 → styleGaps high + audit 失败
```

**禁止**：面积阈值猜 slice、头像位置猜圆角、侧栏尺寸猜 `0 8px 8px 0`。

---

## 闸门

| 闸门 | 条件 | 动作 |
|------|------|------|
| G8 | `_mg_consume_audit.json` → `ok: true` | 才允许 Vue 实现 |
| G8-style | `STYLE_DATA_INCOMPLETE` | 设计在 MasterGo 为 listed id 勾选 export → 重跑 extract |
| G8-infer | `INFERRED_STYLE_FORBIDDEN` | 代码回退，不得存在 `borderRadiusMeta.source=inferred` |
| G9 | emit-baseline vs Vue CDP | 像素验收 |

```bash
node scripts/extract-mastergo-all.mjs --dir "..." --frame "..." --out "<pilot>/data"
node -e "const a=require('./data/_mg_consume_audit.json'); console.log(a.ok, a.blockers)"
```

---

## 设计侧操作（mixed PEN 必做）

在 MasterGo 中选中 `11:6508`、`11:7917` → 导出设置 → PNG @1x → 重新导出包 → 重跑 extract。

或使用 C 轨道：

```bash
python scripts/mastergo_get_dsl.py "<mastergo-url>" > dsl.json
```

将 DSL 中的圆角/路径合并进 extract：`node extract-mastergo-all.mjs ... --dsl dsl.json`

**帧 PNG 补全（已实现）：** extract 自动从 `data/{frameId}.png` 裁剪 styleGap 图层 → `data/{nodeId}.png`（MasterGo 官方帧渲染像素，非推断）。禁用：`--no-frame-png`。

---

## 开发约束

- 新增样式逻辑：**必须**对应 FILE_DATA 字段路径，写进 `MG_CONSUMED` 与单元测试。
- 禁止新增 `infer*` 函数；code review 关键字：`infer`、`heuristic`、`guess`、`fallback`（样式类）。
- `_style_overrides.json` 仅用于 **人工核对后** 的显式覆盖，不是默认流程。
