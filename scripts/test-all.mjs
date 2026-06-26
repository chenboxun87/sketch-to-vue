import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const tests = fs.readdirSync(dir).filter((f) => /^test-.*\.mjs$/.test(f) && f !== 'test-all.mjs')
let failed = 0
for (const t of tests) {
  try {
    execSync(`node "${path.join(dir, t)}"`, { stdio: 'inherit' })
  } catch {
    console.error('TEST FILE FAILED:', t)
    failed++
  }
}
if (failed) { console.error(`${failed} test file(s) failed`); process.exit(1) }
console.log('ALL test files passed')
