#!/usr/bin/env node
/**
 * gen-component-skeleton.mjs
 *
 * 读取 _all_elements.json，分析所有 type=group/symbol 节点，
 * 为每个 group 评分「componentness」并输出 _group_analysis.json。
 *
 * 输出格式：
 * {
 *   generatedAt: ISO,
 *   totalGroups: N,
 *   groups: [
 *     {
 *       id, name, rect,
 *       pattern,          // kpi-row | list | chart-container | card | title | generic
 *       layoutHint,       // flex-row | flex-col | absolute | grid
 *       componentName,    // PascalCase 建议组件名
 *       priority,         // high | medium | low
 *       children: { total, slices, texts, groups },
 *       skeletonFile,     // 建议输出文件名 (相对于 outDir)
 *       skeletonCode,     // 骨架 Vue SFC 代码字符串
 *     }, ...
 *   ],
 *   skippedGroups: N,
 *   summary: { high, medium, low }
 * }
 *
 * Usage:
 *   node gen-component-skeleton.mjs <outDir>
 *
 * outDir 必须包含 _all_elements.json（由 extract-all-elements.mjs 产出）。
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , outDir] = process.argv;
if (!outDir) {
  console.error('Usage: node gen-component-skeleton.mjs <outDir>');
  process.exit(1);
}

const elementsPath = path.join(outDir, '_all_elements.json');
if (!fs.existsSync(elementsPath)) {
  console.error(`[gen-component-skeleton] 缺少 ${elementsPath}，请先运行 extract-all-elements.mjs`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(elementsPath, 'utf8'));
// _all_elements.json 可能是 { elements: [...] } 或直接是数组
const allElements = Array.isArray(raw) ? raw : (raw.elements || []);

// ── 工具函数 ────────────────────────────────────────────────────────────────

/** 中文 / 英文名转 PascalCase 组件名 */
function toPascalCase(name) {
  if (!name) return 'Group';
  return name
    .replace(/[（）()\[\]【】\s]+/g, '-')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]/g, '')
    .split('-')
    .filter(Boolean)
    .map(seg => {
      // 纯中文 seg → 转拼音首字母缩写（简化：直接用中文 hash）
      if (/[\u4e00-\u9fa5]/.test(seg)) return seg; // 中文原样保留，后续人工确认
      return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
    })
    .join('');
}

/** 根据 name 关键词识别 group pattern */
function detectPattern(name, children) {
  if (!name) return 'generic';
  const n = name.toLowerCase();

  // KPI / 指标行：多个同语义子 group + 数字文字
  if (/kpi|指标|用电量|电量|统计|数据卡/.test(n)) return 'kpi-row';
  // 列表
  if (/list|列表|清单|明细|排行|top\d/.test(n)) return 'list';
  // 图表容器
  if (/chart|图表|折线|柱状|饼图|雷达|散点|echart|echarts/.test(n)) return 'chart-container';
  // 卡片
  if (/card|卡片|panel|面板|box|块/.test(n)) return 'card';
  // 标题
  if (/title|标题|header|头部|heading/.test(n)) return 'title';

  // 结构启发：子元素中包含多个等宽 group → kpi-row
  if (children.groups >= 3 && children.slices / Math.max(children.total, 1) < 0.3) return 'kpi-row';
  // 结构启发：纯文字+少量切片 → list row
  if (children.texts > children.slices * 2 && children.total >= 3) return 'list';

  return 'generic';
}

/** 根据 rect 和 pattern 判断内部布局策略 */
function detectLayoutHint(pattern, rect, children) {
  if (pattern === 'kpi-row') return 'flex-row';
  if (pattern === 'list') return 'flex-col';
  if (pattern === 'title') return 'flex-row';
  if (pattern === 'chart-container') return 'absolute';
  // 宽>高 且子 group 横排 → flex-row
  if (rect && rect.w > rect.h * 2 && children.groups >= 2) return 'flex-row';
  // 高>宽 → flex-col
  if (rect && rect.h > rect.w * 1.5) return 'flex-col';
  return 'absolute';
}

/** 组件提取优先级 */
function calcPriority(pattern, children, rect) {
  if (pattern === 'chart-container') return 'high';
  if (pattern === 'kpi-row') return 'high';
  if (pattern === 'list') return 'high';
  if (children.total >= 5) return 'high';
  if (pattern === 'card' && children.total >= 2) return 'medium';
  if (pattern === 'title') return 'medium';
  if (rect && rect.w > 400 && rect.h > 100) return 'medium';
  return 'low';
}

