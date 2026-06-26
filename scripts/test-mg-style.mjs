import {
  buildMgBoxStyle,
  buildMgTextStyle,
  effectsToCss,
  fillsToBackground,
  richTextSegmentsToHtml,
} from '../templates/shared/mgStyle.mjs'

let failed = 0
function ok(c, m) {
  if (!c) { console.error('FAIL', m); failed++ } else console.log('OK', m)
}

const el = {
  rect: { x: 10, y: 20, w: 200, h: 80 },
  fills: [{ type: 'gradient', css: 'linear-gradient(180deg, #112 0%, #334 100%)' }],
  strokes: [{ color: '#7CA8FF', weight: 1, align: 'INSIDE' }],
  borderRadius: '8px',
  effects: [
    { type: 'inner_shadow', offsetX: 0, offsetY: 0, blurRadius: 28, spread: 4, color: { 'css-rgba': 'rgba(51,145,255,0.6)' } },
  ],
}
const box = buildMgBoxStyle(el)
ok(box.background?.includes('gradient'), 'gradient fill')
ok(box.boxShadow?.includes('inset'), 'inner shadow in boxShadow')
ok(box.border?.includes('solid'), 'stroke border')
ok(box.borderRadius === '8px', 'border radius')

const textEl = {
  rect: { x: 0, y: 0, w: 400, h: 200 },
  fontSize: 14,
  fontWeight: 400,
  fontFamily: 'PingFang SC',
  lineHeight: 22,
  fills: [{ type: 'solid', color: '#DCE8FF' }],
  content: 'hello',
}
const ts = buildMgTextStyle(textEl)
ok(ts.fontSize === '14px', 'text fontSize')

const html = richTextSegmentsToHtml([
  { content: '1. ', color: '#fff', fontSize: 14, fontWeight: 600 },
  { content: '标题', color: '#8bc', fontSize: 14 },
])
ok(html.includes('<span') && html.includes('标题'), 'rich text html')

if (failed) process.exit(1)
console.log('mg-style tests passed')
