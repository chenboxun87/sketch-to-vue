#!/usr/bin/env node
/**
 * audit-skip-layers.mjs
 *
 * 读取 _all_elements.json 的 stats（skipReasons + byType），
 * 对照已知安全白名单，分类输出 _skip_audit.json。
 *
 * 退出码语义：
 *   0 = 所有 skip/type 均在白名单内，放行
 *   2 = 存在「已知但需确认」的 skip 类型（WARNING 级，通常安全但须人工复查）
 *   3 = 存在白名单外的未知 layer type（ERROR 级，必须人工审查后才能继续）
 *   1 = 输入错误（缺文件）
 *
 * 白名单设计：
 *   SKIP_WHITELIST    — skipReasons 中安全可忽略的 key（exit 0）
 *   SKIP_WARN_LIST    — skipReasons 中需要提示但不阻断的 key（exit 2）
 *   TYPE_WHITELIST    — byType 中已知的 layer type（exit 0）
 *   TYPE_WARN_LIST    — byType 中已知但需复查的 type（exit 2）
 *   其余 skipReason/type → exit 3
 *
 * Usage:
 *   node audit-skip-layers.mjs <outDir>
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , outDir] = process.argv;
if (!outDir) {
  console.error('Usage: node audit-skip-layers.mjs <outDir>');
  process.exit(1);
}

const elementsPath = path.join(outDir, '_all_elements.json');
if (!fs.existsSync(elementsPath)) {
  console.error(`[audit-skip-layers] 缺少 ${elementsPath}，请先运行 extract-all-elements.mjs`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(elementsPath, 'utf8'));
const stats = raw.stats || {};
const skipReasons = stats.skipReasons || {};
const byType = stats.byType || {};

// ── 白名单定义 ────────────────────────────────────────────────────────────────

/**
 * skipReasons 安全白名单：这些原因下 skip 是设计行为，无需审查。
 */
const SKIP_WHITELIST = new Set([
  '无rect',               // 没有几何信息的图层，MeaXure 正常现象
]);

/**
 * skipReasons 警告白名单：skip 有已知解释，但建议人工确认数量是否异常。
 */
const SKIP_WARN_LIST = new Set([
  'zero-area',            // 宽或高为 0 的图层（可能是隐藏占位层）
  'rotation-only',        // 仅有旋转无填充的图层
  'opacity-zero',         // 完全透明图层
  'mask-layer',           // 蒙版图层（不直接渲染）
  'hidden',               // 标记 hidden=true 的图层
]);

/**
 * byType 安全白名单：已知的 MeaXure layer type，正常处理。
 */
const TYPE_WHITELIST = new Set([
  'group',
  'symbol',
  'slice',
  'text',
  'shape',
  'bitmap',               // 嵌入位图（会被 base64 提取）
  'image',                // 同 bitmap 别名
  'rectangle',            // Sketch 矩形（会被分类为 shape）
  'oval',                 // 椭圆
  'path',                 // 路径/矢量
  'shapeGroup',           // 复合路径
  'symbolInstance',       // Symbol 实例（同 symbol）
  'page',                 // 页面节点（父级，无需渲染）
  'artboard',             // 画板（父级）
]);

/**
 * byType 警告白名单：已知类型但 MeaXure 处理不一致，遇到时须确认。
 */
const TYPE_WARN_LIST = new Set([
  'unknown',              // type 字段缺失或识别失败
  'hotspot',              // Sketch 热区（无视觉输出，但需确认无内容遗漏）
  'exportSlice',          // 导出切片节点（通常已被 slice 覆盖）
]);

// ── 审计逻辑 ──────────────────────────────────────────────────────────────────

const skipAudit = [];
for (const [reason, count] of Object.entries(skipReasons)) {
  let level;
  if (SKIP_WHITELIST.has(reason)) level = 'ok';
  else if (SKIP_WARN_LIST.has(reason)) level = 'warn';
  else level = 'error';
  skipAudit.push({ reason, count, level });
}

const typeAudit = [];
for (const [type, count] of Object.entries(byType)) {
  let level;
  if (TYPE_WHITELIST.has(type)) level = 'ok';
  else if (TYPE_WARN_LIST.has(type)) level = 'warn';
  else level = 'error';
  typeAudit.push({ type, count, level });
}

const hasError = skipAudit.some(e => e.level === 'error') || typeAudit.some(e => e.level === 'error');
const hasWarn  = skipAudit.some(e => e.level === 'warn')  || typeAudit.some(e => e.level === 'warn');

const overallStatus = hasError ? 'error' : hasWarn ? 'warn' : 'ok';

const errorItems = [
  ...skipAudit.filter(e => e.level === 'error').map(e => `skipReason="${e.reason}" count=${e.count}`),
  ...typeAudit.filter(e => e.level === 'error').map(e => `type="${e.type}" count=${e.count}`),
];
const warnItems = [
  ...skipAudit.filter(e => e.level === 'warn').map(e => `skipReason="${e.reason}" count=${e.count}`),
  ...typeAudit.filter(e => e.level === 'warn').map(e => `type="${e.type}" count=${e.count}`),
];

const result = {
  generatedAt: new Date().toISOString(),
  overallStatus,
  summary: {
    totalSkipped: stats.skipped || 0,
    totalLayers:  stats.total || 0,
    skipReasonCount: Object.keys(skipReasons).length,
    typeCount:       Object.keys(byType).length,
    errorCount: errorItems.length,
    warnCount:  warnItems.length,
  },
  skipAudit,
  typeAudit,
  errors: errorItems,
  warnings: warnItems,
  whitelists: {
    skipWhitelist:  Array.from(SKIP_WHITELIST),
    skipWarnList:   Array.from(SKIP_WARN_LIST),
    typeWhitelist:  Array.from(TYPE_WHITELIST),
    typeWarnList:   Array.from(TYPE_WARN_LIST),
    comment: '如需扩充白名单，在 audit-skip-layers.mjs 的 SKIP_WHITELIST/TYPE_WHITELIST 中添加，并说明原因。',
  },
  resolution: hasError
    ? '【必须处理】将未知 skipReason/type 加入对应白名单（需分析后确认安全），或排查 extract 逻辑。'
    : hasWarn
      ? '【建议确认】warn 级项目通常安全，确认 count 数量合理后可放行。'
      : '所有 skip/type 均在白名单内，可放行。',
};

const outPath = path.join(outDir, '_skip_audit.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

// ── 输出摘要 ──────────────────────────────────────────────────────────────────
const statusEmoji = { ok: '✅', warn: '⚠️', error: '❌' };
console.log(`[audit-skip-layers] ${statusEmoji[overallStatus]} overallStatus=${overallStatus}`);
console.log(`  总层数=${result.summary.totalLayers}  跳过=${result.summary.totalSkipped}`);
if (errorItems.length) console.error('  ERROR:', errorItems.join(' | '));
if (warnItems.length)  console.warn('  WARN:', warnItems.join(' | '));
console.log(`  输出：${outPath}`);

if (hasError) process.exit(3);
if (hasWarn)  process.exit(2);
process.exit(0);
