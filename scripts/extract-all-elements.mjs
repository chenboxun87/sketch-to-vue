// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-vue
// Licensed under CC BY-NC-ND 4.0 · Redistribution and derivative works prohibited.
// Extract ALL element attributes from a Sketch MeaXure HTML export.
// Produces: _all_elements.json, _coverage_map.json, _font_manifest.json, _render_plan.json,
//           _classification.json, _base64_manifest.json (+ _base64/), _missing_assets.json,
//           _layer_stack.json, _extraction_coverage.json, _host_layout_hint.json,
//           _render_gaps_report.json（§3.9 渲染缺口启发式，须人工映射 slice → _icon_gap_overlays.json）
// Usage: node extract-all-elements.mjs <index.html> <assetsDir> <outDir> [artboardIndex]

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { detectHostLayoutHint } from './host-layout-hint.mjs';
import { isDegenerateBorderPath } from '../templates/shared/vectorGuards.mjs';
import { classifyBlend } from './detect-slice-blend.mjs';
import { buildSceneGraph } from './scene-graph.mjs';
import { deriveEdges } from './scene-graph-edges.mjs';
import { classifyDisposition, hasRenderableStyle } from './disposition.mjs';
import { detectChartSubtrees } from './detect-chart-subtrees.mjs';
import { auditSceneGraph } from './audit-scene-graph.mjs';

const [, , htmlPath, assetsDir, outDir, artboardIdxArg] = process.argv;
if (!htmlPath || !outDir) {
  console.error('Usage: node extract-all-elements.mjs <index.html> <assetsDir> <outDir> [artboardIndex]');
  process.exit(1);
}
const artboardIndex = artboardIdxArg ? Number(artboardIdxArg) : 0;
const html = fs.readFileSync(htmlPath, 'utf8');
const data = parseMeaxureData(html);
const docMeta = {
  resolution: data.resolution, unit: data.unit, colorFormat: data.colorFormat,
  palette: Array.isArray(data.colors) ? data.colors.map(c => c['color-hex'] || c) : [],
  languages: data.languages || null,
  topSlices: Array.isArray(data.slices) ? data.slices.length : 0,
};
const artboard = data.artboards?.[artboardIndex];
if (!artboard) throw new Error(`No artboard at index ${artboardIndex}`);
// MeaXure artboards may carry geometry as `rect` or as flat width/height fields.
const board = normalizeRect(artboard.rect)
  || normalizeRect({ x: 0, y: 0, width: artboard.width, height: artboard.height });
if (!board || !board.w || !board.h) throw new Error('Cannot determine artboard board size');

fs.mkdirSync(outDir, { recursive: true });

const elements = [];
const stats = { total: 0, byType: {}, skipped: 0, skipReasons: {} };

function parseMeaxureData(source) {
  const marker = 'let data = {';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('Cannot find `let data = {`');
  let depth = 0, inString = false, quote = '', escaped = false, end = -1;
  const objStart = start + marker.length - 1;
  for (let i = objStart; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") { inString = true; quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Cannot parse data object');
  return JSON.parse(source.slice(objStart, end + 1));
}

// 扫描解析后的 data 对象，建立 base64 payload → 所属图层 objectID 的归属索引。
// 归属判据：该 data-uri 字符串出现在某个带 objectID 的图层节点子树内（fill/image/bitmap/exportable 等）。
function buildBase64Owners(data) {
  const owners = new Map();
  const reTest = /data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)/i;
  (function rec(node, owner) {
    if (node == null) return;
    let cur = owner;
    if (typeof node === 'object' && !Array.isArray(node) && node.objectID && node.rect) {
      cur = node.objectID;
    }
    if (typeof node === 'string') {
      const mm = node.match(reTest);
      if (mm && cur) owners.set(mm[1], cur);
      return;
    }
    if (Array.isArray(node)) { for (const v of node) rec(v, cur); return; }
    if (typeof node === 'object') { for (const k of Object.keys(node)) rec(node[k], cur); }
  })(data, null);
  return owners;
}

// 解码 HTML 内全部 data:image base64 落地为 PNG；resolveOwner(payload) 返回 {id,name,rect} 或 null。
// 有图层归属 → bound:true（供层栈/页面按层渲染）；无归属（全局 <style>/检查器 chrome/预览装饰）→ bound:false 仅存档。
function extractBase64Images(source, outDir, resolveOwner) {
  const dir = path.join(outDir, '_base64');
  const re = /data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/g;
  const out = [];
  let m, i = 0;
  while ((m = re.exec(source)) !== null) {
    const ext = m[1].replace('+xml', '').replace('jpeg', 'jpg');
    const payload = m[2];
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < 64) continue; // 跳过 1x1 占位等噪声
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `b64_${i}.${ext}`);
    fs.writeFileSync(file, buf);
    const owner = resolveOwner ? resolveOwner(payload) : null;
    if (owner) {
      out.push({ index: i, file, bytes: buf.length, mime: m[1], bound: true, elementId: owner.id, ownerName: owner.name, rect: owner.rect });
    } else {
      out.push({ index: i, file, bytes: buf.length, mime: m[1], bound: false, reason: '全局 <style>/检查器 chrome/预览装饰，无独立图层与 rect；落地存档不渲染，归 backdrop 报备，不强行放置' });
    }
    i++;
  }
  return out;
}

function normalizeRect(r) {
  if (!r) return null;
  return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
}
function round(v) { return Math.round((Number(v) || 0) * 100) / 100; }

