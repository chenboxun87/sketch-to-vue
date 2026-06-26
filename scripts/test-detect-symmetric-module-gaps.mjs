#!/usr/bin/env node
/** 回归：detect-symmetric-module-gaps.mjs — 规则 62 disposition / icon 检测 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const skillRoot = path.join(dir, '..')
const script = path.join(dir, 'detect-symmetric-module-gaps.mjs')
const fixtureBad = path.join(
	skillRoot,
	'docs/fixtures/symmetricKpi/disposition-mismatch/_all_elements.json'
)
const fixtureOk = path.join(
	skillRoot,
	'docs/fixtures/symmetricKpi/consistent-slice/_all_elements.json'
)

let failed = 0
function check(name, cond) {
	console.log(cond ? '✅' : '❌', name)
	if (!cond) failed++
}

function runDetect(input) {
	const out = path.join(os.tmpdir(), `d2v-sym-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
	try {
		execSync(`node "${script}" "${input}" "${out}"`, { stdio: 'pipe' })
		const report = JSON.parse(fs.readFileSync(out, 'utf8'))
		fs.unlinkSync(out)
		return { code: 0, report }
	} catch (e) {
		const code = e.status || 1
		let report = null
		if (fs.existsSync(out)) {
			report = JSON.parse(fs.readFileSync(out, 'utf8'))
			fs.unlinkSync(out)
		}
		return { code, report }
	}
}

const bad = runDetect(fixtureBad)
check('disposition-mismatch 非零退出', bad.code !== 0)
check('disposition-mismatch 有 report', !!bad.report)
check('pitchY=282', bad.report?.pitchY === 282)
check(
	'dispositionMismatches≥1',
	Array.isArray(bad.report?.dispositionMismatches) && bad.report.dispositionMismatches.length >= 1
)
check('referenceRow=矩形背景 2', bad.report?.dispositionMismatches?.[0]?.referenceRow?.name === '矩形背景 2')
check('targetRow=矩形备份 5', bad.report?.dispositionMismatches?.[0]?.targetRow?.name === '矩形备份 5')
check('iconGaps≥1', Array.isArray(bad.report?.iconGaps) && bad.report.iconGaps.length >= 1)

const ok = runDetect(fixtureOk)
check('consistent-slice 有 report', !!ok.report)
check('consistent-slice 无 disposition', (ok.report?.dispositionMismatches || []).length === 0)
check('consistent-slice 无 iconGaps', (ok.report?.iconGaps || []).length === 0)
// 第三 panel 无 KPI 时 gaps 可非零（漏导≠处置不一致），故不要求 exit 0
check('consistent-slice 两行 KPI 同名', (ok.report?.kpiTemplates || []).every((k) => k.name === '矩形背景 2'))

if (failed) {
	console.error(`${failed} assertion(s) failed`)
	process.exit(1)
}
console.log('test-detect-symmetric-module-gaps passed')
