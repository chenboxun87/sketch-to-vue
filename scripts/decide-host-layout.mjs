#!/usr/bin/env node
// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
/**
 * Step 0-A0 门禁：由 _host_layout_hint.json + --arch + 可选确认件计算唯一决策。
 * 退出码：0=resolved，3=needs_confirmation，1=输入错误。
 * 用法：node decide-host-layout.mjs <outDir> --arch <layerStack|anchorComponents>
 */
import fs from 'node:fs';
import path from 'node:path';
import { deriveHostDecision } from './host-layout-hint.mjs';

const ARCH_VALUES = ['layerStack', 'anchorComponents'];

function parseArgs(argv) {
  const rest = argv.slice(2);
  const args = { outDir: null, arch: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--arch') args.arch = rest[++i];
    else if (!a.startsWith('--') && args.outDir === null) args.outDir = a;
  }
  return args;
}

const { outDir, arch } = parseArgs(process.argv);

if (!outDir) {
  console.error('用法: node decide-host-layout.mjs <outDir> --arch <layerStack|anchorComponents>');
  process.exit(1);
}
if (arch !== null && !ARCH_VALUES.includes(arch)) {
  console.error(`--arch 非法: ${arch}（应为 ${ARCH_VALUES.join('|')}）`);
  process.exit(1);
}

const hintPath = path.join(outDir, '_host_layout_hint.json');
if (!fs.existsSync(hintPath)) {
  console.error(`缺少 ${hintPath}，请先运行 extract-all-elements.mjs`);
  process.exit(1);
}

let hint;
try {
  hint = JSON.parse(fs.readFileSync(hintPath, 'utf8'));
} catch (e) {
  console.error(`无法解析 ${hintPath}: ${e.message}`);
  process.exit(1);
}
if (!hint || !hint.confidence) {
  console.error('hint 文件缺少 confidence 字段');
  process.exit(1);
}

const confirmPath = path.join(outDir, '_host_decision.confirm.json');
let confirm = null;
if (fs.existsSync(confirmPath)) {
  try {
    confirm = JSON.parse(fs.readFileSync(confirmPath, 'utf8'));
  } catch (e) {
    console.error(`无法解析 ${confirmPath}: ${e.message}`);
    process.exit(1);
  }
}

const decision = deriveHostDecision(hint, { arch, confirm });
fs.writeFileSync(path.join(outDir, '_host_decision.json'), JSON.stringify(decision, null, 2));

console.log('host:', JSON.stringify(decision.host));
console.log('scale:', JSON.stringify(decision.scale));
console.log('renderArchitecture:', JSON.stringify(decision.renderArchitecture));
console.log('status:', decision.status);

if (decision.status === 'resolved') process.exit(0);

const pending = [];
if (decision.host.status !== 'resolved') pending.push('host(置信度不足/无壳信号弱)');
if (decision.scale.status !== 'resolved') pending.push('scale(随 host 待定)');
if (decision.renderArchitecture.status !== 'resolved') pending.push('renderArchitecture(缺 --arch)');
console.error('需人工确认:', pending.join(', '));
console.error(`补 --arch，或写 ${confirmPath}（{host,renderArchitecture[,scale],reason,confirmedBy}）后重跑。`);
process.exit(3);