// Read PNG width/height. Prefer the IHDR header (cheap) and fall back to pngjs.
function readPngSize(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    // PNG signature + IHDR: width is big-endian uint32 at byte 16, height at byte 20.
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
  } catch { /* fall through */ }
  try {
    const png = PNG.sync.read(fs.readFileSync(file));
    return { w: png.width, h: png.height };
  } catch {
    return null;
  }
}

function gradientAngle(grad) {
  if (!grad || !grad.from || !grad.to) return null;
  const dx = grad.to.x - grad.from.x;
  const dy = grad.to.y - grad.from.y;
  const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
  return Math.round(deg);
}

function extractFills(fills) {
  if (!Array.isArray(fills)) return undefined;
  return fills.map(f => {
    const g = f.gradient;
    const stops = g && (g.colorStops || g.stops);
    if (f.fillType === 'Gradient' && Array.isArray(stops) && stops.length >= 2) {
      return {
        type: 'gradient',
        angle: gradientAngle(g),
        stops: stops.map(s => ({
          color: s.color?.['css-rgba'] || s.color?.['color-hex'] || s.color,
          position: s.position,
        })),
      };
    }
    return {
      type: 'solid',
      color: f.color?.['css-rgba'] || f.color?.['color-hex'] || f.color,
    };
  });
}

function extractTextColor(layer) {
  const gFill = (layer.fills || []).find(f => {
    const stops = f.gradient && (f.gradient.colorStops || f.gradient.stops);
    return f.fillType === 'Gradient' && Array.isArray(stops) && stops.length >= 2;
  });
  if (gFill) return undefined;
  return layer.color?.['css-rgba'] || layer.color?.['color-hex'] || layer.color;
}

function aabb(rect, rotation) {
  if (!rotation || rotation === 0) return rect;
  const rad = Math.abs(rotation) * Math.PI / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const w = rect.w * cos + rect.h * sin;
  const h = rect.w * sin + rect.h * cos;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  return { x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h) };
}

function colorRgba(c) {
  if (!c) return undefined;
  return c['css-rgba'] || c['rgba-hex'] || c['color-hex'] || (typeof c === 'string' ? c : undefined);
}

function normalizeExports(exportable) {
  if (!Array.isArray(exportable) || exportable.length === 0) return undefined;
  return exportable.map(it => compact({ path: it.path, format: it.format, name: it.name, scale: it.scale }));
}
function compact(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)); }

// 解析 exportable.path 到 assets 真实文件：精确名 → @2x → @3x → 去 @Nx 变体。
function resolveAsset(declaredPath, assetsDir) {
  if (!declaredPath) return { found: false, file: null, declaredPath };
  if (!assetsDir) return { found: false, file: null, declaredPath };
  const ext = path.extname(declaredPath);
  const base = declaredPath.slice(0, -ext.length || undefined);
  const candidates = [
    declaredPath,
    `${base}@2x${ext}`,
    `${base}@3x${ext}`,
    base.replace(/@\dx$/, '') + ext,        // 声明里带 @2x 但文件没有
  ];
  for (const c of candidates) {
    const abs = path.join(assetsDir, c);
    if (fs.existsSync(abs)) return { found: true, file: abs, declaredPath, resolvedName: c, aliased: c !== declaredPath };
  }
  return { found: false, file: null, declaredPath };
}

function walk(layer, parentOffset, z) {
  stats.total++;
  const type = layer.type || 'unknown';
  stats.byType[type] = (stats.byType[type] || 0) + 1;

  const rect = normalizeRect(layer.rect);
  if (!rect) {
    stats.skipped++;
    stats.skipReasons['无rect'] = (stats.skipReasons['无rect'] || 0) + 1;
    return;
  }
  const absRect = { x: round(rect.x + parentOffset.x), y: round(rect.y + parentOffset.y), w: rect.w, h: rect.h };

  if (type === 'group' || type === 'symbol') {
    elements.push(compact({
      id: layer.objectID, name: layer.name, type, z,
      rect: absRect, opacity: layer.opacity, rotation: layer.rotation,
      isContainer: true,
    }));
    const kids = layer.layers || [];
    kids.forEach((c, i) => walk(c, { x: absRect.x, y: absRect.y }, z * 100 + i));
    return;
  }

  elements.push(compact({
    id: layer.objectID, name: layer.name, type, z,
    rect: absRect,
    aabb: aabb(absRect, layer.rotation),
    opacity: layer.opacity, rotation: layer.rotation,
    content: layer.content,
    // MeaXure stores the typeface as `fontFace`; older/other exports use `fontFamily`.
    fontFamily: layer.fontFamily || layer.fontFace, fontSize: layer.fontSize,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing, textAlign: layer.textAlign,
    color: extractTextColor(layer),
    colorRgba: colorRgba(layer.color),
    fills: extractFills(layer.fills),
    borders: layer.borders, shadows: layer.shadows,
    radius: layer.radius,
    css: Array.isArray(layer.css) && layer.css.length ? layer.css : undefined,
    styleName: layer.styleName || undefined,
    exports: normalizeExports(layer.exportable),
  }));
}

(artboard.layers || []).forEach((l, i) => walk(l, { x: 0, y: 0 }, i));

