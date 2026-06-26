// 几何反推图表数据值（仅 bar/line/area，dataSource:"geom"）。
// 反推不可靠（雷达/桑基）时调用方应改用 mock，并标 dataSource:"mock"。

/**
 * 柱高 → 数值。value = barHeightPx / pxPerUnit
 * @param {Array<{rect}>} bars
 * @param {{baselineY:number, pxPerUnit:number}} cal  pxPerUnit = 轴像素跨度 / 轴量程
 */
export function deriveBarData(bars, cal) {
  return bars
    .slice()
    .sort((a, b) => a.rect.x - b.rect.x)
    .map((b) => b.rect.h / cal.pxPerUnit)
}

/**
 * 折线点 → 数值。value = (baselineY - pointY) / pxPerUnit
 * @param {Array<{x,y}>} pts
 * @param {{baselineY:number, pxPerUnit:number}} cal
 */
export function deriveLineData(pts, cal) {
  return pts
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((p) => (cal.baselineY - p.y) / cal.pxPerUnit)
}
