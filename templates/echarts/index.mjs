/**
 * templates/echarts/index.mjs
 *
 * 通用 ECharts option 构建器（业务无关，支持 8 种图表类型）。
 *
 * 消费方式（Vue 2/3 项目内）：
 *   import { buildOption } from '<skill>/templates/echarts/index.mjs'
 *   const option = buildOption(zone)  // zone 来自 _chart_zones.json 的单条记录
 *
 * 渐变处理：
 *   buildOption 返回的 option 中，渐变色以 {__gradient:'v', stops:[from,to]} 占位。
 *   Vue 消费侧在调用 chart.setOption 前必须调用 resolveGradients(option) 转换，
 *   该函数在本文件末尾导出。
 *
 * 调色板优先级：
 *   zone.palette（从设计稿假柱提取）> zone.legend[].color > 主题默认色
 */

import { T, vGradient, themeColors } from './theme.mjs'

// ── 工具函数 ────────────────────────────────────────────────────────────────

/** 从 zone.palette 或 zone.legend 获取第 i 个系列颜色，兜底主题色 */
function seriesColor(zone, i) {
  return (
    (zone.palette && zone.palette[i]) ||
    (zone.legend  && zone.legend[i] && zone.legend[i].color) ||
    themeColors[i % themeColors.length]
  )
}

/** 带渐变的柱色（从纯色到近透明，用于单柱系列） */
function fadedBar(color) {
  return vGradient(color, 'rgba(255,255,255,0.04)')
}

/** 从 zone.legend 或 zone.seriesNames 生成图例数组 */
function buildLegendNames(zone) {
  if (zone.legend && zone.legend.length > 0) return zone.legend.map((l) => l.name)
  if (zone.seriesNames)                       return zone.seriesNames
  return []
}

// ── 单/双轴柱图 ─────────────────────────────────────────────────────────────

function barOption(zone, dual) {
  const seriesList = zone.series && zone.series.length > 0
    ? zone.series
    : [{ name: 'Series A', data: mockBarData(zone.categories?.length || 6) }]

  const yAxis = dual
    ? [
        { type: 'value', max: zone.axis?.yLeft?.max,  name: zone.axis?.yLeft?.unit,  nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine },
        { type: 'value', max: zone.axis?.yRight?.max, name: zone.axis?.yRight?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: { show: false } },
      ]
    : { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine }

  return {
    backgroundColor: 'transparent',
    grid:    T.grid,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend:  { top: 8, left: 'center', itemWidth: 20, itemHeight: 12, itemGap: 24, textStyle: T.legendText, data: buildLegendNames(zone) },
    xAxis:   { type: 'category', data: zone.categories || [], axisLabel: T.axisLabel, axisLine: T.axisLine, axisTick: { show: false } },
    yAxis,
    series: seriesList.map((s, i) => ({
      name:       s.name || `Series ${i + 1}`,
      type:       'bar',
      barWidth:   dual ? 18 : 14,
      yAxisIndex: s.yAxisIndex || 0,
      data:       s.data || mockBarData(zone.categories?.length || 6),
      itemStyle:  { color: fadedBar(seriesColor(zone, i)), borderRadius: [3, 3, 0, 0] },
    })),
  }
}

// ── 分组柱图（每系列独立颜色，不共享渐变）────────────────────────────────────

function groupBarOption(zone) {
  const seriesList = zone.series && zone.series.length > 0
    ? zone.series
    : defaultGroupBarSeries(zone)

  return {
    backgroundColor: 'transparent',
    grid:    T.grid,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend:  { top: 8, left: 'center', itemWidth: 20, itemHeight: 12, itemGap: 24, textStyle: T.legendText, data: seriesList.map((s) => s.name) },
    xAxis:   { type: 'category', data: zone.categories || [], axisLabel: T.axisLabel, axisLine: T.axisLine, axisTick: { show: false } },
    yAxis:   { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine },
    series: seriesList.map((s, i) => {
      const color = s.color || seriesColor(zone, i)
      return {
        name:      s.name || `Series ${i + 1}`,
        type:      'bar',
        barWidth:  12,
        barGap:    '10%',
        data:      s.data || mockBarData(zone.categories?.length || 6),
        itemStyle: { color: vGradient(color, `${color}22`), borderRadius: [2, 2, 0, 0] },
      }
    }),
  }
}