// 信息类判据：内容随运行时数据变化。数字/百分比/货币/日期 → 动态；纯中文/标签 → 静态。
// 注：数值正则会误判年份/刻度等静态数字，最终以 _classification.json 人工纠偏为准，不在此穷举。
function isDynamicNumber(content) {
  if (!content) return false;
  const t = String(content).trim();
  if (!t) return false;
  // 纯数字、带千分位、百分比、货币、数值+单位前缀
  return /^[¥$]?\d[\d,]*(\.\d+)?\s*(%|户|个|家|吨|tCO2e|kWh|万|亿)?$/.test(t)
      && /\d/.test(t);
}
function classify(e) {
  if (e.isContainer) return { role: 'container', reason: 'group/symbol 容器' };
  if (Array.isArray(e.exports) && e.exports.length) return { role: 'static-slice', reason: 'exportable 切片' };
  if (e.type === 'text') {
    if (isDynamicNumber(e.content)) return { role: 'dynamic-number', reason: `数值内容「${e.content}」` };
    return { role: 'static-text', reason: '非数值文本/标签' };
  }
  if (e.type === 'shape') return { role: 'static-vector', reason: 'shape 矢量层（按 css/fills 复刻）' };
  return { role: 'static-other', reason: e.type };
}
function rectContains(outer, inner) {
  return inner.x >= outer.x - 1 && inner.y >= outer.y - 1
      && inner.x + inner.w <= outer.x + outer.w + 1
      && inner.y + inner.h <= outer.y + outer.h + 1;
}
function rectOverlapsCenter(bg, el) {
  const cx = el.rect.x + el.rect.w / 2, cy = el.rect.y + el.rect.h / 2;
  return cx >= bg.rect.x && cx <= bg.rect.x + bg.rect.w && cy >= bg.rect.y && cy <= bg.rect.y + bg.rect.h;
}

const CELL = 50;
const cols = Math.ceil(board.w / CELL), rows = Math.ceil(board.h / CELL);
const grid = new Uint8Array(cols * rows);
const coverers = elements.filter(e =>
  (e.type === 'slice' || (e.type === 'shape' && e.rect.w > 200 && e.rect.h > 100) || e.isContainer)
);
for (const e of coverers) {
  const r = e.aabb || e.rect;
  const c0 = Math.max(0, Math.floor(r.x / CELL)), c1 = Math.min(cols - 1, Math.floor((r.x + r.w) / CELL));
  const r0 = Math.max(0, Math.floor(r.y / CELL)), r1 = Math.min(rows - 1, Math.floor((r.y + r.h) / CELL));
  for (let ry = r0; ry <= r1; ry++) for (let cx = c0; cx <= c1; cx++) grid[ry * cols + cx] = 1;
}
const uncoveredRegions = [];
const boardArea = board.w * board.h;
const visited = new Uint8Array(cols * rows);
for (let i = 0; i < grid.length; i++) {
  if (grid[i] || visited[i]) continue;
  const stack = [i]; let minC = cols, maxC = 0, minR = rows, maxR = 0;
  while (stack.length) {
    const idx = stack.pop();
    if (visited[idx] || grid[idx]) continue;
    visited[idx] = 1;
    const cx = idx % cols, ry = (idx - cx) / cols;
    minC = Math.min(minC, cx); maxC = Math.max(maxC, cx);
    minR = Math.min(minR, ry); maxR = Math.max(maxR, ry);
    if (cx > 0) stack.push(idx - 1);
    if (cx < cols - 1) stack.push(idx + 1);
    if (ry > 0) stack.push(idx - cols);
    if (ry < rows - 1) stack.push(idx + cols);
  }
  const rx = minC * CELL, ryy = minR * CELL;
  const rw = (maxC - minC + 1) * CELL, rh = (maxR - minR + 1) * CELL;
  const area = rw * rh;
  const ratio = area / boardArea;
  if (ratio > 0.01) {
    uncoveredRegions.push({ x: rx, y: ryy, w: rw, h: rh, areaRatio: Math.round(ratio * 1000) / 1000 });
  }
}
uncoveredRegions.sort((a, b) => b.areaRatio - a.areaRatio);

// === 信息/非信息分类 ===
const classification = elements.map(e => ({
  id: e.id, name: e.name, type: e.type, z: e.z, rect: e.rect, content: e.content,
  ...classify(e),
}));
const classCounts = classification.reduce((a, c) => (a[c.role] = (a[c.role] || 0) + 1, a), {});
fs.writeFileSync(path.join(outDir, '_classification.json'),
  JSON.stringify({ counts: classCounts, items: classification }, null, 2));
console.log('分类计数：', JSON.stringify(classCounts));

// === shape 覆盖判定 + 动态数字背景绑定 + 缺源清单 ===
const sliceEls = elements.filter(e => Array.isArray(e.exports) && e.exports.length);
const shapeEls = elements.filter(e => e.type === 'shape');
// 有可渲染样式（fill/border/shadow/gradient）的 shape 必须单独 vector-css 渲染，
// 即使落在父级 exportable 切片 bbox 内（组切片≠子层样式已烤入，如 table 行底色）。
// 仅无样式且被切片包含的 shape 视为已烤入切片。
const standaloneShapes = shapeEls.filter(sh =>
  hasRenderableStyle(sh) || !sliceEls.some(sl => rectContains(sl.rect, sh.rect)));
const cleanBgEls = [...sliceEls, ...standaloneShapes];

