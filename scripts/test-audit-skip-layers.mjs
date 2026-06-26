#!/usr/bin/env node
/**
 * test-audit-skip-layers.mjs
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

const scriptPath = path.resolve(import.meta.dirname || process.cwd(), 'audit-skip-layers.mjs');

function runAudit(elementsJson) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skip-audit-'));
  fs.writeFileSync(path.join(tmpDir, '_all_elements.json'), JSON.stringify(elementsJson));
  let exitCode = 0;
  try {
    execFileSync(process.execPath, [scriptPath, tmpDir], { encoding: 'utf8' });
  } catch (e) {
    exitCode = e.status ?? 1;
  }
  const result = JSON.parse(fs.readFileSync(path.join(tmpDir, '_skip_audit.json'), 'utf8'));
  fs.rmSync(tmpDir, { recursive: true });
  return { exitCode, result };
}

// ── Case 1: 全白名单 → exit 0, overallStatus=ok ───────────────────────────
{
  const { exitCode, result } = runAudit({
    stats: {
      total: 100, skipped: 3,
      skipReasons: { '无rect': 3 },
      byType: { group: 20, slice: 30, text: 40, shape: 10 },
    },
  });
  assert('全白名单 exit 0', exitCode, 0);
  assert('全白名单 overallStatus=ok', result.overallStatus, 'ok');
  assert('全白名单 errors 为空', result.errors.length, 0);
}

// ── Case 2: warn 级 skipReason → exit 2 ──────────────────────────────────
{
  const { exitCode, result } = runAudit({
    stats: {
      total: 50, skipped: 5,
      skipReasons: { '无rect': 2, 'opacity-zero': 3 },
      byType: { group: 10, text: 30, shape: 10 },
    },
  });
  assert('warn skipReason → exit 2', exitCode, 2);
  assert('warn overallStatus=warn', result.overallStatus, 'warn');
  assert('warn errorCount=0', result.summary.errorCount, 0);
  assert('warn warnCount>0', result.summary.warnCount > 0, true);
}

// ── Case 3: unknown layer type → exit 3 ──────────────────────────────────
{
  const { exitCode, result } = runAudit({
    stats: {
      total: 50, skipped: 0,
      skipReasons: {},
      byType: { group: 10, text: 30, 'SuperNewLayer': 5 },
    },
  });
  assert('未知 type → exit 3', exitCode, 3);
  assert('未知 type overallStatus=error', result.overallStatus, 'error');
  assert('未知 type errorCount>0', result.summary.errorCount > 0, true);
}

// ── Case 4: 未知 skipReason → exit 3 ──────────────────────────────────────
{
  const { exitCode, result } = runAudit({
    stats: {
      total: 50, skipped: 2,
      skipReasons: { '无rect': 1, 'mystery-skip': 1 },
      byType: { text: 48 },
    },
  });
  assert('未知 skipReason → exit 3', exitCode, 3);
  assert('未知 skipReason overallStatus=error', result.overallStatus, 'error');
}

// ── Case 5: 空 stats → exit 0 ─────────────────────────────────────────────
{
  const { exitCode, result } = runAudit({ stats: {} });
  assert('空 stats exit 0', exitCode, 0);
  assert('空 stats overallStatus=ok', result.overallStatus, 'ok');
}

// ── Case 6: warn type (unknown) → exit 2 ─────────────────────────────────
{
  const { exitCode, result } = runAudit({
    stats: {
      total: 30, skipped: 0,
      skipReasons: {},
      byType: { group: 20, unknown: 3, text: 7 },
    },
  });
  assert('warn type(unknown) → exit 2', exitCode, 2);
  assert('warn type overallStatus=warn', result.overallStatus, 'warn');
}

// ── Case 7: 缺 _all_elements.json → exit 1 ────────────────────────────────
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skip-audit-miss-'));
  let exitCode = 0;
  try { execFileSync(process.execPath, [scriptPath, tmpDir], { encoding: 'utf8' }); }
  catch (e) { exitCode = e.status ?? 1; }
  fs.rmSync(tmpDir, { recursive: true });
  assert('缺文件 → exit 1', exitCode, 1);
}

// ── Case 8: _skip_audit.json 结构检查 ─────────────────────────────────────
{
  const { result } = runAudit({
    stats: {
      total: 20, skipped: 1,
      skipReasons: { '无rect': 1 },
      byType: { slice: 10, text: 10 },
    },
  });
  assert('有 skipAudit 数组', Array.isArray(result.skipAudit), true);
  assert('有 typeAudit 数组', Array.isArray(result.typeAudit), true);
  assert('有 whitelists', typeof result.whitelists, 'object');
  assert('有 resolution 文字', typeof result.resolution, 'string');
}

console.log(`\nAll audit-skip-layers cases: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