function defaultGroupBarSeries(zone) {
  const count = Math.max(2, (zone.palette || []).length || 2)
  return Array.from({ length: count }, (_, i) => ({
    name:  (zone.legend?.[i]?.name) || `Series ${String.fromCharCode(65 + i)}`,
    color: seriesColor(zone, i),
    data:  mockBarData(zone.categories?.length || 6),
  }))
}

// ── 折线 / 面积图 ────────────────────────────────────────────────────────────

function lineOption(zone, area) {
  const seriesList = zone.series && zone.series.length > 0
    ? zone.series
    : [{ name: 'Series A', color: seriesColor(zone, 0), data: mockLineData(zone.categories?.length || 6) }]

  return {
    backgroundColor: 'transparent',
    grid:    T.grid,
    tooltip: { trigger: 'axis' },
    legend:  { top: 8, left: 'center', itemWidth: 22, itemHeight: 12, itemGap: 28, textStyle: T.legendText, data: seriesList.map((s) => s.name) },
    xAxis:   { type: 'category', boundaryGap: false, data: zone.categories || [], axisLabel: T.axisLabel, axisLine: T.axisLine, axisTick: { show: false } },
    yAxis:   { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine },
    series: seriesList.map((s, i) => {
      const color = s.color || seriesColor(zone, i)
      return {
        name:       s.name || `Series ${i + 1}`,
        type:       'line',
        smooth:     true,
        symbol:     'circle',
        symbolSize: 6,
        connectNulls: false,
        data:       s.data || mockLineData(zone.categories?.length || 6),
        lineStyle:  { color, width: 3 },
        itemStyle:  { color },
        ...(area ? { areaStyle: { color: vGradient(color, 'rgba(255,255,255,0.02)') } } : {}),
      }
    }),
  }
}

// ── 双折线（实际 vs 预测/目标，第 2 条用虚线区分）──────────────────────────

function dualLineOption(zone) {
  const color0 = seriesColor(zone, 0)
  const color1 = seriesColor(zone, 1)
  const n = zone.categories?.length || 6

  const seriesList = zone.series && zone.series.length >= 2
    ? zone.series.slice(0, 2)
    : [
        { name: zone.legend?.[0]?.name || 'Actual',    color: color0, data: mockLineData(n) },
        { name: zone.legend?.[1]?.name || 'Projected', color: color1, data: mockLineData(n) },
      ]

  return {
    backgroundColor: 'transparent',
    grid:    T.grid,
    tooltip: { trigger: 'axis' },
    legend:  { top: 8, left: 'center', itemWidth: 22, itemHeight: 12, itemGap: 28, textStyle: T.legendText, data: seriesList.map((s) => s.name) },
    xAxis:   { type: 'category', boundaryGap: false, data: zone.categories || [], axisLabel: T.axisLabel, axisLine: T.axisLine, axisTick: { show: false } },
    yAxis:   { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine },
    series: seriesList.map((s, i) => {
      const color = s.color || seriesColor(zone, i)
      return {
        name:       s.name,
        type:       'line',
        smooth:     true,
        symbol:     'circle',
        symbolSize: 6,
        data:       s.data || mockLineData(n),
        lineStyle:  { color, width: 3, type: i === 1 ? 'dashed' : 'solid' },
        itemStyle:  { color },
        areaStyle:  i === 0 ? { color: vGradient(color, 'rgba(255,255,255,0.01)') } : undefined,
      }
    }),
  }
}