const dynamicNumbers = classification.filter(c => c.role === 'dynamic-number');
const missingAssets = [];
for (const dn of dynamicNumbers) {
  const el = elements.find(e => e.id === dn.id);
  // 命中多个背景时取面积最小者（真正的小卡片底，而非大面板）
  const bg = cleanBgEls
    .filter(bg => rectOverlapsCenter(bg, el))
    .reduce((best, cur) =>
      best && (best.rect.w * best.rect.h) <= (cur.rect.w * cur.rect.h) ? best : cur, null);
  dn.backgroundElementId = bg ? bg.id : null;
  if (!bg) {
    missingAssets.push({
      kind: 'card-bg', id: dn.id, name: dn.name, content: dn.content, rect: dn.rect,
      reason: '动态数字脚下无切片/矢量背景；需设计师补导卡片底（②B），留空报备，禁打补丁',
    });
  }
}
// 装饰底（页底渐变/全息图）：无图层/无 css/无 asset → 报备补导（①B）
for (const u of uncoveredRegions) {
  missingAssets.push({
    kind: 'backdrop', rect: { x: u.x, y: u.y, w: u.w, h: u.h }, areaRatio: u.areaRatio,
    reason: '暴露装饰区（渐变/全息图）无图层/css/asset；需设计师补导切片（①B），禁裁合并预览',
  });
}
// 缺图（missing-slice）与缺字体（missing-font）在切片校验/字体统计完成后并入，写盘见下方。

// === base64 内嵌图解码落地（先解析归属，供层栈/页面按层绑定渲染） ===
const base64Owners = buildBase64Owners(data); // payload -> 所属图层 objectID
const resolveB64Owner = (payload) => {
  const id = base64Owners.get(payload);
  if (!id) return null;
  const el = elements.find(e => e.id === id);
  return el ? { id, name: el.name, rect: el.rect } : { id };
};
const base64Images = extractBase64Images(html, outDir, resolveB64Owner);
const boundBase64ByElement = new Map();
for (const b of base64Images) { if (b.bound && b.elementId) boundBase64ByElement.set(b.elementId, b.file); }
const base64Bound = base64Images.filter(b => b.bound).length;
const base64Archived = base64Images.length - base64Bound;
fs.writeFileSync(path.join(outDir, '_base64_manifest.json'),
  JSON.stringify({ count: base64Images.length, bound: base64Bound, archived: base64Archived, images: base64Images }, null, 2));
console.log('base64 内嵌图落地：', base64Images.length, '张（绑定', base64Bound, '/ 存档', base64Archived, '）→', path.join(outDir, '_base64'));

// === z 序层栈 ===
const roleById = Object.fromEntries(classification.map(c => [c.id, c.role]));
const layerStack = elements
  .filter(e => !e.isContainer)
  .filter(e => !(e.type === 'shape' && !standaloneShapes.includes(e))) // 已烤入切片的 shape 不渲染
  .sort((a, b) => a.z - b.z)
  .map(e => {
    const role = roleById[e.id];
    let source;
    if (boundBase64ByElement.has(e.id)) {
      source = { kind: 'base64-file', file: boundBase64ByElement.get(e.id) };
    } else if (role === 'static-slice') {
      const r = resolveAsset(e.exports[0]?.path, assetsDir);
      source = r.found
        ? { kind: 'slice-file', file: r.file, aliased: !!r.aliased, css: e.css || undefined, shadows: e.shadows || undefined }
        : { kind: 'missing-slice', declaredPath: e.exports[0]?.path };
    } else if (role === 'static-vector') source = { kind: 'vector-css', css: e.css || null, fills: e.fills, radius: e.radius, borders: e.borders, shadows: e.shadows };
    else if (role === 'static-text' || role === 'dynamic-number') source = { kind: role === 'dynamic-number' ? 'live-text-dynamic' : 'live-text-static' };
    else source = { kind: 'other' };
    return { id: e.id, name: e.name, type: e.type, role, z: e.z, zIndex: e.z, rect: e.rect, source };
  });
fs.writeFileSync(path.join(outDir, '_layer_stack.json'),
  JSON.stringify({ count: layerStack.length, layers: layerStack }, null, 2));
const base64InStack = layerStack.filter(l => l.source.kind === 'base64-file').length;
console.log('裸露shape:', standaloneShapes.length, '/ 层栈:', layerStack.length, '/ 层栈base64-file:', base64InStack);

