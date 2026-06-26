/**
 * 拉取 MasterGo MCP DSL 并写入 pilot data 目录
 * Usage:
 *   node fetch-mg-dsl.mjs --file-id 194975884105057 --layer-id "11:5182" --out "<dir>/mg-dsl-11-5182.json"
 *   MASTERGO_TOKEN=mg_xxx node fetch-mg-dsl.mjs --file-id ... --layer-id ...
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pyScript = path.join(__dirname, 'mastergo_get_dsl.py')

const args = process.argv.slice(2)
const getArg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

const fileId = getArg('--file-id')
const layerId = getArg('--layer-id')
const outPath = getArg('--out')
const token = getArg('--token') || process.env.MASTERGO_TOKEN

if (!fileId || !layerId || !outPath) {
  console.error(
    'Usage: node fetch-mg-dsl.mjs --file-id "<id>" --layer-id "<id>" --out "<path.json>" [--token mg_xxx]'
  )
  process.exit(1)
}

if (!token) {
  console.error('[ERROR] MASTERGO_TOKEN 未设置。请 export MASTERGO_TOKEN 或传 --token')
  process.exit(1)
}

const pyArgs = [pyScript, '--file-id', fileId, '--layer-id', layerId, '--pretty']
if (token) pyArgs.push('--token', token)

const res = spawnSync('python', pyArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (res.status !== 0) {
  console.error(res.stderr || res.stdout || 'fetch failed')
  process.exit(res.status || 1)
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, res.stdout)
console.log('[OK] DSL saved:', outPath, `(${(res.stdout.length / 1024).toFixed(1)} KB)`)
