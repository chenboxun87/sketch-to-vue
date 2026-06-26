#!/usr/bin/env node
/**
 * classify-coverage-gaps.mjs
 *
 * 读取 _coverage_map.json 的 uncoveredRegions 和 _all_elements.json 的 elements，
 * 用纯几何启发式把每个空洞分类，输出 _coverage_gap_classification.json。
 *
 * 分类规则（优先级从高到低）：
 *
 *   critical-gap       (exit 3) 面积 > CRITICAL_RATIO 且四面邻近元素密集
 *                                → 强烈可能缺失切片/组件，须补导出
 *
 *   probable-gap       (exit 2) 面积 > PROBABLE_RATIO 且邻近区域有可见元素
 *                                → 可能缺失，须 preview 交叉验证后决定
 *
 *   probable-whitespace (exit 0) 其余：面积小 / 四周无密集元素 / 位于边缘
 *                                → 可能是设计留白，默认跳过
 *
 * 退出码：
 *   0 = 全部 probable-whitespace，放行
 *   2 = 存在 probable-gap，须 preview 确认
 *   3 = 存在 critical-gap，必须补导出或留空报备后重跑
 *   1 = 输入错误
 *
 * Usage:
 *   node classify-coverage-gaps.mjs <outDir>
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , outDir] = process.argv;
if (!outDir) {
  console.error('Usage: node classify-coverage-gaps.mjs <outDir>');
  process.exit(1);
}

const coveragePath = path.join(outDir, '_coverage_map.json');
const elementsPath = path.join(outDir, '_all_elements.json');

if (!fs.existsSync(coveragePath)) {
  console.error(`[classify-coverage-gaps] 缺少 ${coveragePath}，请先运行 extract-all-elements.mjs`);
  process.exit(1);
}
if (!fs.existsSync(elementsPath)) {
  console.error(`[classify-coverage-gaps] 缺少 ${elementsPath}，请先运行 extract-all-elements.mjs`);
  process.exit(1);
}

const coverageMap = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
const rawElements = JSON.parse(fs.readFileSync(elementsPath, 'utf8'));

const uncoveredRegions = coverageMap.uncoveredRegions || [];
const board = coverageMap.board || { x: 0, y: 0, w: 0, h: 0 };
const allElements = Array.isArray(rawElements) ? rawElements : (rawElements.elements || []);

// ── 阈值定义 ─────────────────────────────────────────────────────────────────

const CRITICAL_RATIO  = 0.05;   // ≥ 5% 画板面积
const PROBABLE_RATIO  = 0.01;   // ≥ 1% 画板面积（提取已过滤 <1% 的）
const NEIGHBOR_DIST   = 60;     // px：多近算「邻近」
const DENSITY_MIN     = 3;      // 邻近元素数 ≥ 此值算「密集」
const EDGE_MARGIN     = 80;     // px：距画板边缘多近算「边缘位置」

const boardArea = board.w * board.h;

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/** 矩形中心点 */
function center(r) { return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 }; }

/** 矩形到矩形的最短边距（不重叠时为正，重叠时为负） */
function rectGap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.sqrt(dx * dx + dy * dy);
}

/** 是否在画板边缘 */
function isEdgeRegion(region, board, margin) {
  return (
    region.x <= margin ||
    region.y <= margin ||
    (region.x + region.w) >= (board.x + board.w - margin) ||
    (region.y + region.h) >= (board.y + board.h - margin)
  );
}

/** 统计给定矩形 NEIGHBOR_DIST 范围内的可见元素数量 */
function countNeighbors(region, elements, dist) {
  return elements.filter(e => {
    if (!e.rect) return false;
    if (e.isContainer) return false; // group 本身不算内容
    return rectGap(region, e.rect) <= dist;
  }).length;
}

// ── 分类每个空洞 ─────────────────────────────────────────────────────────────

