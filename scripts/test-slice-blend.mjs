import fs from 'fs'
import path from 'path'
import os from 'os'
import { PNG } from 'pngjs'
import { classifyBlend } from './detect-slice-blend.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blend-'))
function writePng(name, fill) {
  const png = new PNG({ width: 20, height: 20 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill.r; png.data[i + 1] = fill.g; png.data[i + 2] = fill.b; png.data[i + 3] = fill.a
  }
  const p = path.join(tmp, name)
  fs.writeFileSync(p, PNG.sync.write(png))
  return p
}

const black = writePng('black.png', { r: 5, g: 5, b: 8, a: 255 })
const white = writePng('white.png', { r: 252, g: 252, b: 255, a: 255 })
const trans = writePng('trans.png', { r: 0, g: 0, b: 0, a: 0 })
const color = writePng('color.png', { r: 30, g: 120, b: 200, a: 255 })

assert(classifyBlend(black) === 'screen', 'black bg → screen')
assert(classifyBlend(white) === 'multiply', 'white bg → multiply')
assert(classifyBlend(trans) === null, 'transparent → null')
assert(classifyBlend(color) === null, 'colored → null')

if (failed) process.exit(1)
console.log('All slice-blend tests passed')