/** 生成骨架 Vue SFC 字符串 */
function genSkeletonCode(group, componentName) {
  const { pattern, layoutHint, rect, children } = group;
  const posStyle = rect
    ? `position: absolute; left: ${rect.x}px; top: ${rect.y}px; width: ${rect.w}px; height: ${rect.h}px;`
    : 'position: absolute;';

  const innerStyle = layoutHint === 'flex-row'
    ? 'display: flex; flex-direction: row; align-items: center;'
    : layoutHint === 'flex-col'
      ? 'display: flex; flex-direction: column;'
      : layoutHint === 'grid'
        ? 'display: grid;'
        : 'position: relative;';

  let templateBody = '';
  switch (pattern) {
    case 'kpi-row':
      templateBody = `
    <!-- KPI 行：将每个子 group 替换为 KPI 单元格 -->
    <div v-for="(item, i) in kpiItems" :key="i" class="kpi-cell">
      <div class="kpi-value">{{ item.value }}</div>
      <div class="kpi-label">{{ item.label }}</div>
    </div>`;
      break;
    case 'list':
      templateBody = `
    <!-- 列表：v-for 渲染每行，data 由父组件传入 -->
    <div v-for="(row, i) in listData" :key="i" class="list-row">
      <!-- TODO: 按实际字段展开 -->
      <span class="list-index">{{ i + 1 }}</span>
      <span class="list-name">{{ row.name }}</span>
      <span class="list-value">{{ row.value }}</span>
    </div>`;
      break;
    case 'chart-container':
      templateBody = `
    <!-- 图表容器：ECharts 实例挂载点 -->
    <div ref="chartRef" class="chart-inner" style="width:100%;height:100%;"></div>`;
      break;
    case 'title':
      templateBody = `
    <!-- 标题 -->
    <span class="title-icon"></span>
    <span class="title-text">{{ title }}</span>`;
      break;
    case 'card':
      templateBody = `
    <!-- 卡片：header + body -->
    <div class="card-header">
      <slot name="header">{{ title }}</slot>
    </div>
    <div class="card-body">
      <slot></slot>
    </div>`;
      break;
    default:
      templateBody = `\n    <!-- TODO: 按 _all_elements.json 中 id="${group.id}" 的子层填充内容 -->`;
  }

  const propsBlock = genPropsBlock(pattern);
  const dataBlock = genDataBlock(pattern);
  const mountedBlock = pattern === 'chart-container'
    ? `\n  mounted() {\n    this.initChart();\n  },` : '';
  const methodsBlock = genMethodsBlock(pattern);

  return `<template>
  <div class="${toKebabCase(componentName)}" :style="containerStyle">
    <div class="inner" style="${innerStyle}">${templateBody}
    </div>
  </div>
</template>

<script>
// 自动生成骨架 — 来自 gen-component-skeleton.mjs
// 源 group: id="${group.id}" name="${group.name || ''}"
// pattern: ${pattern}  layoutHint: ${layoutHint}
export default {
  name: '${componentName}',${propsBlock}${dataBlock}${mountedBlock}${methodsBlock}
};
</script>

<style scoped>
.${toKebabCase(componentName)} {
  ${posStyle}
  box-sizing: border-box;
}
.inner {
  ${innerStyle}
  width: 100%;
  height: 100%;
}
/* TODO: 从 _all_elements.json 提取实际颜色/字体填充以下变量 */
</style>
`;
}

/** 根据 pattern 生成 props 块 */
function genPropsBlock(pattern) {
  switch (pattern) {
    case 'kpi-row':
      return `\n  props: {\n    kpiItems: { type: Array, default: () => [] },\n  },`;
    case 'list':
      return `\n  props: {\n    listData: { type: Array, default: () => [] },\n  },`;
    case 'chart-container':
      return `\n  props: {\n    chartOption: { type: Object, default: null },\n  },`;
    case 'card':
    case 'title':
      return `\n  props: {\n    title: { type: String, default: '' },\n  },`;
    default:
      return '';
  }
}

/** 根据 pattern 生成 data 块 */
function genDataBlock(pattern) {
  if (pattern === 'chart-container') {
    return `\n  data() {\n    return { chartInstance: null };\n  },`;
  }
  return '';
}