// === 场景图（M1 增量；与 _layer_stack.json 并存过渡）===
const sceneGraph = buildSceneGraph(artboard.layers, board);
// 标记切片是否在盘（供 disposition 第 4/5 级）
const onDisk = new Set(layerStack.filter((l) => l.source.kind === 'slice-file').map((l) => l.id));
for (const n of sceneGraph.nodes) {
  // MeaXure 原始字段是 exportable，disposition.mjs 期望归一化后的 exports
  if (Array.isArray(n.attrs.exportable) && n.attrs.exportable.length && !n.attrs.exports) {
    n.attrs.exports = n.attrs.exportable
      .map((it) => Object.fromEntries(Object.entries({ path: it.path, format: it.format, name: it.name, scale: it.scale }).filter(([, v]) => v != null)));
  }
  if (Array.isArray(n.attrs.exports) && n.attrs.exports.length) n.attrs._sliceOnDisk = onDisk.has(n.id);
  if (n.type === 'group' || n.type === 'symbol') n.attrs.isContainer = true;
}
// MeaXure JSON 为扁平导出（groups.layers=[]），从包围盒包含关系反推 child-of 边
if (!sceneGraph.edges.some((e) => e.type === 'child-of')) {
  const containers = sceneGraph.nodes
    .filter((n) => n.attrs.isContainer)
    .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h); // 面积升序 → 优先选最小的父容器
  for (const n of sceneGraph.nodes) {
    for (const g of containers) {
      if (g.id === n.id) continue;
      const cx = n.rect.x + n.rect.w / 2, cy = n.rect.y + n.rect.h / 2;
      if (cx >= g.rect.x && cx <= g.rect.x + g.rect.w && cy >= g.rect.y && cy <= g.rect.y + g.rect.h) {
        sceneGraph.edges.push({ type: 'child-of', from: n.id, to: g.id, confidence: 'derived' });
        break;
      }
    }
  }
}
// 派生语义边
sceneGraph.edges.push(...deriveEdges(sceneGraph));
// 子树图表检测 → composes-chart 边 + chart-zone 节点处置
const chart = detectChartSubtrees(sceneGraph, {});
const chartIndex = { members: chart.members, zones: new Set(chart.zones.map((z) => z.anchorId)) };
for (const z of chart.zones) for (const mid of z.memberIds) sceneGraph.edges.push({ type: 'composes-chart', from: mid, to: z.anchorId, confidence: 'derived' });
// 判定每个节点 disposition
for (const n of sceneGraph.nodes) n.disposition = classifyDisposition(n, sceneGraph, chartIndex);
fs.writeFileSync(path.join(outDir, 'scene-graph.json'), JSON.stringify(sceneGraph, null, 2));
fs.writeFileSync(path.join(outDir, '_chart_zones_sg.json'), JSON.stringify({ zones: chart.zones }, null, 2));
// 闸门（M2 阶段先 warn 不 fail）
const sgAudit = auditSceneGraph(sceneGraph);
fs.writeFileSync(path.join(outDir, '_scene_graph_audit.json'), JSON.stringify(sgAudit, null, 2));
console.log(sgAudit.ok ? '✅ 场景图完整性通过' : `⚠️ 场景图完整性 ${sgAudit.violations.length} 项待处理（M2 阶段 warn）`);

// === §3.9 渲染缺口启发式（检测-only；不自动补图） ===
function centerInRect(inner, outer) {
  const cx = inner.x + inner.w / 2, cy = inner.y + inner.h / 2;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}
function hasVisibleChild(groupEl) {
  return elements.some(e =>
    !e.isContainer && e.id !== groupEl.id && centerInRect(e.rect, groupEl.rect) &&
    ((Array.isArray(e.exports) && e.exports.length) ||
      (e.type === 'text' && e.content) ||
      (e.type === 'shape' && ((e.css && e.css.length) || (e.fills && e.fills.length))))
  );
}
function isFakeBarShapeForReport(el) {
  if (!el || el.type !== 'shape') return false;
  const r = el.rect;
  if (!r || r.w > 24 || r.w < 6 || r.h < 8) return false;
  const css = (el.css || []).join(' ');
  if (/linear-gradient/i.test(css) && /background/i.test(css)) return true;
  return r.w <= 18 && r.h >= 30 && /background\s*:\s*#/i.test(css);
}
function textsOverlapForReport(a, b) {
  if (Math.abs(a.rect.y - b.rect.y) > 2) return false;
  const ra = a.rect, rb = b.rect;
  return !(ra.x + ra.w < rb.x || rb.x + rb.w < ra.x);
}
function inContentArea(rect, shift) {
  if (!rect) return false;
  return rect.x >= (shift?.x || 0) && rect.y >= (shift?.y || 0);
}
function buildRenderGapsReport(shift) {
  const iconGapCandidates = [];
  for (const e of elements) {
    if (!inContentArea(e.rect, shift)) continue;
    if (e.isContainer && !hasVisibleChild(e)) {
      iconGapCandidates.push({ kind: 'empty-group', id: e.id, name: e.name, rect: e.rect,
        reason: 'group/symbol 无 exportable 子层，预览有图标但 stack 无 slice' });
      continue;
    }
    if (e.type === 'shape' && !(e.exports && e.exports.length)) {
      // 有 border/background 等可渲染样式 → vector-css，不是 ghost（见 disposition.hasRenderableStyle）
      if (!hasRenderableStyle(e) && e.rect.w >= 16 && e.rect.h >= 16) {
        iconGapCandidates.push({ kind: 'ghost-bitmap-shape', id: e.id, name: e.name, rect: e.rect,
          reason: 'shape 无可渲染样式，Sketch 位图未入 exportable' });
      }
    }
  }

  const textEls = elements.filter(e => e.type === 'text' && e.content && inContentArea(e.rect, shift));
  const duplicateTextGroups = [];
  const seenTextPair = new Set();
  for (let i = 0; i < textEls.length; i++) {
    for (let j = i + 1; j < textEls.length; j++) {
      const a = textEls[i], b = textEls[j];
      const sameCell = Math.round(a.rect.y / 2) === Math.round(b.rect.y / 2) &&
        Math.round(a.rect.x / 2) === Math.round(b.rect.x / 2);
      const overlapDup = textsOverlapForReport(a, b) &&
        (String(a.content).includes(String(b.content)) || String(b.content).includes(String(a.content)));
      if (!sameCell && !overlapDup) continue;
      const key = [a.id, b.id].sort().join('|');
      if (seenTextPair.has(key)) continue;
      seenTextPair.add(key);
      const keep = String(a.content).length >= String(b.content).length ? a : b;
      const drop = keep === a ? b : a;
      duplicateTextGroups.push({
        keepId: keep.id, keepContent: keep.content,
        dropId: drop.id, dropContent: drop.content,
        rect: keep.rect, reason: sameCell ? '同坐标 composite+fragment' : '同行重叠 composite+fragment',
      });
    }
  }

  const fakeBars = elements.filter(e => inContentArea(e.rect, shift) && isFakeBarShapeForReport(e));
  const chartSectionTitles = textEls.filter(t =>
    /趋势|分析|图表|chart/i.test(String(t.content || ''))
  ).map(t => ({ id: t.id, content: t.content, rect: t.rect,
    hint: '优先用 section 标题锚定 chart zone，再 overlapsChartZone 排除 stack 层' }));

  const degenerateBorderPaths = [];
  for (const e of elements) {
    const css = (e.source && e.source.css) || e.css || [];
    if (e.rect && isDegenerateBorderPath(css, e.rect)) {
      degenerateBorderPaths.push({ id: e.id, name: e.name, rect: e.rect });
    }
  }

  const blendHints = [];
  for (const e of layerStack) {
    const src = e.source || {};
    if (src.kind !== 'slice-file') continue;
    const file = src.file || src.path || '';
    if (!file || !fs.existsSync(file)) continue;
    const blend = classifyBlend(file);
    if (blend) blendHints.push({ id: e.id, name: e.name, blendMode: blend });
  }

  return {
    comment: '检测-only：Implement 层仍须 dedupeTextLayers / iconGapLayers / chartZones；图标映射写 _icon_gap_overlays.json',
    contentShiftFilter: shift,
    iconGapCandidates,
    duplicateTextGroups,
    fakeBarShapes: fakeBars.map(b => ({ id: b.id, name: b.name, rect: b.rect })),
    chartSectionTitles,
    degenerateBorderPaths,
    blendHints,
    counts: {
      iconGapCandidates: iconGapCandidates.length,
      duplicateTextGroups: duplicateTextGroups.length,
      fakeBarShapes: fakeBars.length,
      chartSectionTitles: chartSectionTitles.length,
      degenerateBorderPaths: degenerateBorderPaths.length,
      blendHints: blendHints.length,
    },
  };
}