const classified = uncoveredRegions.map(region => {
  const area = region.w * region.h;
  const areaRatio = boardArea > 0 ? area / boardArea : 0;
  const neighborCount = countNeighbors(region, allElements, NEIGHBOR_DIST);
  const onEdge = isEdgeRegion(region, board, EDGE_MARGIN);

  let classification;
  let reason;

  if (areaRatio >= CRITICAL_RATIO && neighborCount >= DENSITY_MIN && !onEdge) {
    classification = 'critical-gap';
    reason = `面积占比 ${(areaRatio * 100).toFixed(1)}%（≥${CRITICAL_RATIO * 100}%），${NEIGHBOR_DIST}px 内有 ${neighborCount} 个元素，非边缘区域 → 强烈可能缺失切片`;
  } else if (areaRatio >= PROBABLE_RATIO && neighborCount >= 2 && !onEdge) {
    classification = 'probable-gap';
    reason = `面积占比 ${(areaRatio * 100).toFixed(1)}%，${NEIGHBOR_DIST}px 内有 ${neighborCount} 个邻近元素 → 须 preview 交叉验证`;
  } else {
    classification = 'probable-whitespace';
    const reasons = [];
    if (areaRatio < PROBABLE_RATIO) reasons.push(`面积占比 ${(areaRatio * 100).toFixed(1)}%（小）`);
    if (neighborCount < 2) reasons.push(`邻近元素数 ${neighborCount}（稀疏）`);
    if (onEdge) reasons.push('位于画板边缘');
    reason = reasons.join('；') + ' → 可能是设计留白';
  }

  return {
    ...region,
    areaRatio: Math.round(areaRatio * 10000) / 10000,
    neighborCount,
    onEdge,
    classification,
    reason,
    action: classification === 'critical-gap'
      ? '必须处理：补导出切片 或 写入 _missing_assets.json 留空报备'
      : classification === 'probable-gap'
        ? '建议处理：用 preview 图交叉验证；有内容则补导出，纯背景则记录留白'
        : '可跳过：记录为设计留白（可在 _missing_assets.json 中标注 kind=whitespace）',
  };
});

const summary = {
  total: classified.length,
  critical: classified.filter(r => r.classification === 'critical-gap').length,
  probable: classified.filter(r => r.classification === 'probable-gap').length,
  whitespace: classified.filter(r => r.classification === 'probable-whitespace').length,
};

const hasCritical = summary.critical > 0;
const hasProbable = summary.probable > 0;

const overallStatus = hasCritical ? 'critical' : hasProbable ? 'needs-review' : 'ok';

const result = {
  generatedAt: new Date().toISOString(),
  board,
  boardArea,
  overallStatus,
  summary,
  thresholds: {
    criticalRatio:  CRITICAL_RATIO,
    probableRatio:  PROBABLE_RATIO,
    neighborDist:   NEIGHBOR_DIST,
    densityMin:     DENSITY_MIN,
    edgeMargin:     EDGE_MARGIN,
    note: '如需调整分类敏感度，修改 classify-coverage-gaps.mjs 顶部常量。',
  },
  regions: classified,
  downgradeFallback: {
    description: 'preview 图不可用时的降级剧本',
    steps: [
      '所有 probable-gap 按 critical-gap 处理（保守策略）',
      '对每个 probable-gap 区域：先尝试补导出；若无对应图层则写入 _missing_assets.json',
      '重跑 classify-coverage-gaps.mjs 确认分类降级后结果',
    ],
  },
};

const outPath = path.join(outDir, '_coverage_gap_classification.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

// ── 输出摘要 ──────────────────────────────────────────────────────────────────
const emoji = { critical: '❌', 'needs-review': '⚠️', ok: '✅' };
console.log(`[classify-coverage-gaps] ${emoji[overallStatus]} overallStatus=${overallStatus}`);
console.log(`  total=${summary.total}  critical=${summary.critical}  probable=${summary.probable}  whitespace=${summary.whitespace}`);
if (hasCritical) {
  console.error('  CRITICAL GAP（必须处理）:');
  classified.filter(r => r.classification === 'critical-gap')
    .forEach(r => console.error(`    [${r.x},${r.y} ${r.w}×${r.h}] ${r.reason}`));
}
if (hasProbable) {
  console.warn('  PROBABLE GAP（建议 preview 验证）:');
  classified.filter(r => r.classification === 'probable-gap')
    .forEach(r => console.warn(`    [${r.x},${r.y} ${r.w}×${r.h}] ${r.reason}`));
}
console.log(`  输出：${outPath}`);

if (hasCritical) process.exit(3);
if (hasProbable) process.exit(2);
process.exit(0);