// ── 多系列折线（3+ 条，无面积填充）──────────────────────────────────────────

function multiLineOption(zone) {
  const n = zone.categories?.length || 6
  const seriesList = zone.series && zone.series.length >= 3
    ? zone.series
    : defaultMultiLineSeries(zone, n)

  return {
    backgroundColor: 'transparent',
    grid:    T.grid,
    tooltip: { trigger: 'axis' },
    legend:  { top: 8, left: 'center', itemWidth: 22, itemHeight: 12, itemGap: 28, textStyle: T.legendText, data: seriesList.map((s) => s.name) },
    xAxis:   { type: 'category', boundaryGap: false, data: zone.categories || [], axisLabel: T.axisLabel, axisLine: T.axisLine, axisTick: { show: false } },
    yAxis:   { type: 'value', max: zone.axis?.yLeft?.max, name: zone.axis?.yLeft?.unit, nameTextStyle: T.axisName, axisLabel: T.axisLabel, axisLine: { show: false }, splitLine: T.splitLine },
    series: seriesList.map((s, i) => {
      const color = s.color || seriesColor(zone, i)
      return {
        name:       s.name || `Series ${i + 1}`,
        type:       'line',
        smooth:     true,
        symbol:     'circle',
        symbolSize: 5,
        data:       s.data || mockLineData(n),
        lineStyle:  { color, width: 2 },
        itemStyle:  { color },
      }
    }),
  }
}

function defaultMultiLineSeries(zone, n) {
  const count = Math.max(3, (zone.palette || []).length || 3)
  return Array.from({ length: count }, (_, i) => ({
    name:  (zone.legend?.[i]?.name) || `Series ${String.fromCharCode(65 + i)}`,
    color: seriesColor(zone, i),
    data:  mockLineData(n),
  }))
}

// ── 雷达图 ───────────────────────────────────────────────────────────────────

function radarOption(zone) {
  const indicators = (zone.radar?.indicators || []).length > 0
    ? zone.radar.indicators
    : ['Dim A', 'Dim B', 'Dim C', 'Dim D', 'Dim E'].map((name) => ({ name, max: 100 }))

  const seriesData = zone.series && zone.series.length > 0
    ? zone.series
    : [{ name: 'Data', value: indicators.map(() => Math.round(60 + Math.random() * 30)) }]

  return {
    backgroundColor: 'transparent',
    tooltip:  { trigger: 'item' },
    radar: {
      center: ['50%', '54%'],
      radius: '62%',
      indicator:   indicators,
      axisName:    { color: 'rgba(200,235,255,0.9)', fontSize: 22 },
      axisLine:    { lineStyle: { color: 'rgba(73,200,255,0.25)' } },
      splitLine:   { lineStyle: { color: 'rgba(73,200,255,0.18)' } },
      splitArea:   { areaStyle: { color: ['rgba(20,80,160,0.05)', 'rgba(20,80,160,0.12)'] } },
    },
    series: [{
      type:      'radar',
      symbol:    'circle',
      symbolSize: 6,
      data:      seriesData,
      lineStyle: { color: seriesColor(zone, 0), width: 2 },
      itemStyle: { color: seriesColor(zone, 1) || seriesColor(zone, 0) },
      areaStyle: { color: vGradient(seriesColor(zone, 0), 'rgba(0,0,0,0)') },
    }],
  }
}

// ── 桑基图 ───────────────────────────────────────────────────────────────────