function buildConsumeAudit(els) {
  const texts = els.filter((e) => e.type === 'text');
  const textWithGradient = texts.filter((e) =>
    (e.fills || []).some((f) => f.type === 'gradient' && (f.stops || []).length >= 2));
  const textWithSolid = texts.filter((e) =>
    (e.fills || []).some((f) => f.type === 'solid'));
  const withShadows = els.filter((e) => (e.shadows || []).length > 0);
  return {
    textWithGradientFills: textWithGradient.length,
    textWithSolidFillsOnly: textWithSolid.length,
    elementsWithShadows: withShadows.length,
    gradientTextIds: textWithGradient.map((e) => e.id).slice(0, 20),
    note: 'emit-html and Vue must consume fills[] via templates/shared/textStyle.mjs',
  };
}

const SYSTEM_FONTS = ['PingFang SC', 'PingFangSC', 'MicrosoftYaHeiUI', 'Microsoft YaHei', 'Arial', 'sans-serif'];
const fontMap = {};
for (const e of elements) {
  if (e.type === 'text' && e.fontFamily) {
    if (!fontMap[e.fontFamily]) fontMap[e.fontFamily] = { family: e.fontFamily, occurrences: 0, sampleText: e.content || '' };
    fontMap[e.fontFamily].occurrences++;
  }
}
const fonts = Object.values(fontMap).sort((a, b) => b.occurrences - a.occurrences);
const needsBundling = fonts.map(f => f.family).filter(f => !SYSTEM_FONTS.some(s => f.toLowerCase().includes(s.toLowerCase())));

// === Preview image + scale (for the @2x full-artboard real-pixel base) ===
const preview = { path: null, exists: false, px: null, scale: null };
if (artboard.imagePath) {
  const decoded = decodeURIComponent(artboard.imagePath);
  const previewAbsPath = path.resolve(path.dirname(htmlPath), decoded);
  preview.path = previewAbsPath;
  preview.exists = fs.existsSync(previewAbsPath);
  if (preview.exists) {
    const dims = readPngSize(previewAbsPath);
    if (dims) {
      preview.px = { w: dims.w, h: dims.h };
      preview.scale = Math.round((dims.w / board.w) * 10000) / 10000;
      const suffixMatch = path.basename(decoded).match(/@(\d+(?:\.\d+)?)x/);
      if (suffixMatch) {
        const suffixScale = Number(suffixMatch[1]);
        if (Math.abs(suffixScale - preview.scale) > 0.01) {
          preview.scaleWarning = `filename @${suffixScale}x vs pixel-derived ${preview.scale}`;
        }
      }
    }
  }
}

// === Slice file verification + render plan ===
const planElements = [];
const missingSlices = [];
let declaredSlices = 0;
let filesFound = 0;
const renderCounts = { ownSlice: 0, vectorCss: 0, reportToDesigner: 0, dynamicTextCandidate: 0, container: 0 };

