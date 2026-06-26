# symmetricKpi fixtures

最小合成场景，供 `test-detect-symmetric-module-gaps.mjs` 回归规则 62 检测逻辑。

| 目录 | 场景 | 期望 |
|------|------|------|
| `disposition-mismatch/` | panel12 行 `矩形背景 2` slice + panel11 行 `矩形备份 5` shape + isometric 矢量 icon | `dispositionMismatches≥1`、`iconGaps≥1`、脚本 exit 1 |
| `consistent-slice/` | 两行均为 `矩形背景 2` + `编组 40` slice | 无 disposition/icon 问题；`gaps` 可能非零（第三 panel 无 KPI 属正常） |

坐标与 pitch（282）取自某大屏驾驶舱真实案例的简化版，不内嵌完整 `_all_elements.json`。
