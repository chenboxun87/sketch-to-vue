// Emit a self-contained static HTML page from layers.json.
// Reference screenshots/previews are QA-only and must never become runtime layers.
//
// Usage: node emit-html.mjs <layers.json> <assetsDir> <outDir>
//
// Layers are emitted in source z-order (the array order from MeaXure):
//   slice → <img> with the cutout PNG
//   text  → <span> with content + raw CSS array from MeaXure
//   shape → <div> with fill / border gradient as background
//          - Skip names: 位图, 蒙版, 矢量智能对象 (embedded chart bitmaps —
//            replaced by real code charts via chart-manifest)
//   group → skipped (their bbox is redundant; children carry the visuals)

import fs from 'node:fs';
import path from 'node:path';
import {
  textGradientStyle,
  solidTextColor,
  textShadowCss,
  fontFamilyFromCss,
  fontStack,
} from '../templates/shared/textStyle.mjs';

const [, , layersPath, assetsDir, outDir] = process.argv;
if (!layersPath || !assetsDir || !outDir) {
  console.error('Usage: node emit-html.mjs <layers.json> <assetsDir> <outDir>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(layersPath, 'utf8'));
const imagesDir = path.join(outDir, 'images');
fs.rmSync(imagesDir, { recursive: true, force: true });
fs.mkdirSync(imagesDir, { recursive: true });

const ab = data.artboard?.rect;
const stageW = Math.round(ab?.width || 1920);
const stageH = Math.round(ab?.height || 1080);
// most chancheng/foshan exports clamp the bg to 1919×1075; treat the artboard as 1920×1080.
const designW = 1920;
const designH = 1080;

// Copy slice PNGs and build a filename → safe slug map.
const fileMap = new Map(); // original filename → slug
let slugIdx = 0;
function slugify(name) {
  if (fileMap.has(name)) return fileMap.get(name);
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const ascii = base.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  let slug = ascii ? `${ascii}-${++slugIdx}${ext}` : `slice-${++slugIdx}${ext}`;
  // de-dupe
  while ([...fileMap.values()].includes(slug)) slug = `${ascii || 'slice'}-${++slugIdx}${ext}`;
  fileMap.set(name, slug);
  return slug;
}

const assetFiles = new Map(fs.readdirSync(assetsDir).map((file) => [file.toLowerCase(), file]));
function resolveAssetFile(src) {
  const direct = path.join(assetsDir, src);
  if (fs.existsSync(direct)) return { abs: direct, outName: slugify(src) };

  const ext = path.extname(src);
  const base = path.basename(src, ext);
  const ascii = base.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  const normalizedExt = ext.toLowerCase();
  const candidates = [];
  if (ascii) candidates.push(`${ascii}${normalizedExt}`);
  candidates.push(slugify(src).toLowerCase());

  for (const candidate of candidates) {
    const file = assetFiles.get(candidate.toLowerCase());
    if (file) return { abs: path.join(assetsDir, file), outName: file };
  }

  if (ascii) {
    for (const file of assetFiles.values()) {
      if (file.toLowerCase().startsWith(`${ascii.toLowerCase()}-`) && path.extname(file).toLowerCase() === normalizedExt) {
        return { abs: path.join(assetsDir, file), outName: file };
      }
    }
  }

  return null;
}

let imgCount = 0;
let textCount = 0;
let shapeCount = 0;
let skipped = 0;
const referenceSlices = [];

const body = [];
for (const layer of data.layers) {
  const r = layer.rect;
  if (!r || r.w <= 0 || r.h <= 0) { skipped++; continue; }

  if (layer.type === 'slice' && layer.exports?.[0]?.path) {
    const src = layer.exports[0].path;
    const reservedOutName = slugify(src);
    if (isReferenceSlice(layer, src)) {
      referenceSlices.push({ name: layer.name, src, outName: reservedOutName, rect: r, z: layer.z });
      skipped++;
      continue;
    }
    const asset = resolveAssetFile(src);
    if (!asset) {
      console.warn(`  ! missing slice file: ${src}`);
      skipped++;
      continue;
    }
    fileMap.set(src, asset.outName);
    const dst = path.join(imagesDir, asset.outName);
    if (!fs.existsSync(dst)) fs.copyFileSync(asset.abs, dst);
    body.push(
      `<img src="images/${asset.outName}" data-name="${escapeAttr(layer.name)}" ` +
      `style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;` +
      `z-index:${layer.z};${opacityCss(layer)}${rotateCss(layer)}">`
    );
    imgCount++;
    continue;
  }

  if (layer.type === 'shape') {
    // Skip embedded chart bitmaps — those are replaced by code charts.
    if (/^(位图|蒙版|矢量智能对象)/.test(layer.name)) { skipped++; continue; }
    const bg = shapeBackground(layer);
    const radius = shapeBorderRadius(layer);
    if (!bg) { skipped++; continue; }
    body.push(
      `<div data-name="${escapeAttr(layer.name)}" ` +
      `style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;` +
      `z-index:${layer.z};background:${bg};${radius}${opacityCss(layer)}${rotateCss(layer)}"></div>`
    );
    imgCount; // (counted under shapeCount below)
    shapeCount++;
    continue;
  }

  if (layer.type === 'text' && typeof layer.content === 'string') {
    if (isBorderedTextArtifact(layer)) { skipped++; continue; }
    const el = normalizeTextLayerForStyle(layer)
    const grad = textGradientStyle(el)
    let colorCss = ''
    let gradCss = ''
    if (grad) {
      gradCss = `background:${grad.background};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;`
    } else {
      colorCss = `color:${solidTextColor(el)};`
    }
    const ff = fontFamilyFromCss(layer.css)
    const fontCss = ff ? `font-family:${fontStack(ff)};` : ''
    const shadowCss = layer.shadows?.length
      ? `text-shadow:${textShadowCss(layer.shadows)};` : ''
    const cssChunks = (layer.css || [])
      .filter((s) => !/font-family|color\s*:/i.test(s))
      .map((s) => s.replace(/;;+/g, ';').trim())
      .filter(Boolean)
      .map((s) => (s.endsWith(';') ? s : s + ';'))
      .join('')
    const align = layer.textAlign ? `text-align:${layer.textAlign};` : ''
    const lh = layer.lineHeight ? `line-height:${layer.lineHeight}px;` : `line-height:${r.h}px;`
    body.push(
      `<span data-name="${escapeAttr(layer.name)}" ` +
      `style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;` +
      `z-index:${layer.z};display:block;white-space:pre;${align}${lh}${fontCss}${colorCss}${gradCss}${shadowCss}${cssChunks}` +
      `${opacityCss(layer)}${rotateCss(layer)}">${escapeHtml(layer.content)}</span>`
    )
    textCount++
    continue
  }

  skipped++;
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.artboard?.name || 'meaxure-static')}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #02071c; overflow: hidden; }
  body { font-family: "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif; }
  .viewport { position: fixed; inset: 0; overflow: hidden; }
  .stage {
    position: absolute; left: 0; top: 0;
    width: ${designW}px; height: ${designH}px;
    transform-origin: 0 0;
  }
  .stage * { box-sizing: border-box; }
  /* Sketch text color in css[] uses #RGBA — already handled by browser */
</style>
</head>
<body>
<div class="viewport" id="vp">
  <div class="stage" id="stage">
${body.join('\n')}
  </div>
</div>
<script>
(function() {
  const vp = document.getElementById('vp');
  const stage = document.getElementById('stage');
  function fit() {
    const sx = vp.clientWidth / ${designW};
    const sy = vp.clientHeight / ${designH};
    stage.style.transform = 'scale(' + sx + ',' + sy + ')';
  }
  fit();
  new ResizeObserver(fit).observe(vp);
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'index.html'), html);

const summary = {
  source: layersPath,
  outDir,
  designSize: [designW, designH],
  artboardSize: [stageW, stageH],
  images: imgCount,
  texts: textCount,
  shapes: shapeCount,
  skipped,
  referenceSlices,
  fileMap: Object.fromEntries(fileMap),
};
fs.writeFileSync(path.join(outDir, 'emit-summary.json'), JSON.stringify(summary, null, 2));
console.log(`Emitted ${imgCount} images + ${textCount} texts + ${shapeCount} shapes (skipped ${skipped}) to ${outDir}/index.html`);

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function opacityCss(l) { return l.opacity != null ? `opacity:${l.opacity};` : ''; }
function rotateCss(l)  { return l.rotation ? `transform:rotate(${l.rotation}deg);` : ''; }

function isReferenceSlice(layer, src) {
  const label = `${layer.name || ''} ${src || ''} ${layer.exports?.[0]?.name || ''}`;
  return /(preview-base|preview|screenshot|screen[-\s]?shot|reference|mockup|预览|参考图|截图)/i.test(label);
}

function isBorderedTextArtifact(layer) {
  return (layer.css || []).some((s) => /border:\s*1px\s+solid\s+#979797/i.test(s));
}

/** Raw MeaXure layers.json fills → normalized fills for shared textStyle */
function normalizeTextLayerForStyle(layer) {
  const fills = (layer.fills || []).map((f) => {
    if (f.type === 'gradient' || f.type === 'solid') return f
    if (f.fillType === 'Gradient' && f.gradient) {
      const g = f.gradient
      const from = g.from || { x: 0, y: 0 }
      const to = g.to || { x: 1, y: 0 }
      const dx = to.x - from.x
      const dy = to.y - from.y
      const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
      return {
        type: 'gradient',
        angle,
        stops: (g.colorStops || []).map((s) => ({
          position: s.position,
          color: cssRgba(s.color),
        })),
      }
    }
    if (f.fillType === 'Color' && f.color) {
      return { type: 'solid', color: cssRgba(f.color) }
    }
    return f
  })
  return { ...layer, fills }
}

// --- shape rendering helpers -----------------------------------------------

function shapeBackground(layer) {
  const fill = (layer.fills || []).find((f) => f && (f.fillType === 'Color' || f.fillType === 'Gradient'));
  if (fill) {
    if (fill.fillType === 'Color' && fill.color) return cssRgba(fill.color);
    if (fill.fillType === 'Gradient' && fill.gradient) return cssGradient(fill.gradient);
  }
  return null;
}

function shapeBorderRadius(layer) {
  // MeaXure does not expose corner radius directly on shapes; some `css`
  // strings include it though.
  const css = (layer.css || []).find((s) => /border-radius/.test(s));
  return css ? css.replace(/;;+/g, ';').trim() + ';' : '';
}

function cssRgba(color) {
  if (color['css-rgba']) return color['css-rgba'];
  const r = color.rgb?.r ?? 0, g = color.rgb?.g ?? 0, b = color.rgb?.b ?? 0;
  const a = (color.alpha ?? 255) / 255;
  return `rgba(${r},${g},${b},${a})`;
}

function cssGradient(g) {
  // Sketch gradient stops are normalized 0..1 along a vector from `from` to `to`.
  // Convert (from → to) to a CSS gradient angle (0deg = up, increases clockwise).
  if (g.type === 'Linear' || !g.type) {
    const from = g.from || { x: 0, y: 0 };
    const to = g.to || { x: 1, y: 0 };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const stops = (g.colorStops || [])
      .map((s) => `${cssRgba(s.color)} ${(s.position * 100).toFixed(2)}%`)
      .join(', ');
    return `linear-gradient(${angle.toFixed(2)}deg, ${stops})`;
  }
  if (g.type === 'Radial') {
    const stops = (g.colorStops || [])
      .map((s) => `${cssRgba(s.color)} ${(s.position * 100).toFixed(2)}%`)
      .join(', ');
    return `radial-gradient(circle, ${stops})`;
  }
  // unknown gradient type — fall back to first stop solid color
  const first = g.colorStops?.[0]?.color;
  return first ? cssRgba(first) : null;
}
