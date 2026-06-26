import {
  textGradientStyle,
  solidTextColor,
  textGradientStyleMg,
  solidTextColorMg,
  buildTextStyle,
  buildTextStyleMg,
} from '../templates/shared/textStyle.mjs'

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('OK:', msg)
  }
}

const mxEl = {
  fills: [{
    type: 'gradient',
    angle: 180,
    stops: [
      { position: 0, color: { 'css-rgba': 'rgba(255,0,0,1)' } },
      { position: 1, color: { 'css-rgba': 'rgba(0,0,255,1)' } },
    ],
  }],
}
const g = textGradientStyle(mxEl)
assert(g && g.background.includes('linear-gradient'), 'meaxure gradient')
assert(g.color === 'transparent', 'meaxure gradient transparent color')

const mxSolid = { fills: [{ type: 'solid', color: '#EAEFF7' }], colorRgba: '#fff' }
assert(solidTextColor(mxSolid) === '#EAEFF7', 'meaxure solid fill priority')

const mgFills = [{
  type: 'GRADIENT_LINEAR',
  gradientStops: [
    { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
    { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
  ],
  transform: [[0, 1, 0], [-1, 0, 1]],
}]
const mgG = textGradientStyleMg(mgFills)
assert(mgG && mgG.background.includes('linear-gradient'), 'mg gradient')
assert(mgG.color === 'transparent', 'mg no gradient in color')

const mgSolid = [{ type: 'SOLID', color: { r: 0.92, g: 0.94, b: 0.97, a: 1 } }]
assert(solidTextColorMg(mgSolid, '#000').startsWith('#'), 'mg solid hex')

const built = buildTextStyle({ fontSize: 16, fills: mxSolid.fills, css: [] })
assert(built.color === '#EAEFF7', 'buildTextStyle solid')

const builtMg = buildTextStyleMg({
  style: { fontSize: 18, fontFamily: 'PingFang SC', textAlignHorizontal: 'LEFT' },
  fills: mgSolid,
})
assert(builtMg.fontSize === '18px', 'buildTextStyleMg fontSize')
assert(builtMg.color.startsWith('#'), 'buildTextStyleMg color')

if (failed) process.exit(1)
console.log('All textStyle tests passed')