for (const e of elements) {
  if (e.isContainer) {
    planElements.push({ id: e.id, name: e.name, type: e.type, rect: e.rect, render: 'container', reason: 'group/symbol container; children expanded' });
    renderCounts.container++;
    continue;
  }

  const exps = Array.isArray(e.exports) ? e.exports : [];
  if (exps.length > 0) {
    // Slice declares exportable files; resolve each via resolveAsset (@2x/@3x alias aware)
    // so render-plan / missing-assets agree with _layer_stack on aliased slices.
    declaredSlices += exps.length;
    let foundPath = null;
    let foundAliased = false;
    for (const ex of exps) {
      if (!ex.path) continue;
      const r = resolveAsset(ex.path, assetsDir);
      if (r.found) {
        filesFound++;
        if (!foundPath) { foundPath = r.file; foundAliased = !!r.aliased; }
      } else {
        missingSlices.push({ id: e.id, name: e.name, declaredPath: ex.path });
      }
    }
    if (foundPath) {
      planElements.push({ id: e.id, name: e.name, type: e.type, rect: e.rect, render: 'own-slice', sliceFile: foundPath, aliased: foundAliased, reason: 'exportable slice file present on disk (via resolveAsset)' });
      renderCounts.ownSlice++;
    } else if (e.type === 'shape' && hasRenderableStyle(e)) {
      planElements.push({ id: e.id, name: e.name, type: e.type, rect: e.rect, render: 'vector-css', reason: 'exportable 缺失但有可渲染样式，降级 vector-css' });
      renderCounts.vectorCss++;
    } else {
      planElements.push({ id: e.id, name: e.name, type: e.type, rect: e.rect, render: 'report-to-designer', reason: 'exportable 声明但文件缺失且无 vector-css 样式' });
      renderCounts.reportToDesigner++;
    }
    continue;
  }

  if (e.type === 'text') {
    planElements.push({ id: e.id, name: e.name, type: e.type, rect: e.rect, render: 'dynamic-text-candidate', reason: 'text 层；静态文本走活体文本，动态数据绑组件' });
    renderCounts.dynamicTextCandidate++;
    continue;
  }

  if (e.type === 'shape' && hasRenderableStyle(e)) {
    planElements.push({ id: e.id, name: e.name, type: e.type, rect: e.rect, render: 'vector-css', reason: 'shape 有可渲染样式(fill/border/shadow/gradient)，按 css/fills 复刻' });
    renderCounts.vectorCss++;
    continue;
  }

  // 无可渲染样式的 shape（位图填充未 export）→ 报备设计师补导
  planElements.push({ id: e.id, name: e.name, type: e.type, rect: e.rect, render: 'report-to-designer', reason: '缺源（位图/路径无 exportable 且无 css/fills）→ 报备设计师补导' });
  renderCounts.reportToDesigner++;
}

// Several slices can declare the same missing file; the meaningful number is unique missing files.
const uniqueMissingFiles = [...new Set(missingSlices.map(m => m.declaredPath))];

// 并入缺图（exportable 声明但 assets 无文件）与缺字体（设计字体未打包）到缺源清单后统一写盘。
// 缺图按 declaredPath 去重，但保留首个声明图层的 id/name/rect（供页面渲染 data-missing 占位）。
const seenMissingPath = new Set();
for (const ms of missingSlices) {
  if (seenMissingPath.has(ms.declaredPath)) continue;
  seenMissingPath.add(ms.declaredPath);
  const el = elements.find(e => e.id === ms.id);
  missingAssets.push(compact({
    kind: 'missing-slice', declaredPath: ms.declaredPath,
    id: ms.id, name: ms.name, rect: el ? el.rect : undefined,
    reason: 'exportable 声明但 assets 无文件；需设计师补导切片',
  }));
}
for (const family of needsBundling) {
  missingAssets.push({
    kind: 'missing-font', family,
    reason: '设计字体未打包；需提供字体文件，否则文本失真',
  });
}
fs.writeFileSync(path.join(outDir, '_missing_assets.json'),
  JSON.stringify({ count: missingAssets.length, items: missingAssets }, null, 2));
console.log('缺源项合计：', missingAssets.length,
  '(card-bg/backdrop/missing-slice/missing-font)');

const renderPlan = {
  board,
  preview: { path: preview.path, exists: preview.exists, px: preview.px, scale: preview.scale, usage: 'verification-baseline-only' },
  // 不再有 full-preview base：装饰底改由设计师补导（见 _missing_assets backdrop）
  elements: planElements,
  missingSlices,
  uniqueMissingFiles,
  summary: {
    total: planElements.length,
    ownSlice: renderCounts.ownSlice,
    vectorCss: renderCounts.vectorCss,
    reportToDesigner: renderCounts.reportToDesigner,
    dynamicTextCandidates: renderCounts.dynamicTextCandidate,
    container: renderCounts.container,
    declaredSlices,
    filesFound,
    missingSliceDeclarations: missingSlices.length,
    missingSlices: uniqueMissingFiles.length,
  },
};

const sliceScaleAudit = { items: [] };
for (const e of elements) {
  if (e.type !== 'slice' || !e.exports?.[0]?.path) continue;
  const r = resolveAsset(e.exports[0].path, assetsDir);
  if (!r.found) continue;
  const dims = readPngSize(r.file);
  if (!dims) continue;
  const sx = dims.w / e.rect.w, sy = dims.h / e.rect.h;
  const boxAR = e.rect.w / e.rect.h, pngAR = dims.w / dims.h;
  const arRatio = boxAR > pngAR ? boxAR / pngAR : pngAR / boxAR;
  if (Math.abs(sx - 1) > 0.08 || Math.abs(sy - 1) > 0.08 || arRatio > 1.15) {
    sliceScaleAudit.items.push({
      id: e.id, name: e.name, file: e.exports[0].path,
      rect: e.rect, png: dims, sx: +sx.toFixed(3), sy: +sy.toFixed(3), arRatio: +arRatio.toFixed(3),
      css: e.css,
      suggestFit: 'contain', suggestPosition: 'center center',
    });
  }
}
fs.writeFileSync(path.join(outDir, '_slice_scale_audit.json'), JSON.stringify(sliceScaleAudit, null, 2));

