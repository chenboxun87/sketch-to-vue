# 对称 KPI 卡片：视觉一致 vs 导出一致（规则 62 实操）

> **触发**：用户反馈「Sketch 标注两侧指标率背景/图标一致，页面上一侧正常、一侧异常」；或 clone 后卡片出现在**错误业务区块**（如模块C表格上）。

---

## 决策树（Implement 前 3 分钟）

```
两侧 KPI 视觉不一致
│
├─ 目标区 shape/slice 数量 = 0？
│    └─ YES → 漏导：按 panelPitch 镜像**正确模板行**（见下）
│
├─ 目标区有层但 icon/背景不对？
│    └─ YES → **处置不一致**（非 CSS bug）：
│         1. 找「视觉正确」参考行（常为 slice：矩形背景 2 + 编组 40）
│         2. excludeNativeIds 隐藏错误原生层（常为 vector：矩形备份 5 + isometric）
│         3. 镜像参考行 dy = 正确行.y − 参考行.y（常为 282）
│
└─ clone 出现在错误区块？
     └─ YES → dy 锚点错：勿用「上一行 KPI.y + pitch」落到下一 panel
              用「参考行 → 目标行」同一 KPI 槽位偏移
```

---

## 某大屏驾驶舱案例（已验证）

| 业务区块 | Panel 带 | KPI 槽 y | Sketch 应有 | MeaXure 原生 | 正解 |
|---------|----------|----------|-------------|--------------|------|
| 模块A分析 | panel12 @94 | **261** | 矩形背景2 + 编组40 slice | ✅ 一致 | 保持 layer_stack |
| 模块B分析 | panel11 @376 | **543** | 与上行一致 | ❌ 矩形备份5 + 矢量 isometric | **exclude 原生 + clone panel12 @ dy=282** |
| 模块C分析 | panel10 @658 | — | 无指标率卡片 | 无 | **禁止** clone 落 y≈825 |

**错误路径（已废弃）**：把 panel11 栈 `+282` → y=825，卡片叠在模块C表格（用户A y≈786–882）。

**正确路径**：

```json
{
  "excludeNativeIds": ["794DF122…矩形备份5", "738A4138…", "…路径9…", "FFAAAFEE…"],
  "specs": [{
    "dy": 282,
    "sourceElementIds": [
      "DDDB1F87…矩形背景2",
      "EFF97453…编组40",
      "FADC6150…指标率", "D5D2EA09…22", "74E2424B…%"
    ],
    "zOverrideBySourceId": { "DDDB1F87…": 241, "EFF97453…": 246, … }
  }]
}
```

Implement 要点：

- `KPI_OVERRIDE_EXCLUDE_IDS` 在 `renderLayers` 过滤原生层
- `_symmetric_module_clones.json` 生成 clone 层 concat 进 `_ALL_LAYERS`
- `sourceElementIdForLayer`：**最长 idSuffix 优先**（避免 `-incr-kpi-icon` 被 `-incr-kpi` 截断）
- clone 的 slice 须 `zOverrideBySourceId`（源 slice z≈173 会被 panel 内容压住）

---

## 勿混淆的层

| 层 | x≈ | 作用 | 能否当卡片 icon |
|----|-----|------|----------------|
| `编组 40` slice | 2341 | 卡片内层叠 icon | ✅ |
| `kpi-icon-backup` slice | 2153 | 左侧列辅助 icon | ❌ 盒状，非卡片 icon |
| 表头文字「指标率」 | 2474 @754 | 表格列名 `#D9E7FF` | ❌ 非 KPI 卡片 |

---

## 自检命令

```bash
# 1. 对称漏导 / 处置不一致
node <skill>/scripts/detect-symmetric-module-gaps.mjs <outDir>/_all_elements.json

# 2. 回归（技能包内 fixture，无需真实设计稿）
node <skill>/scripts/test-detect-symmetric-module-gaps.mjs

# 3. 数 KPI 槽位（168×83 + 编组40）
node -e "
const {elements}=require('./_all_elements.json');
const cards=elements.filter(e=>(e.name==='矩形备份 5'||e.name==='矩形背景 2'));
console.log(cards.map(c=>c.name+' @'+c.rect.y));
"
```

---

## 与 extract 的关系

- extract **不必**强行合并两种 KPI 实现；Implement 侧用 `excludeNativeIds + clone` 即可审计
- 若可改 Sketch：统一为 slice 或统一为 symbol，减少 override 配置
