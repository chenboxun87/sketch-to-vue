#!/usr/bin/env node
/**
 * test-gen-icon-gap-candidates.mjs
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
function assertIncludes(label, str, substr) {
  if (typeof str === 'string' && str.includes(substr)) { console.log(`✅ ${label}`); passed++; }
  else { console.error(`❌ ${label}\n   expected to include: ${JSON.stringify(substr)}`); failed++; }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-gap-test-'));
const assetsDir = path.join(tmpDir, 'assets');
fs.mkdirSync(assetsDir);

// ── 准备 mock 资源文件 ──────────────────────────────────────────────────────
const mockSlices = [
  'guihua-icon.png',          // 精确匹配「规划」
  'feature-a-icon.png',          // 精确匹配「电力」
  'other-icon.png',
  'background-blue.png',
];
mockSlices.forEach(f => fs.writeFileSync(path.join(assetsDir, f), ''));

// ── 准备 mock _render_gaps_report.json ──────────────────────────────────────
const mockGapsReport = {
  iconGapCandidates: [
    {
      id: 'gap-1',
      name: '规划',
      kind: 'empty-group',
      rect: { x: 100, y: 200, w: 32, h: 32 },
      reason: 'group/symbol 无 exportable 子层',
    },
    {
      id: 'gap-2',
      name: '电力',
      kind: 'ghost-bitmap-shape',
      rect: { x: 200, y: 200, w: 24, h: 24 },
      reason: 'shape fills/css 为空',
    },
    {
      id: 'gap-3',
      name: '完全无关名称XYZ',
      kind: 'empty-group',
      rect: { x: 300, y: 200, w: 32, h: 32 },
      reason: 'group/symbol 无 exportable 子层',
    },
  ],
};
fs.writeFileSync(
  path.join(tmpDir, '_render_gaps_report.json'),
  JSON.stringify(mockGapsReport),
);

// ── 运行脚本 ──────────────────────────────────────────────────────────────────
const scriptPath = path.resolve(import.meta.dirname || process.cwd(), 'gen-icon-gap-candidates.mjs');
try {
  execFileSync(process.execPath, [scriptPath, tmpDir, assetsDir], { encoding: 'utf8' });
} catch (e) {
  console.error('脚本执行失败:', e.message, e.stdout);
  process.exit(1);
}

const outPath = path.join(tmpDir, '_icon_gap_candidates.json');
assert('输出文件存在', fs.existsSync(outPath), true);

const result = JSON.parse(fs.readFileSync(outPath, 'utf8'));

// 基本结构
assert('totalGaps = 3', result.totalGaps, 3);
assert('有 summary', typeof result.summary, 'object');
assert('有 unresolved 数组', Array.isArray(result.unresolved), true);
assert('有 items 数组', Array.isArray(result.items), true);
assert('items 长度 = 3', result.items.length, 3);

// gap-1「规划」→ 应有 recommended（可能分数低，因为文件名是拼音）
const gap1 = result.items.find(i => i.elementId === 'gap-1');
assert('gap-1 elementId', gap1?.elementId, 'gap-1');
assert('gap-1 candidates 非空', gap1?.candidates?.length > 0, true);
assert('gap-1 recommended 始终存在', gap1?.recommended !== null, true);
assert('gap-1 recommended.file 为字符串', typeof gap1?.recommended?.file, 'string');

// gap-2「电力」→ 同理
const gap2 = result.items.find(i => i.elementId === 'gap-2');
assert('gap-2 recommended 始终存在', gap2?.recommended !== null, true);
assert('gap-2 recommended.file 为字符串', typeof gap2?.recommended?.file, 'string');

// 无关名称：应 needs-review 或 no-candidate（分数低）
const gap3 = result.items.find(i => i.elementId === 'gap-3');
assert('gap-3 status 非 auto-resolved', gap3?.status !== 'auto-resolved', true);

// 新增：英文同名精确匹配应 auto-resolved
const tmpDir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-gap-exact-'));
const assetsDir4 = path.join(tmpDir4, 'assets');
fs.mkdirSync(assetsDir4);
fs.writeFileSync(path.join(assetsDir4, 'arrow-up.png'), '');
fs.writeFileSync(path.join(assetsDir4, 'arrow-down.png'), '');
const exactGapReport = {
  iconGapCandidates: [
    { id: 'g-arrow', name: 'arrow-up', kind: 'empty-group', rect: { x: 0, y: 0, w: 24, h: 24 }, reason: '' },
  ],
};
fs.writeFileSync(path.join(tmpDir4, '_render_gaps_report.json'), JSON.stringify(exactGapReport));
execFileSync(process.execPath, [scriptPath, tmpDir4, assetsDir4], { encoding: 'utf8' });
const res4 = JSON.parse(fs.readFileSync(path.join(tmpDir4, '_icon_gap_candidates.json'), 'utf8'));
assert('英文同名 arrow-up → auto-resolved', res4.items[0]?.status, 'auto-resolved');
assertIncludes('英文同名 recommended.file', res4.items[0]?.recommended?.file, 'arrow-up');
fs.rmSync(tmpDir4, { recursive: true });

// summary 加总等于 totalGaps
const sumTotal = result.summary.autoResolved + result.summary.needsReview + result.summary.noCandidate;
assert('summary 总和 = totalGaps', sumTotal, result.totalGaps);

// unresolved 不包含 auto-resolved 的 item
for (const item of result.items) {
  if (item.status === 'auto-resolved') {
    assert(`auto-resolved ${item.elementId} 不在 unresolved`, result.unresolved.includes(item.elementId), false);
  }
}

// 空 iconGapCandidates 时脚本退出码 0（用空报告测试）
const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-gap-empty-'));
fs.writeFileSync(path.join(tmpDir2, '_render_gaps_report.json'), JSON.stringify({ iconGapCandidates: [] }));
try {
  execFileSync(process.execPath, [scriptPath, tmpDir2, assetsDir], { encoding: 'utf8' });
  assert('空 gaps 退出码 0', true, true);
} catch (e) {
  assert('空 gaps 退出码 0', false, true);
}

// 缺 _render_gaps_report.json → exit 1
const tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-gap-no-report-'));
let exitErr = false;
try { execFileSync(process.execPath, [scriptPath, tmpDir3], { encoding: 'utf8' }); }
catch (e) { exitErr = true; }
assert('缺 report 文件 → exit 1', exitErr, true);

// 清理
fs.rmSync(tmpDir, { recursive: true });
fs.rmSync(tmpDir2, { recursive: true });
fs.rmSync(tmpDir3, { recursive: true });

console.log(`\nAll gen-icon-gap-candidates cases: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
