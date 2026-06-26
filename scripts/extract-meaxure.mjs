// Extract normalized layer data from a Sketch MeaXure HTML export.
// Usage: node extract-meaxure.mjs <meaxure-index.html> <out-layers.json>

import fs from 'node:fs';
import path from 'node:path';

const [, , htmlPath, outPath] = process.argv;
if (!htmlPath || !outPath) {
  console.error('Usage: node extract-meaxure.mjs <meaxure-index.html> <out-layers.json>');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const data = parseMeaxureData(html);
const artboard = data.artboards?.[0];
if (!artboard) {
  throw new Error('No artboard found in MeaXure data');
}

const output = {
  source: htmlPath,
  resolution: data.resolution,
  unit: data.unit,
  artboard: {
    id: artboard.objectID,
    name: artboard.name,
    rect: normalizeRect(artboard.rect),
  },
  layers: (artboard.layers || []).map((layer, idx) => normalizeLayer(layer, idx)),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Extracted ${output.layers.length} layers to ${outPath}`);

function parseMeaxureData(source) {
  const marker = 'let data = {';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('Cannot find `let data = {` in MeaXure HTML');

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  let end = -1;
  const objectStart = start + marker.length - 1;

  for (let i = objectStart; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  if (end === -1) throw new Error('Cannot parse MeaXure data object');
  return JSON.parse(source.slice(objectStart, end + 1));
}

function normalizeLayer(layer, z) {
  return compactObject({
    id: layer.objectID,
    name: layer.name,
    type: layer.type,
    z,
    rect: normalizeRect(layer.rect),
    content: layer.content,
    css: layer.css,
    textAlign: layer.textAlign,
    lineHeight: layer.lineHeight,
    fontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    opacity: layer.opacity,
    rotation: layer.rotation,
    exports: normalizeExports(layer.exportable),
    fills: layer.fills,
    borders: layer.borders,
    shadows: layer.shadows,
    styleName: layer.styleName,
  });
}

function normalizeRect(rect) {
  if (!rect) return null;
  return {
    x: round(rect.x),
    y: round(rect.y),
    w: round(rect.width),
    h: round(rect.height),
  };
}

function normalizeExports(exportable) {
  if (!Array.isArray(exportable) || exportable.length === 0) return undefined;
  return exportable.map((item) => compactObject({
    path: item.path,
    format: item.format,
    name: item.name,
    scale: item.scale,
  }));
}

function compactObject(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null));
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
