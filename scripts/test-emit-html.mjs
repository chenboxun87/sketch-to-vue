#!/usr/bin/env node
/**
 * test-emit-html.mjs
 * emit-html.mjs CLI 烟雾/回归测试：用最小 layers.json 夹具跑通 emit，断言
 *   - 输出 index.html / emit-summary.json 存在
 *   - text 图层内容被渲染
 *   - slice 图层 PNG 被复制进 images/ 并引用
 *   - shape 图层（Color fill）渲染为带 background 的 div
 *   - 参考图/预览切片（QA-only）被排除，绝不进入运行时图层
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'

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

function assertIncludes(label, str, substr) {
	if (typeof str === 'string' && str.includes(substr)) {
		console.log(`✅ ${label}`)
		passed++
	} else {
		console.error(`❌ ${label}\n   expected to include: ${JSON.stringify(substr)}`)
		failed++
	}
}

function assertExcludes(label, str, substr) {
	if (typeof str === 'string' && !str.includes(substr)) {
		console.log(`✅ ${label}`)
		passed++
	} else {
		console.error(`❌ ${label}\n   expected NOT to include: ${JSON.stringify(substr)}`)
		failed++
	}
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emit-html-test-'))
const assetsDir = path.join(tmpDir, 'assets')
const outDir = path.join(tmpDir, 'out')
fs.mkdirSync(assetsDir, { recursive: true })

// 写一个 2x2 的真实 PNG 作为切片素材
const png = new PNG({ width: 2, height: 2 })
for (let i = 0; i < png.data.length; i++) png.data[i] = 200
fs.writeFileSync(path.join(assetsDir, 'deco.png'), PNG.sync.write(png))

const layers = {
	artboard: { rect: { width: 1920, height: 1080 } },
	layers: [
		{ type: 'text', name: 'kpi', z: 1, rect: { x: 100, y: 100, w: 200, h: 40 }, content: '指标量123', css: [] },
		{ type: 'shape', name: '面板背景', z: 2, rect: { x: 0, y: 0, w: 400, h: 300 }, fills: [{ fillType: 'Color', color: { rgb: { r: 10, g: 20, b: 30 }, alpha: 255 } }] },
		{ type: 'slice', name: '装饰', z: 3, rect: { x: 50, y: 50, w: 64, h: 64 }, exports: [{ path: 'deco.png' }] },
		{ type: 'slice', name: '整页预览', z: 4, rect: { x: 0, y: 0, w: 1920, h: 1080 }, exports: [{ path: 'preview-base.png', name: 'preview' }] },
	],
}
const layersPath = path.join(tmpDir, 'layers.json')
fs.writeFileSync(layersPath, JSON.stringify(layers))

const scriptPath = path.resolve(import.meta.dirname || process.cwd(), 'emit-html.mjs')

try {
	execFileSync(process.execPath, [scriptPath, layersPath, assetsDir, outDir], { encoding: 'utf8' })
} catch (e) {
	console.error('脚本执行失败:', e.message)
	process.exit(1)
}

const htmlPath = path.join(outDir, 'index.html')
const summaryPath = path.join(outDir, 'emit-summary.json')

assert('index.html 存在', fs.existsSync(htmlPath), true)
assert('emit-summary.json 存在', fs.existsSync(summaryPath), true)

const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : ''
assertIncludes('text 图层内容被渲染', html, '指标量123')
assertIncludes('shape 图层渲染为带 background 的 div', html, 'background:rgba(10,20,30')
assertIncludes('slice 图层引用 images/ 下复制的 PNG', html, 'images/')
assertExcludes('参考图/预览切片被排除（不进运行时）', html, 'preview-base')

assert('切片 PNG 被复制到 images/', fs.existsSync(path.join(outDir, 'images')) && fs.readdirSync(path.join(outDir, 'images')).length >= 1, true)

fs.rmSync(tmpDir, { recursive: true, force: true })

console.log(`\nAll emit-html cases: ${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
