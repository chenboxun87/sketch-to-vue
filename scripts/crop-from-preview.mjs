// crop-from-preview.mjs —— ⚠️ 仅用于「视觉验证基准」对照图生成，禁止作为生产像素源。
// 按 spec §3.9：合并 @2x preview 不再为任何元素提供像素；元素一律走 slice 文件 / 矢量 css / base64 / 活体文本。
// 本脚本保留 alpha 抠空能力，仅供生成 SSIM/像素差异对照基准时使用。
// Usage: node crop-from-preview.mjs <index.html> <regionsJson> <outDir> [artboardIndex]
//   <regionsJson>: JSON array [{ "name": "center-bg", "rect": {"x":800,"y":300,"width":1300,"height":700} }, ...]
//   rect uses artboard logical coordinates (top-left origin).

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [, , htmlPath, regionsJsonPath, outDir, artboardIdxArg] = process.argv;
if (!htmlPath || !regionsJsonPath || !outDir) {
  console.error('Usage: node crop-from-preview.mjs <index.html> <regionsJson> <outDir> [artboardIndex]');
  process.exit(1);
}
const artboardIndex = artboardIdxArg ? Number(artboardIdxArg) : 0;

if (!fs.existsSync(htmlPath)) {
  console.error(`index.html not found: ${htmlPath}`);
  process.exit(1);
}
if (!fs.existsSync(regionsJsonPath)) {
  console.error(`regions JSON not found: ${regionsJsonPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const data = parseMeaxureData(html);
const artboard = data.artboards?.[artboardIndex];
if (!artboard) throw new Error(`No artboard at index ${artboardIndex}`);

// MeaXure artboards may carry geometry as `rect` or as flat width/height fields.
const board = normalizeRect(artboard.rect)
  || normalizeRect({ x: 0, y: 0, width: artboard.width, height: artboard.height });
if (!board || !board.w || !board.h) throw new Error('Cannot determine artboard board size');

// Resolve the @2x preview image path: URL-decode, then resolve relative to index.html dir.
if (!artboard.imagePath) throw new Error('artboard has no imagePath (no preview image declared)');
const decodedImagePath = decodeURIComponent(artboard.imagePath);
const previewAbsPath = path.resolve(path.dirname(htmlPath), decodedImagePath);
if (!fs.existsSync(previewAbsPath)) {
  console.error(`Preview image not found: ${previewAbsPath}`);
  console.error(`  (declared imagePath="${artboard.imagePath}" decoded="${decodedImagePath}")`);
  process.exit(1);
}

// Decode the preview PNG and derive scale = preview pixel width / artboard logical width.
const png = PNG.sync.read(fs.readFileSync(previewAbsPath));
const scale = png.width / board.w;

// Cross-check against the @<n>x suffix in the filename, if present.
const suffixMatch = path.basename(decodedImagePath).match(/@(\d+(?:\.\d+)?)x/);
if (suffixMatch) {
  const suffixScale = Number(suffixMatch[1]);
  if (Math.abs(suffixScale - scale) > 0.01) {
    console.warn(`⚠️ scale mismatch: filename suffix @${suffixScale}x vs pixel-derived ${scale.toFixed(4)} — using pixel-derived.`);
  }
}

const regions = JSON.parse(fs.readFileSync(regionsJsonPath, 'utf8'));
if (!Array.isArray(regions)) throw new Error('regions JSON must be an array');

fs.mkdirSync(outDir, { recursive: true });

console.log('=== crop-from-preview ===');
console.log('预览路径：', previewAbsPath);
console.log('像素尺寸：', png.width + '×' + png.height);
console.log('画板逻辑尺寸：', board.w + '×' + board.h);
console.log('scale：', scale);
console.log('裁剪数量：', regions.length);

const manifest = [];
let okCount = 0;
for (const region of regions) {
  const name = region.name || `region_${manifest.length}`;
  const rect = region.rect || region;
  const srcRect = {
    x: Number(rect.x) || 0,
    y: Number(rect.y) || 0,
    width: Number(rect.width) || 0,
    height: Number(rect.height) || 0,
  };

  // Logical rect -> pixel crop box (round, clamp to image bounds).
  let pxX = Math.max(0, Math.round(srcRect.x * scale));
  let pxY = Math.max(0, Math.round(srcRect.y * scale));
  let pxW = Math.min(png.width - pxX, Math.round(srcRect.width * scale));
  let pxH = Math.min(png.height - pxY, Math.round(srcRect.height * scale));
  const pxRect = { x: pxX, y: pxY, w: pxW, h: pxH };

  if (pxW <= 0 || pxH <= 0) {
    console.warn(`  ✗ ${name}: 裁剪框无效（像素 ${pxW}×${pxH}），跳过`);
    manifest.push({ name, srcRect, pxRect, scale, file: null, w: 0, h: 0, error: 'empty-crop' });
    continue;
  }

  const out = cropPixels(png, pxRect);
  const safeName = safeFileName(name);
  const file = path.join(outDir, `${safeName}.png`);
  fs.writeFileSync(file, PNG.sync.write(out));
  okCount++;

  manifest.push({ name, srcRect, pxRect, scale, file, w: out.width, h: out.height });
  console.log(
    `  ✓ ${name}: 逻辑[${srcRect.x},${srcRect.y} ${srcRect.width}×${srcRect.height}]` +
    ` → 像素[${pxRect.x},${pxRect.y} ${pxRect.w}×${pxRect.h}] → ${file}`
  );
}

const manifestPath = path.join(outDir, '_crop_manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({
  preview: previewAbsPath,
  previewPx: { w: png.width, h: png.height },
  board,
  scale,
  crops: manifest,
}, null, 2));

console.log('成功裁剪：', okCount, '/', regions.length);
console.log('裁剪清单：', manifestPath);
console.log('输出目录：', outDir);

// --- helpers ---

function cropPixels(src, px) {
  const out = new PNG({ width: px.w, height: px.h });
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const si = ((px.y + y) * src.width + (px.x + x)) * 4;
      const di = (y * px.w + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function safeFileName(name) {
  // Keep CJK/letters/digits/dash/underscore/dot; strip path separators and other unsafe chars.
  return String(name)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 120) || 'region';
}

function normalizeRect(r) {
  if (!r) return null;
  return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
}
function round(v) { return Math.round((Number(v) || 0) * 100) / 100; }

// Bracket-balanced parse of `let data = {...}` (mirrors extract-meaxure.mjs; no regex truncation).
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
