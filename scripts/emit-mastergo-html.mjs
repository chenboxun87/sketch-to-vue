/**
 * MasterGo 帧 → 静态 HTML 基线（全量 stack 消费）
 *
 * node emit-mastergo-html.mjs <dataDir> <assetsDir> <outDir>
 */
import fs from 'fs'
import path from 'path'
import {
  buildMgBoxStyle,
  buildMgTextStyle,
  richTextSegmentsToHtml,
  imageStyle,
} from '../templates/shared/mgStyle.mjs'

const [, , dataDir, assetsDir, outDir] = process.argv
if (!dataDir || !outDir) {
  console.error('Usage: node emit-mastergo-html.mjs <dataDir> <assetsDir> <outDir>')
  process.exit(1)
}

const all = JSON.parse(fs.readFileSync(path.join(dataDir, '_all_elements.json'), 'utf8'))
const stack = JSON.parse(fs.readFileSync(path.join(dataDir, '_layer_stack.json'), 'utf8'))
const assetMap = JSON.parse(fs.readFileSync(path.join(dataDir, '_asset_map.json'), 'utf8'))

const byId = Object.fromEntries(all.elements.map((e) => [e.id, e]))
const W = all.board.w
const H = all.board.h

function assetUrl(filename) {
  if (!filename || !assetsDir) return ''
  const abs = path.join(assetsDir, filename)
  if (!fs.existsSync(abs)) return ''
  return `assets/${encodeURIComponent(filename)}`
}

const body = []
let missingImages = 0

for (const layer of stack.layers) {
  const el = byId[layer.elementId]
  if (!el || el.renderAs === 'skip') continue

  const name = el.name?.replace(/"/g, '&quot;') || ''
  if (el.renderAs === 'text' || el.type === 'text') {
    const style = buildMgTextStyle(el)
    const styleStr = Object.entries(style).map(([k, v]) => {
      const prop = k.replace(/([A-Z])/g, '-$1').toLowerCase()
      return `${prop}:${v}`
    }).join(';')
    let inner = el.content || ''
    if ((el.richTextSegments || []).length) {
      inner = richTextSegmentsToHtml(el.richTextSegments)
      body.push(`<div data-name="${name}" data-id="${el.id}" style="${styleStr};display:block">${inner}</div>`)
    } else {
      inner = inner.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      body.push(`<div data-name="${name}" data-id="${el.id}" style="${styleStr};display:block">${inner}</div>`)
    }
    continue
  }

  if (el.renderAs === 'img' || el.type === 'image') {
    const file = assetMap[el.id] || el.exportSlice
    const url = assetUrl(file)
    const st = imageStyle(el, url)
    const styleStr = Object.entries(st).map(([k, v]) => {
      const prop = k.replace(/([A-Z])/g, '-$1').toLowerCase()
      return `${prop}:${v}`
    }).join(';')
    if (url) {
      body.push(`<img data-name="${name}" data-id="${el.id}" src="${url}" style="${styleStr}" alt="" />`)
    } else {
      missingImages++
      body.push(`<div data-missing-image="1" data-name="${name}" data-id="${el.id}" style="${styleStr}" title="missing: ${el.imageRef || ''}"></div>`)
    }
    continue
  }

  const style = buildMgBoxStyle(el)
  const styleStr = Object.entries(style).map(([k, v]) => {
    const prop = k.replace(/([A-Z])/g, '-$1').toLowerCase()
    return `${prop}:${v}`
  }).join(';')
  body.push(`<div data-name="${name}" data-id="${el.id}" style="${styleStr}"></div>`)
}

if (assetsDir && fs.existsSync(assetsDir)) {
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true })
  for (const f of fs.readdirSync(assetsDir)) {
    fs.copyFileSync(path.join(assetsDir, f), path.join(outDir, 'assets', f))
  }
}

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${all.board.name}</title>
<style>
html,body{margin:0;height:100%;background:#02071c;overflow:hidden}
.viewport{position:fixed;inset:0;overflow:hidden}
.stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
.stage *{box-sizing:border-box}
</style></head><body>
<div class="viewport" id="vp"><div class="stage" id="stage">
${body.join('\n')}
</div></div>
<script>
(function(){const vp=document.getElementById('vp'),st=document.getElementById('stage');
function fit(){const sx=vp.clientWidth/${W},sy=vp.clientHeight/${H};st.style.transform='scale('+Math.min(sx,sy)+')';}
fit();new ResizeObserver(fit).observe(vp);})();
</script></body></html>`

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'index.html'), html)
fs.writeFileSync(path.join(outDir, 'emit-summary.json'), JSON.stringify({
  board: all.board,
  layersRendered: body.length,
  missingImages,
}, null, 2))
console.log(`Emitted ${body.length} layers (${missingImages} missing images) → ${outDir}/index.html`)
