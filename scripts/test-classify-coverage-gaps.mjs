#!/usr/bin/env node
/**
 * test-classify-coverage-gaps.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let passed = 0, failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) { console.log(`✅ ${label}`); passed++; }
  else { console.error(`❌ ${label}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`); failed++; }
}
function assertGte(label, actual, min) {
  if (actual >= min) { console.log(`✅ ${label}`); passed++; }
  else { console.error(`❌ ${label}\n   expected >= ${min}  actual: ${actual}`); failed++; }
}

const scriptPath = path.resolve(import.meta.dirname || process.cwd(), 'classify-coverage-gaps.mjs');

function run(coverageMap, elements) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-class-'));
  fs.writeFileSync(path.join(tmpDir, '_coverage_map.json'), JSON.stringify(coverageMap));
  fs.writeFileSync(path.join(tmpDir, '_all_elements.json'), JSON.stringify({ elements }));
  let exitCode = 0;
  try { execFileSync(process.execPath, [scriptPath, tmpDir], { encoding: 'utf8' }); }
  catch (e) { exitCode = e.status ?? 1; }
  const result = JSON.parse(fs.readFileSync(path.join(tmpDir, '_coverage_gap_classification.json'), 'utf8'));
  fs.rmSync(tmpDir, { recursive: true });
  return { exitCode, result };
}

// ── Helpers for mock data ────────────────────────────────────────────────────
const BOARD = { x: 0, y: 0, w: 2912, h: 1248 }; // 大屏尺寸

/** 生成 N 个密集元素环绕 region */
function surroundElements(region, n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `el-${i}`,
    type: 'slice',
    rect: { x: region.x - 30 + i * 10, y: region.y - 30, w: 50, h: 50 },
  }));
}

// ── Case 1: 空 uncoveredRegions → exit 0, ok ──────────────────────────────
{
  const { exitCode, result } = run(
    { board: BOARD, uncoveredRegions: [] },
    []
  );
  assert('空空洞 exit 0', exitCode, 0);
  assert('空空洞 overallStatus=ok', result.overallStatus, 'ok');
  assert('空空洞 summary.total=0', result.summary.total, 0);
}

// ── Case 2: 小面积空洞 (<1% 但已进列表) → whitespace ───────────────────────
{
  // 2912×1248=3633216，1% = 36332，设 100×100=10000 < 1%
  const region = { x: 500, y: 500, w: 100, h: 100, areaRatio: 0.003 };
  const { exitCode, result } = run(
    { board: BOARD, uncoveredRegions: [region] },
    []  // 无邻近元素
  );
  assert('小面积空洞 exit 0', exitCode, 0);
  assert('小面积空洞 probable-whitespace', result.regions[0].classification, 'probable-whitespace');
}

// ── Case 3: 大面积中心空洞 + 密集邻近元素 → critical-gap ──────────────────
{
  // 500×500=250000 / 3633216 ≈ 6.88% > 5%，中心位置
  const region = { x: 800, y: 400, w: 500, h: 500, areaRatio: 0.069 };
  const neighbors = surroundElements(region, 5);
  const { exitCode, result } = run(
    { board: BOARD, uncoveredRegions: [region] },
    neighbors
  );
  assert('critical-gap exit 3', exitCode, 3);
  assert('critical-gap classification', result.regions[0].classification, 'critical-gap');
  assert('critical-gap overallStatus', result.overallStatus, 'critical');
  assertGte('critical-gap neighborCount', result.regions[0].neighborCount, 3);
}

// ── Case 4: 中等面积 + 2 个邻近元素 → probable-gap ────────────────────────
{
  // 400×300=120000 / 3633216 ≈ 3.3% → ≥ 1% 且 < 5%
  const region = { x: 600, y: 300, w: 400, h: 300, areaRatio: 0.033 };
  const neighbors = surroundElements(region, 2);
  const { exitCode, result } = run(
    { board: BOARD, uncoveredRegions: [region] },
    neighbors
  );
  assert('probable-gap exit 2', exitCode, 2);
  assert('probable-gap classification', result.regions[0].classification, 'probable-gap');
  assert('probable-gap overallStatus', result.overallStatus, 'needs-review');
}

// ── Case 5: 边缘大面积空洞 → probable-whitespace（边缘豁免） ───────────────
{
  // x=0（边缘），面积大但在边缘
  const region = { x: 0, y: 0, w: 600, h: 400, areaRatio: 0.066 };
  const neighbors = surroundElements(region, 5);
  const { exitCode, result } = run(
    { board: BOARD, uncoveredRegions: [region] },
    neighbors
  );
  assert('边缘空洞 exit 0', exitCode, 0);
  assert('边缘空洞 onEdge=true', result.regions[0].onEdge, true);
  assert('边缘空洞 probable-whitespace', result.regions[0].classification, 'probable-whitespace');
}

// ── Case 6: 混合多个空洞 → critical 决定整体 exit 3 ─────────────────────
{
  const criticalRegion = { x: 800, y: 400, w: 500, h: 500, areaRatio: 0.069 };
  const whiteRegion    = { x: 0, y: 0, w: 50, h: 50, areaRatio: 0.001 };
  const neighbors = surroundElements(criticalRegion, 5);
  const { exitCode, result } = run(
    { board: BOARD, uncoveredRegions: [criticalRegion, whiteRegion] },
    neighbors
  );
  assert('混合多空洞 exit 3', exitCode, 3);
  assert('混合 summary.total=2', result.summary.total, 2);
  assert('混合 critical>=1', result.summary.critical >= 1, true);
}

// ── Case 7: 输出文件结构 ───────────────────────────────────────────────────
{
  const region = { x: 100, y: 100, w: 200, h: 200, areaRatio: 0.011 };
  const { result } = run({ board: BOARD, uncoveredRegions: [region] }, []);
  assert('有 thresholds', typeof result.thresholds, 'object');
  assert('有 downgradeFallback', typeof result.downgradeFallback, 'object');
  assert('有 downgradeFallback.steps', Array.isArray(result.downgradeFallback.steps), true);
  assert('regions 有 action', typeof result.regions[0]?.action, 'string');
}

// ── Case 8: 缺文件 → exit 1 ───────────────────────────────────────────────
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-class-miss-'));
  let exitCode = 0;
  try { execFileSync(process.execPath, [scriptPath, tmpDir], { encoding: 'utf8' }); }
  catch (e) { exitCode = e.status ?? 1; }
  fs.rmSync(tmpDir, { recursive: true });
  assert('缺文件 exit 1', exitCode, 1);
}

console.log(`\nAll classify-coverage-gaps cases: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
