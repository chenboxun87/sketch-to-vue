#!/usr/bin/env node
/**
 * test-gen-component-skeleton.mjs
 * 测试 gen-component-skeleton.mjs 的核心函数。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`✅ ${label}`);
    passed++;
  } else {
    console.error(`❌ ${label}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertIncludes(label, str, substr) {
  if (typeof str === 'string' && str.includes(substr)) {
    console.log(`✅ ${label}`);
    passed++;
  } else {
    console.error(`❌ ${label}\n   expected to include: ${JSON.stringify(substr)}\n   actual: ${JSON.stringify(str)}`);
    failed++;
  }
}

// ── 构造虚假 _all_elements.json ──────────────────────────────────────────────
const mockElements = {
  elements: [
    // 大 KPI 行 group
    { id: 'g-kpi', name: 'KPI指标行', type: 'group', rect: { x: 0, y: 0, w: 800, h: 120 }, isContainer: true },
    // KPI 行的子 group × 3
    { id: 'g-kpi-1', name: 'KPI-1', type: 'group', rect: { x: 0,   y: 10, w: 240, h: 100 }, isContainer: true },
    { id: 'g-kpi-2', name: 'KPI-2', type: 'group', rect: { x: 280, y: 10, w: 240, h: 100 }, isContainer: true },
    { id: 'g-kpi-3', name: 'KPI-3', type: 'group', rect: { x: 560, y: 10, w: 240, h: 100 }, isContainer: true },
    // 图表容器
    { id: 'g-chart', name: '折线图表容器', type: 'group', rect: { x: 0, y: 200, w: 600, h: 300 }, isContainer: true },
    // 列表
    { id: 'g-list', name: '排行列表', type: 'group', rect: { x: 0, y: 550, w: 400, h: 400 }, isContainer: true },
    // 文字 × 3 inside list
    { id: 't1', name: 'row1', type: 'text', rect: { x: 10, y: 600, w: 380, h: 40 }, content: '条目一' },
    { id: 't2', name: 'row2', type: 'text', rect: { x: 10, y: 650, w: 380, h: 40 }, content: '条目二' },
    { id: 't3', name: 'row3', type: 'text', rect: { x: 10, y: 700, w: 380, h: 40 }, content: '条目三' },
    // 标题
    { id: 'g-title', name: '页面标题', type: 'group', rect: { x: 0, y: 960, w: 600, h: 60 }, isContainer: true },
    // 极小 group（应被 skip）
    { id: 'g-tiny', name: 'tiny', type: 'group', rect: { x: 0, y: 0, w: 10, h: 10 }, isContainer: true },
  ]
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skeleton-test-'));
fs.writeFileSync(path.join(tmpDir, '_all_elements.json'), JSON.stringify(mockElements));

const scriptPath = path.resolve(import.meta.dirname || process.cwd(), 'gen-component-skeleton.mjs');

// 运行脚本
try {
  execFileSync(process.execPath, [scriptPath, tmpDir], { encoding: 'utf8' });
} catch (e) {
  console.error('脚本执行失败:', e.message);
  process.exit(1);
}

const outPath = path.join(tmpDir, '_group_analysis.json');
assert('输出文件存在', fs.existsSync(outPath), true);

const result = JSON.parse(fs.readFileSync(outPath, 'utf8'));

// 基本字段
assert('totalGroups > 0', result.totalGroups > 0, true);
assert('skippedGroups = 1（极小 group）', result.skippedGroups, 1);
assert('有 summary.high', typeof result.summary.high, 'number');
assert('有 generatedAt', typeof result.generatedAt, 'string');

// pattern 检测
const kpiGroup = result.groups.find(g => g.id === 'g-kpi');
assert('KPI指标行 → pattern=kpi-row', kpiGroup?.pattern, 'kpi-row');
assert('KPI指标行 → layoutHint=flex-row', kpiGroup?.layoutHint, 'flex-row');
assert('KPI指标行 → priority=high', kpiGroup?.priority, 'high');

const chartGroup = result.groups.find(g => g.id === 'g-chart');
assert('折线图表容器 → pattern=chart-container', chartGroup?.pattern, 'chart-container');
assert('折线图表容器 → priority=high', chartGroup?.priority, 'high');

const listGroup = result.groups.find(g => g.id === 'g-list');
assert('排行列表 → pattern=list', listGroup?.pattern, 'list');
assert('排行列表 → layoutHint=flex-col', listGroup?.layoutHint, 'flex-col');

const titleGroup = result.groups.find(g => g.id === 'g-title');
assert('页面标题 → pattern=title', titleGroup?.pattern, 'title');

// skeletonCode 骨架代码内容
assertIncludes('kpi-row skeletonCode 包含 v-for="(item, i) in kpiItems"', kpiGroup?.skeletonCode, 'v-for="(item, i) in kpiItems"');
assertIncludes('chart-container skeletonCode 包含 chartRef', chartGroup?.skeletonCode, 'ref="chartRef"');
assertIncludes('list skeletonCode 包含 v-for="(row, i) in listData"', listGroup?.skeletonCode, 'v-for="(row, i) in listData"');

// componentName PascalCase
assert('kpi componentName 非空', typeof kpiGroup?.componentName, 'string');
assert('skeletonFile 路径', kpiGroup?.skeletonFile?.startsWith('components/'), true);

// children 统计
assert('kpi-row children.groups >= 3', kpiGroup?.children?.groups >= 3, true);
assert('list children.texts >= 3', listGroup?.children?.texts >= 3, true);

// 优先级排序：high 先于 medium 先于 low
const priorities = result.groups.map(g => g.priority);
const firstLow = priorities.lastIndexOf('high');
const firstMedium = priorities.indexOf('medium');
if (firstMedium >= 0 && firstLow >= 0) {
  assert('high 排在 medium 之前', firstLow <= firstMedium, true);
}

// 清理临时目录
fs.rmSync(tmpDir, { recursive: true });

console.log(`\nAll gen-component-skeleton cases: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
