#!/usr/bin/env node
/** 纯函数：deriveHostDecision 三态决策 + 确认件覆盖 */
import { deriveHostDecision, detectHostLayoutHint } from './host-layout-hint.mjs';

let failed = 0;
function check(name, cond) {
  console.log(cond ? '✅' : '❌', name);
  if (!cond) failed++;
}
function buildHint(overall, chrome) {
  return { confidence: { x: 0, y: 0, overall }, chromeDetected: chrome };
}

// 1. 高置信侧栏 → embed/resolved，scale 派生
let d = deriveHostDecision(buildHint(0.82, true), {});
check('高置信 host=embed/resolved', d.host.value === 'embed' && d.host.status === 'resolved');
check('高置信 scale=widthFill/resolved', d.scale.value === 'widthFillVerticalScroll' && d.scale.status === 'resolved');

// 2. 无壳 → fullscreen/resolved
d = deriveHostDecision(buildHint(0.92, false), {});
check('无壳 host=fullscreen/resolved', d.host.value === 'fullscreen' && d.host.status === 'resolved');
check('无壳 scale=letterbox/resolved', d.scale.value === 'letterboxMinVwVh' && d.scale.status === 'resolved');

// 3. 弱信号 [0.5,0.7) → embed/needs_confirmation
d = deriveHostDecision(buildHint(0.6, true), {});
check('弱信号 host=needs_confirmation', d.host.status === 'needs_confirmation' && d.host.value === 'embed');
check('弱信号 scale 继承 needs_confirmation', d.scale.status === 'needs_confirmation' && d.scale.value === null);

// 4. 极低置信 <0.5 → host 无值
d = deriveHostDecision(buildHint(0.3, true), {});
check('极低置信 host.value=null', d.host.value === null && d.host.status === 'needs_confirmation');

// 5. arch 缺省 → renderArchitecture needs_confirmation，顶层 needs_confirmation
d = deriveHostDecision(buildHint(0.92, false), {});
check('arch 缺省 → renderArchitecture needs_confirmation', d.renderArchitecture.status === 'needs_confirmation' && d.renderArchitecture.value === null);
check('arch 缺省 → 顶层 needs_confirmation', d.status === 'needs_confirmation');

// 6. arch 给定合法 → resolved；全 resolved → 顶层 resolved
d = deriveHostDecision(buildHint(0.92, false), { arch: 'layerStack' });
check('arch=layerStack/resolved', d.renderArchitecture.value === 'layerStack' && d.renderArchitecture.source === 'input' && d.renderArchitecture.status === 'resolved');
check('全 resolved → 顶层 resolved', d.status === 'resolved');

// 7. arch 非法 → 仍 needs_confirmation
d = deriveHostDecision(buildHint(0.92, false), { arch: 'bogus' });
check('arch 非法 → needs_confirmation', d.renderArchitecture.status === 'needs_confirmation');

// 8. 确认件覆盖弱信号 host + 缺省 arch → 顶层 resolved
d = deriveHostDecision(buildHint(0.6, true), {
  confirm: { host: 'embed', renderArchitecture: 'anchorComponents', reason: 'x', confirmedBy: 'human' },
});
check('确认件覆盖 host → resolved', d.host.status === 'resolved');
check('确认件覆盖后 scale 自动派生', d.scale.value === 'widthFillVerticalScroll' && d.scale.status === 'resolved');
check('确认件覆盖 arch → resolved', d.renderArchitecture.value === 'anchorComponents' && d.renderArchitecture.status === 'resolved');
check('确认件覆盖 → 顶层 resolved', d.status === 'resolved');
check('confirmApplied 标记', d.confirmApplied === true);

// 9. thresholds 暴露
d = deriveHostDecision(buildHint(0.92, false), {});
check('thresholds 暴露 0.7/0.5', d.thresholds.embedResolved === 0.7 && d.thresholds.minConsider === 0.5);

// 10. detectHostLayoutHint 输出含 decision 块且保留旧字段
const board = { w: 1920, h: 1080 };
const hintEmpty = detectHostLayoutHint(board, []);
check('空元素早返回仍含 decision', hintEmpty.decision && typeof hintEmpty.decision.status === 'string');
check('空元素保留旧字段 contentShift', hintEmpty.contentShift && hintEmpty.contentShift.x === 0);
check('空元素保留旧字段 recommendations', !!hintEmpty.recommendations);

const hintFull = detectHostLayoutHint(board, [
  { id: 's1', name: 'sidebar', type: 'slice', rect: { x: 0, y: 0, w: 240, h: 900 }, opacity: 1 },
  { id: 'c1', name: 'card', type: 'shape', rect: { x: 248, y: 120, w: 600, h: 200 }, opacity: 1 },
]);
check('正常路径含 decision.host', !!hintFull.decision.host);
check('正常路径保留 confidence', typeof hintFull.confidence.overall === 'number');

// 11. 精确边界 exactly 0.7 → embed/resolved
d = deriveHostDecision(buildHint(0.7, true), {});
check('0.7 exactly → embed/resolved', d.host.value === 'embed' && d.host.status === 'resolved');

// 12. 精确边界 exactly 0.5 → embed/needs_confirmation
d = deriveHostDecision(buildHint(0.5, true), {});
check('0.5 exactly → embed/needs_confirmation', d.host.value === 'embed' && d.host.status === 'needs_confirmation');

// 13. 低于 0.5 → host.value=null
d = deriveHostDecision(buildHint(0.4999, true), {});
check('<0.5 → host.value=null', d.host.value === null);

if (failed) { console.error(`${failed} 项失败`); process.exit(1); }
console.log('All deriveHostDecision cases passed.');
