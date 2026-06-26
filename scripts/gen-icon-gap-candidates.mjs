#!/usr/bin/env node
/**
 * gen-icon-gap-candidates.mjs
 *
 * 读取 _render_gaps_report.json 中的 iconGapCandidates，
 * 扫描 assetsDir（PNG 文件列表），按名称相似度 + 矩形近邻为每个缺口图标
 * 自动推荐最佳 slice 候选，输出 _icon_gap_candidates.json。
 *
 * 输出格式（可直接作为 _icon_gap_overlays.json 草稿，确认后重命名）：
 * {
 *   generatedAt: ISO,
 *   assetsDir: string,
 *   comment: string,
 *   totalGaps: N,
 *   confirmedCount: 0,      // 人工确认后更新
 *   items: [
 *     {
 *       elementId,
 *       name,
 *       rect,
 *       kind,               // 'empty-group' | 'ghost-bitmap-shape'
 *       reason,             // 来自 render_gaps_report
 *       candidates: [
 *         { file, score, basis }  // score 0-1, basis: 'name-exact'|'name-fuzzy'|'rect-nearest'|'no-match'
 *       ],
 *       recommended: { file, score, basis } | null,
 *       status: 'auto-resolved' | 'needs-review' | 'no-candidate',
 *     }, ...
 *   ],
 *   unresolved: [elementId, ...]   // status != auto-resolved
 * }
 *
 * Usage:
 *   node gen-icon-gap-candidates.mjs <outDir> [assetsDir]
 *
 * assetsDir 可选；若省略，脚本尝试读 outDir 中的 _all_elements.json assetsDir 字段，
 * 或直接在 outDir 中查找 PNG 文件。
 */

import fs from 'node:fs';
import path from 'node:path';
import { FULLSCREEN_BACKDROP_BASENAMES, SMALL_GHOST_AREA_RATIO } from '../templates/shared/layerUrl.mjs';

const [, , outDir, assetsDirArg] = process.argv;
if (!outDir) {
  console.error('Usage: node gen-icon-gap-candidates.mjs <outDir> [assetsDir]');
  process.exit(1);
}

const gapsPath = path.join(outDir, '_render_gaps_report.json');
if (!fs.existsSync(gapsPath)) {
  console.error(`[gen-icon-gap-candidates] 缺少 ${gapsPath}，请先运行 extract-all-elements.mjs`);
  process.exit(1);
}

const gapsReport = JSON.parse(fs.readFileSync(gapsPath, 'utf8'));
const iconGaps = gapsReport.iconGapCandidates || [];

let boardArea = 1920 * 1080;
const allElementsPath = path.join(outDir, '_all_elements.json');
if (fs.existsSync(allElementsPath)) {
  try {
    const ae = JSON.parse(fs.readFileSync(allElementsPath, 'utf8'));
    if (ae.board?.w && ae.board?.h) boardArea = ae.board.w * ae.board.h;
  } catch (_) { /* keep default */ }
}

if (iconGaps.length === 0) {
  console.log('[gen-icon-gap-candidates] 无 iconGapCandidates，无需生成候选文件。');
  process.exit(0);
}

// ── 扫描可用 slice 文件 ──────────────────────────────────────────────────────

/** 递归扫描目录，返回所有 .png/.jpg/.svg 文件（相对 assetsDir 的路径） */
function scanAssets(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const result = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(d, entry.name));
      } else if (/\.(png|jpg|jpeg|svg)$/i.test(entry.name)) {
        result.push(path.relative(dir, path.join(d, entry.name)).replace(/\\/g, '/'));
      }
    }
  }
  walk(dir);
  return result;
}

const assetsDir = assetsDirArg || outDir;
const allSlices = scanAssets(assetsDir);

// ── 名称相似度算法 ────────────────────────────────────────────────────────────

/** 简单字符 bigram 相似度（Jaccard on char bigrams） */
function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function jaccardSim(a, b) {
  const ba = bigrams(a), bb = bigrams(b);
  if (ba.size === 0 && bb.size === 0) return 1;
  if (ba.size === 0 || bb.size === 0) return 0;
  let inter = 0;
  for (const g of ba) if (bb.has(g)) inter++;
  return inter / (ba.size + bb.size - inter);
}

/** 规范化名称：去扩展名、去特殊字符、转小写 */
function normName(name) {
  return (name || '')
    .replace(/\.(png|jpg|jpeg|svg)$/i, '')
    .replace(/[@_\-\s()[\]（）【】]+/g, ' ')
    .trim()
    .toLowerCase();
}

