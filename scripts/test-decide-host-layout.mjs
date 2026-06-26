#!/usr/bin/env node
/** 门禁 CLI：退出码 0=resolved / 3=needs_confirmation / 1=输入错误 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(dir, 'decide-host-layout.mjs');
let failed = 0;
function check(name, cond) { console.log(cond ? '✅' : '❌', name); if (!cond) failed++; }

function runCli(outDir, args) {
  try {
    execSync(`node "${CLI}" "${outDir}" ${args}`, { stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}
function mkOut(hint) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hostdec-'));
  fs.writeFileSync(path.join(d, '_host_layout_hint.json'), JSON.stringify(hint));
  return d;
}
const fullscreenHint = { confidence: { overall: 0.92 }, chromeDetected: false };
const weakHint = { confidence: { overall: 0.6 }, chromeDetected: true };

// 1. 高置信 + arch → exit 0，写出 _host_decision.json
let out = mkOut(fullscreenHint);
check('高置信+arch → exit 0', runCli(out, '--arch layerStack') === 0);
check('写出 _host_decision.json', fs.existsSync(path.join(out, '_host_decision.json')));
const dec = JSON.parse(fs.readFileSync(path.join(out, '_host_decision.json'), 'utf8'));
check('决策文件 status=resolved', dec.status === 'resolved');

// 2. 无 --arch → exit 3
out = mkOut(fullscreenHint);
check('缺 --arch → exit 3', runCli(out, '') === 3);

// 3. 弱信号 + arch → exit 3（host 未达阈值）
out = mkOut(weakHint);
check('弱信号 → exit 3', runCli(out, '--arch layerStack') === 3);

// 4. 弱信号 + arch + 合法确认件 → exit 0
out = mkOut(weakHint);
fs.writeFileSync(path.join(out, '_host_decision.confirm.json'),
  JSON.stringify({ host: 'embed', renderArchitecture: 'layerStack', reason: 'x', confirmedBy: 'human' }));
check('弱信号+确认件 → exit 0', runCli(out, '') === 0);

// 5. --arch 非法 → exit 1
out = mkOut(fullscreenHint);
check('--arch 非法 → exit 1', runCli(out, '--arch bogus') === 1);

// 6. 缺 hint 文件 → exit 1
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostdec-empty-'));
check('缺 hint 文件 → exit 1', runCli(emptyDir, '--arch layerStack') === 1);

if (failed) { console.error(`${failed} 项失败`); process.exit(1); }
console.log('All decide-host-layout cases passed.');
