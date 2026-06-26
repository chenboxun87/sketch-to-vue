import { parseColor } from '../templates/shared/colorParse.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

assert(parseColor('#2C5EE0') === '#2C5EE0', 'hex passthrough')
assert(parseColor('rgba(44,94,224,1)') === 'rgba(44,94,224,1)', 'rgba passthrough')
assert(parseColor('#7AF4FF 100%') === '#7AF4FF', 'strip percent suffix')
assert(parseColor({ rgb: { r: 44, g: 94, b: 224 } }) === 'rgba(44,94,224,1)', 'rgb object')
assert(parseColor({ rgb: { r: 44, g: 94, b: 224 }, alpha: 0.5 }) === 'rgba(44,94,224,0.5)', 'rgb object alpha')
assert(parseColor({ r: 0.2, g: 0.4, b: 0.8, a: 1 }) === 'rgba(51,102,204,1)', 'normalized 0-1 rgba exact values')
assert(parseColor(null) === null, 'null safe')
assert(parseColor(undefined) === null, 'undefined safe')
assert(parseColor('') === null, 'empty safe')

if (failed) process.exit(1)
console.log('All colorParse tests passed')