// ── 矩形中心距离 ──────────────────────────────────────────────────────────────

function rectCenter(rect) {
  return { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };
}

function rectDist(a, b) {
  if (!a || !b) return Infinity;
  const ca = rectCenter(a), cb = rectCenter(b);
  return Math.sqrt((ca.cx - cb.cx) ** 2 + (ca.cy - cb.cy) ** 2);
}

/** 全屏背景类切片：不得作为小 ghost 的 recommended（见 hard-won-rules 规则 64） */
function isBackdropFile(file) {
  return FULLSCREEN_BACKDROP_BASENAMES.has(path.basename(String(file).replace(/\\/g, '/')));
}

function gapAreaOf(gap) {
  const r = gap.rect;
  return r ? r.w * r.h : 0;
}

/**
 * 对单个 gap 打分所有 slices，返回 top-3 候选。
 * score 构成：名称相似度（权重 0.7）+ 尺寸比例相似（权重 0.3）
 */
function matchCandidates(gap, slices) {
  if (slices.length === 0) return [];

  const area = gapAreaOf(gap);
  const denyBackdrop = area > 0 && area < boardArea * SMALL_GHOST_AREA_RATIO;
  const usable = denyBackdrop ? slices.filter((f) => !isBackdropFile(f)) : slices;
  if (usable.length === 0) return [];

  const gapNorm = normName(gap.name);

  const scored = usable.map(file => {
    const fileNorm = normName(path.basename(file));
    const nameSim = jaccardSim(gapNorm, fileNorm);

    // 完整包含关系（中文名 vs 拼音文件名也可能此判断为 false，但 bigram 会为 0）
    const exactMatch = gapNorm.length > 0 && (
      fileNorm.includes(gapNorm) || gapNorm.includes(fileNorm)
    );

    const score = Math.min(1, nameSim * 0.7 + (exactMatch ? 0.3 : 0));
    let basis;
    if (exactMatch) basis = 'name-exact';
    else if (nameSim > 0.3) basis = 'name-fuzzy';
    else if (score > 0) basis = 'name-partial';
    else basis = 'rect-nearest'; // 分数为 0 时降级为「几何近邻」（无 rect 信息时为最低优先）
    return { file, score, basis };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

// ── 主流程 ───────────────────────────────────────────────────────────────────

const AUTO_RESOLVE_THRESHOLD = 0.55; // ≥ 此分数视为 auto-resolved

const items = iconGaps.map(gap => {
  const candidates = matchCandidates(gap, allSlices);
  const recommended = candidates.length > 0 ? candidates[0] : null;

  let status;
  if (!recommended) {
    status = 'no-candidate';
  } else if (recommended.score >= AUTO_RESOLVE_THRESHOLD) {
    status = 'auto-resolved';
  } else {
    status = 'needs-review';
  }

  return {
    elementId: gap.id,
    name: gap.name || '',
    rect: gap.rect,
    kind: gap.kind,
    reason: gap.reason,
    candidates,
    recommended,
    status,
  };
});

const unresolved = items
  .filter(i => i.status !== 'auto-resolved')
  .map(i => i.elementId);

const summary = {
  autoResolved: items.filter(i => i.status === 'auto-resolved').length,
  needsReview:  items.filter(i => i.status === 'needs-review').length,
  noCandidate:  items.filter(i => i.status === 'no-candidate').length,
};

const result = {
  generatedAt: new Date().toISOString(),
  assetsDir: assetsDir,
  comment: 'gen-icon-gap-candidates 自动产出。status=auto-resolved 可直接复制到 _icon_gap_overlays.json；needs-review 须人工选择 candidates[0-2]；no-candidate 须手工提供 file。',
  totalGaps: items.length,
  confirmedCount: 0,
  summary,
  items,
  unresolved,
};

const outPath = path.join(outDir, '_icon_gap_candidates.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

console.log(`[gen-icon-gap-candidates] 完成：${items.length} 个图标缺口`);
console.log(`  auto-resolved=${summary.autoResolved}  needs-review=${summary.needsReview}  no-candidate=${summary.noCandidate}`);
console.log(`  输出：${outPath}`);

if (unresolved.length > 0) {
  console.warn(`[gen-icon-gap-candidates] ${unresolved.length} 个缺口需人工处理：确认后写入 _icon_gap_overlays.json`);
}