function sankeyOption(zone) {
  const nodes = zone.sankey?.nodes || [
    { name: 'Source A' }, { name: 'Source B' },
    { name: 'Mid A' },    { name: 'Mid B' },
    { name: 'Target A' }, { name: 'Target B' },
  ]
  const links = zone.sankey?.links || [
    { source: 'Source A', target: 'Mid A',    value: 60 },
    { source: 'Source A', target: 'Mid B',    value: 40 },
    { source: 'Source B', target: 'Mid A',    value: 30 },
    { source: 'Mid A',    target: 'Target A', value: 50 },
    { source: 'Mid A',    target: 'Target B', value: 40 },
    { source: 'Mid B',    target: 'Target B', value: 40 },
  ]
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [{
      type:      'sankey',
      left: 12, right: 120, top: 16, bottom: 16,
      nodeWidth: 16, nodeGap: 14,
      label:     { color: 'rgba(210,240,255,0.95)', fontSize: 20 },
      lineStyle: { color: 'gradient', opacity: 0.4, curveness: 0.5 },
      data:  nodes,
      links: links,
    }],
  }
}

// ── 饼图（含环形）────────────────────────────────────────────────────────────

function pieOption(zone) {
  const sliceData = zone.series?.[0]?.data ||
    [{ name: 'A', value: 40 }, { name: 'B', value: 30 }, { name: 'C', value: 20 }, { name: 'D', value: 10 }]

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend:  { bottom: 4, left: 'center', textStyle: T.legendText },
    color:   (zone.palette || []).slice(0, sliceData.length),
    series: [{
      type:    'pie',
      radius:  ['45%', '70%'],
      center:  ['50%', '46%'],
      label:   { color: 'rgba(210,240,255,0.9)', fontSize: 18 },
      data:    sliceData,
    }],
  }
}

// ── Mock 数据生成 ────────────────────────────────────────────────────────────
// 生成有趋势感的假数据（不全等高/等值）

function mockBarData(n) {
  return Array.from({ length: n }, (_, i) =>
    Math.round(100 + Math.sin(i * 1.3 + 0.5) * 55 + i * 10)
  )
}

function mockLineData(n) {
  let v = 150
  return Array.from({ length: n }, () => {
    v = Math.round(v + (Math.random() - 0.4) * 40)
    return Math.max(50, v)
  })
}

// ── 分发表 ───────────────────────────────────────────────────────────────────

const DISPATCH = {
  bar:          (z) => barOption(z, false),
  dualAxisBar:  (z) => barOption(z, true),
  groupBar:     groupBarOption,
  line:         (z) => lineOption(z, false),
  area:         (z) => lineOption(z, true),
  dualLine:     dualLineOption,
  multiLine:    multiLineOption,
  radar:        radarOption,
  sankey:       sankeyOption,
  pie:          pieOption,
  gauge:        pieOption,  // gauge 退化为环形图；高阶模型可自行覆盖
}

/**
 * 根据 zone.chartType 构建 ECharts option。
 *
 * @param {Object} zone  _chart_zones.json 中的单条 zone 记录
 * @returns {Object|null} ECharts option（渐变用 {__gradient} 占位，需调用 resolveGradients 转换）
 */
export function buildOption(zone) {
  const fn = DISPATCH[zone && zone.chartType]
  return fn ? fn(zone) : null
}

// ── LinearGradient 转换（Vue 消费侧调用 setOption 前必须执行）───────────────

/**
 * 将 buildOption 返回的 {__gradient:'v', stops:[from,to]} 占位替换为
 * echarts.graphic.LinearGradient 实例。
 *
 * @param {Object} option  buildOption 返回的 option 对象
 * @param {Object} ec      echarts 命名空间（import * as echarts from 'echarts'）
 * @returns {Object} 替换后的 option（深拷贝，不修改原始对象）
 */
export function resolveGradients(option, ec) {
  if (!option) return null
  const LinearGradient = ec?.graphic?.LinearGradient ||
    (typeof echarts !== 'undefined' && echarts.graphic?.LinearGradient)

  return JSON.parse(JSON.stringify(option), (_key, value) => {
    if (value && typeof value === 'object' && value.__gradient === 'v') {
      const [from, to] = value.stops
      if (LinearGradient) {
        return new LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: from },
          { offset: 1, color: to },
        ])
      }
      // 兜底（无 echarts 引用时）：返回起始色
      return from
    }
    return value
  })
}