/** 根据 pattern 生成 methods 块 */
function genMethodsBlock(pattern) {
  if (pattern === 'chart-container') {
    return `\n  methods: {\n    initChart() {\n      // TODO: 用 echarts.init(this.$refs.chartRef) 初始化\n      // this.chartInstance = echarts.init(this.$refs.chartRef);\n      // if (this.chartOption) this.chartInstance.setOption(this.chartOption);\n    },\n  },`;
  }
  return '';
}

function toKebabCase(name) {
  if (!name) return 'group';
  return name
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '')
    .replace(/[\u4e00-\u9fa5]+/g, m => `-${m}-`)
    .replace(/-{2,}/g, '-')
    .toLowerCase();
}

// ── 构建 parent→children 索引 ───────────────────────────────────────────────
// 需要知道每个 group 包含的直接子元素分类数量。
// _all_elements.json 的 elements 是扁平列表，但 rect 是绝对坐标。
// 通过 rect 包含关系推断 parent→child（一级深度）。

function isContained(parent, child) {
  if (!parent.rect || !child.rect) return false;
  const p = parent.rect, c = child.rect;
  return c.x >= p.x && c.y >= p.y &&
    (c.x + c.w) <= (p.x + p.w) &&
    (c.y + c.h) <= (p.y + p.h) &&
    !(c.x === p.x && c.y === p.y && c.w === p.w && c.h === p.h); // 排除自身
}

/** 对每个 group 统计直接子元素（仅一级：不被更小 group 遮蔽的那层） */
function buildChildrenStats(groups, allElements) {
  return groups.map(group => {
    const contained = allElements.filter(e => e.id !== group.id && isContained(group, e));
    // 过滤掉被其他子 group 包含的（只看直接子）
    const directChildren = contained.filter(e => {
      return !contained.some(other =>
        other.id !== e.id &&
        (other.type === 'group' || other.type === 'symbol') &&
        isContained(other, e));
    });
    const slices = directChildren.filter(e => e.type === 'slice' || (e.type === 'shape' && e.exports)).length;
    const texts = directChildren.filter(e => e.type === 'text').length;
    const subGroups = directChildren.filter(e => e.type === 'group' || e.type === 'symbol').length;
    return { ...group, _children: { total: directChildren.length, slices, texts, groups: subGroups } };
  });
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

const groups = allElements.filter(e => e.type === 'group' || e.type === 'symbol');
const SKIP_MIN_AREA = 40 * 40; // 跳过极小 group
const meaningfulGroups = groups.filter(e => {
  if (!e.rect) return false;
  return (e.rect.w * e.rect.h) >= SKIP_MIN_AREA;
});
const skippedGroups = groups.length - meaningfulGroups.length;

const withChildren = buildChildrenStats(meaningfulGroups, allElements);

const analyzed = withChildren.map(group => {
  const { _children: children, ...rest } = group;
  const pattern = detectPattern(group.name, children);
  const layoutHint = detectLayoutHint(pattern, group.rect, children);
  const componentName = toPascalCase(group.name) || 'Group';
  const priority = calcPriority(pattern, children, group.rect);

  const skeletonFile = `components/${componentName}.vue`;
  const skeletonCode = genSkeletonCode({ ...group, pattern, layoutHint, children }, componentName);

  return {
    id: group.id,
    name: group.name || '',
    rect: group.rect,
    pattern,
    layoutHint,
    componentName,
    priority,
    children,
    skeletonFile,
    skeletonCode,
  };
});

// 按优先级排序
const priorityOrder = { high: 0, medium: 1, low: 2 };
analyzed.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

const summary = {
  high: analyzed.filter(g => g.priority === 'high').length,
  medium: analyzed.filter(g => g.priority === 'medium').length,
  low: analyzed.filter(g => g.priority === 'low').length,
};

const result = {
  generatedAt: new Date().toISOString(),
  totalGroups: analyzed.length,
  skippedGroups,
  summary,
  groups: analyzed,
};

const outPath = path.join(outDir, '_group_analysis.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`[gen-component-skeleton] 分析完成：${analyzed.length} 个 group`);
console.log(`  high=${summary.high}  medium=${summary.medium}  low=${summary.low}  skipped=${skippedGroups}`);
console.log(`  输出：${outPath}`);