fs.writeFileSync(path.join(outDir, '_all_elements.json'),
  JSON.stringify({ source: htmlPath, board, docMeta, count: elements.length, elements }, null, 2));

const hostLayoutHint = detectHostLayoutHint(board, elements);
fs.writeFileSync(path.join(outDir, '_host_layout_hint.json'), JSON.stringify(hostLayoutHint, null, 2));

const renderGapsReport = buildRenderGapsReport(hostLayoutHint.contentShift);
fs.writeFileSync(path.join(outDir, '_render_gaps_report.json'),
  JSON.stringify(renderGapsReport, null, 2));
console.log('渲染缺口报告（content 区）：', JSON.stringify(renderGapsReport.counts),
  'shift', hostLayoutHint.contentShift.x + '×' + hostLayoutHint.contentShift.y,
  '→', path.join(outDir, '_render_gaps_report.json'));

const consumeAudit = buildConsumeAudit(elements);
fs.writeFileSync(path.join(outDir, '_consume_audit.json'),
  JSON.stringify(consumeAudit, null, 2));
console.log('消费审计：', JSON.stringify({
  gradient: consumeAudit.textWithGradientFills,
  solid: consumeAudit.textWithSolidFillsOnly,
  shadows: consumeAudit.elementsWithShadows,
}), '→', path.join(outDir, '_consume_audit.json'));

fs.writeFileSync(path.join(outDir, '_coverage_map.json'),
  JSON.stringify({ board, cell: CELL, uncoveredRegions }, null, 2));
fs.writeFileSync(path.join(outDir, '_font_manifest.json'),
  JSON.stringify({ fonts, systemFonts: SYSTEM_FONTS, needsBundling }, null, 2));
fs.writeFileSync(path.join(outDir, '_render_plan.json'),
  JSON.stringify(renderPlan, null, 2));

// 完整性自检：CONSUMED 白名单需与 walk() 提取字段手工对齐（新增提取字段时同步增删）。
const CONSUMED = new Set([
  'objectID','type','name','rect','content','color','fontSize','fontFace','fontFamily',
  'textAlign','letterSpacing','lineHeight','fills','borders','shadows','radius','rotation',
  'opacity','css','styleName','exportable','layers',
]);
const unmapped = {};
(function scan(ls){ for(const l of ls||[]){ for(const k of Object.keys(l)){ if(!CONSUMED.has(k)) unmapped[k]=(unmapped[k]||0)+1; } if(l.layers) scan(l.layers); } })(artboard.layers);
const coverage = { consumedFields: [...CONSUMED], unmappedFields: unmapped, ok: Object.keys(unmapped).length === 0 };
fs.writeFileSync(path.join(outDir, '_extraction_coverage.json'), JSON.stringify(coverage, null, 2));
if (!coverage.ok) {
  console.error('❌ 提取完整性自检失败：存在未映射字段', JSON.stringify(unmapped));
  process.exitCode = 2;
} else {
  console.log('✅ 提取完整性自检通过：无未映射字段');
}

console.log('=== 提取统计 ===');
console.log('解析图层总数：', stats.total);
console.log('按类型：', JSON.stringify(stats.byType));
console.log('跳过：', stats.skipped, '层');
console.log('跳过原因分类：', JSON.stringify(stats.skipReasons));
console.log('画板尺寸：', board.w + '×' + board.h);
console.log('=== 宿主布局提示 (_host_layout_hint.json) ===');
console.log('  contentShift：', hostLayoutHint.contentShift.x + '×' + hostLayoutHint.contentShift.y);
console.log('  stage：', hostLayoutHint.stage.w + '×' + hostLayoutHint.stage.h);
console.log('  chromeDetected：', hostLayoutHint.chromeDetected);
console.log('  confidence：', JSON.stringify(hostLayoutHint.confidence));
if (hostLayoutHint.recommendations.note) console.log('  →', hostLayoutHint.recommendations.note);
if (hostLayoutHint.warnings.length) hostLayoutHint.warnings.forEach(w => console.log('  ⚠️', w));
console.log('有效空洞（占比>1%）：', uncoveredRegions.length, '个');
uncoveredRegions.forEach(r => console.log(`  - [${r.x},${r.y} ${r.w}×${r.h}] 占比 ${(r.areaRatio*100).toFixed(1)}%`));
console.log('需打包字体：', needsBundling.join(', ') || '（无）');

console.log('=== 预览与渲染计划 ===');
console.log('预览路径：', preview.path || '（artboard 无 imagePath）');
console.log('预览存在：', preview.exists);
if (preview.px) console.log('预览像素：', preview.px.w + '×' + preview.px.h);
console.log('scale：', preview.scale);
if (preview.scaleWarning) console.log('⚠️ scale 交叉校验告警：', preview.scaleWarning);
console.log('声明切图数：', declaredSlices, '/ 找到文件数：', filesFound,
  '/ 缺失声明：', missingSlices.length, '/ 缺失唯一文件：', uniqueMissingFiles.length);
if (uniqueMissingFiles.length) {
  console.log('缺失切图清单（唯一文件）：');
  uniqueMissingFiles.forEach(p => console.log(`  - ${p}`));
}
console.log('渲染分类：own-slice=' + renderCounts.ownSlice,
  'vector-css=' + renderCounts.vectorCss,
  'report-to-designer=' + renderCounts.reportToDesigner,
  'dynamic-text-candidate=' + renderCounts.dynamicTextCandidate,
  'container=' + renderCounts.container);
console.log('输出目录：', outDir);
