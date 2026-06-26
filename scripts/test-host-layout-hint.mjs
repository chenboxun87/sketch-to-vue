#!/usr/bin/env node
/** 回归：host-layout-hint 对已知提取产物的推断 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectHostLayoutHint } from './host-layout-hint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 指向你本机已提取的 _all_elements.json；未设置对应环境变量则该用例自动 SKIP。
const FIXTURES = [
  {
    name: 'sampleCockpitV2（含侧栏+顶栏壳）',
    file: process.env.D2V_HINT_FIXTURE_CHROME || '',
    expect: { shiftX: 279, shiftY: 86, chrome: true, minConfidence: 0.5 },
  },
  {
    name: 'sampleCockpitV4（无页面壳）',
    file: process.env.D2V_HINT_FIXTURE_PLAIN || '',
    expect: { shiftX: 0, shiftY: 0, chrome: false, minConfidence: 0.5 },
  },
];

let failed = 0;

for (const fx of FIXTURES) {
  if (!fs.existsSync(fx.file)) {
    console.warn('SKIP（文件不存在）:', fx.name, fx.file);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(fx.file, 'utf8'));
  const hint = detectHostLayoutHint(data.board, data.elements);
  const { x, y } = hint.contentShift;
  const ok =
    x === fx.expect.shiftX &&
    y === fx.expect.shiftY &&
    hint.chromeDetected === fx.expect.chrome &&
    hint.confidence.overall >= fx.expect.minConfidence;

  console.log(ok ? '✅' : '❌', fx.name);
  console.log('   shift', x, y, 'chrome', hint.chromeDetected, 'conf', hint.confidence.overall);
  if (!ok) {
    failed++;
    console.log('   expected', fx.expect);
    console.log('   evidence', JSON.stringify(hint.evidence, null, 2));
  }
}

if (failed) process.exit(1);
console.log('All host-layout-hint fixtures passed.');
