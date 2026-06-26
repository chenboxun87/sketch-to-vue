import { isDegenerateBorderPath } from '../templates/shared/vectorGuards.mjs'

let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

// border 90px 套 5x1 盒子 → 退化
assert(isDegenerateBorderPath(['border: 90px solid #2C5EE0;'], { x: 0, y: 0, w: 5, h: 1 }) === true, '90px on 5x1 degenerate')
// border 134px 套 210x31 → 退化（134*2 > 31）
assert(isDegenerateBorderPath(['opacity: 0.4;', 'border: 134px solid #2C5EE0;'], { w: 210, h: 31 }) === true, '134px on 210x31 degenerate')
// 1px 细线 → 正常保留
assert(isDegenerateBorderPath(['border: 1px solid #32C5FF;'], { w: 1, h: 103 }) === false, '1px line kept')
// 2px → 正常保留
assert(isDegenerateBorderPath(['border: 2px solid #fff;'], { w: 2, h: 80 }) === false, '2px line kept')
// 大盒子正常 border → 保留
assert(isDegenerateBorderPath(['border: 4px solid #fff;'], { w: 300, h: 200 }) === false, 'normal border on big box kept')
// 无 border → false
assert(isDegenerateBorderPath(['background: #fff;'], { w: 5, h: 1 }) === false, 'no border false')
// border-radius 不误判
assert(isDegenerateBorderPath(['border-radius: 24px;'], { w: 5, h: 1 }) === false, 'border-radius not matched')

if (failed) process.exit(1)
console.log('All vectorGuards tests passed')
