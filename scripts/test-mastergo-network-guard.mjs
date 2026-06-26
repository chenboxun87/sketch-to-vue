import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const py = path.join(dir, 'test-mastergo-network-guard.py')
const res = spawnSync('python', [py], { encoding: 'utf8', stdio: 'inherit' })
if (res.status !== 0) process.exit(res.status || 1)
console.log('mastergo network guard tests passed')
