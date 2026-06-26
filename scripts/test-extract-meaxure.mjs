#!/usr/bin/env node
/**
 * test-extract-meaxure.mjs
 * extract-meaxure.mjs CLI 测试：用最小 MeaXure index.html（含 `let data = {...}`）夹具，
 * 验证 `let data` 括号深度解析、rect 归一化（width→w）、exportable→exports 映射、z 序赋值。
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let passed = 0
let failed = 0

function assert(label, actual, expected) {
	if (actual === expected) {
		console.log(`✅ ${label}`)
		passed++
	} else {
		console.error(`❌ ${label}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`)
		failed++
	}
}

const meaxureData = {
	resolution: 2,
	unit: 'px',
	artboards: [
		{
			objectID: 'ab-1',
			name: '画板1',
			rect: { x: 0, y: 0, width: 1920, height: 1080 },
			layers: [
				{ objectID: 't-1', name: '标题', type: 'text', rect: { x: 10.456, y: 20, width: 200, height: 40 }, content: '数据监测' },
				{ objectID: 's-1', name: '位图备份 11', type: 'slice', rect: { x: 100, y: 200, width: 64, height: 64 }, exportable: [{ path: '位图备份 11.png', format: 'png', scale: 2 }] },
			],
		},
	],
}

const html = `<!doctype html><html><body><script>
let data = ${JSON.stringify(meaxureData)};
console.log(data);
</script></body></html>`

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-meaxure-test-'))
const htmlPath = path.join(tmpDir, 'index.html')
const outPath = path.join(tmpDir, 'layers.json')
fs.writeFileSync(htmlPath, html)

const scriptPath = path.resolve(import.meta.dirname || process.cwd(), 'extract-meaxure.mjs')

try {
	execFileSync(process.execPath, [scriptPath, htmlPath, outPath], { encoding: 'utf8' })
} catch (e) {
	console.error('脚本执行失败:', e.message)
	process.exit(1)
}

assert('layers.json 存在', fs.existsSync(outPath), true)
const out = JSON.parse(fs.readFileSync(outPath, 'utf8'))

assert('artboard rect 归一化 width→w', out.artboard.rect.w, 1920)
assert('图层数 = 2', out.layers.length, 2)

const t = out.layers.find((l) => l.id === 't-1')
assert('text 图层 type', t.type, 'text')
assert('text 内容保留', t.content, '数据监测')
assert('rect.x 四舍五入到两位', t.rect.x, 10.46)
assert('z 序按数组下标', t.z, 0)

const s = out.layers.find((l) => l.id === 's-1')
assert('slice z 序 = 1', s.z, 1)
assert('exportable → exports 映射', s.exports?.[0]?.path, '位图备份 11.png')
assert('exports scale 保留', s.exports?.[0]?.scale, 2)

fs.rmSync(tmpDir, { recursive: true, force: true })

console.log(`\nAll extract-meaxure cases: ${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
