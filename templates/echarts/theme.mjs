/**
 * templates/echarts/theme.mjs
 *
 * 大屏暗色主题 token（字号为设计像素，组件在画板坐标内渲染后整体缩放）。
 * 消费侧（Index.vue）在画板坐标系初始化 ECharts，CSS transform:scale 负责缩放。
 */

// ── 调色板（默认）────────────────────────────────────────────────────────────
// 优先使用 zone.palette（从设计稿假柱色提取），仅当 zone 未提供时使用此兜底色
export const themeColors = [
  '#1DE4FF',  // 青色
  '#47FF8C',  // 绿色
  '#FFD24C',  // 黄色
  '#FF7855',  // 橙色
  '#B678FF',  // 紫色
  '#5AAFFF',  // 蓝色
]

// ── 样式 token ───────────────────────────────────────────────────────────────
export const T = {
  axisLabel:  { color: 'rgba(180,225,255,0.75)', fontSize: 22 },
  axisName:   { color: 'rgba(170,210,255,0.6)',  fontSize: 20 },
  axisLine:   { lineStyle: { color: 'rgba(73,200,255,0.30)' } },
  splitLine:  { lineStyle: { color: 'rgba(73,200,255,0.10)', type: 'dashed' } },
  legendText: { color: 'rgba(200,235,255,0.9)',  fontSize: 22 },
  grid:       { left: 8, right: 8, top: 64, bottom: 28, containLabel: true },
}

/**
 * 竖向渐变占位符（需调用 resolveGradients 才能变成 LinearGradient 实例）。
 *
 * 使用方式：
 *   itemStyle: { color: vGradient('#00EAFF', 'rgba(0,234,255,0.05)') }
 *
 * 消费侧：
 *   import { resolveGradients } from '<skill>/templates/echarts/index.mjs'
 *   chart.setOption(resolveGradients(option, echarts), true)
 */
export function vGradient(from, to) {
  return { __gradient: 'v', stops: [from, to] }
}
