#!/usr/bin/env node
/**
 * Audit fonts ONLY within allowed scope (see references/font-bundling.md).
 * pending_acquire → suggest substituteStack + userPrompt for agent to show user.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FONT_EXT = new Set(['.ttf', '.otf', '.woff', '.woff2'])

const ACQUIRE_HINTS = {
	'YouSheBiaoTiHei': 'npm @zf-web-font/youshebiaotihei 或优设字由免费商用页',
	'DIN Alternate': '设计师提供 / Linotype 采购（DINAlternate-Bold）',
	'Yuanti SC': '设计师提供 STYuanti-SC-Bold（Apple 字体需授权）',
	'PingFang SC': 'npm font-pingfang（核实 license）或设计师提供',
}

/** 暂用替代：必须来自项目已打包字体，禁止搜系统目录 */
const DEFAULT_SUBSTITUTES = {
	'DIN Alternate': "'D-DIN-PRO', 'Arial Narrow', sans-serif",
	'Yuanti SC': "'SourceHanSansCN', sans-serif",
	'PingFang SC': "'SourceHanSansCN', sans-serif",
	'YouSheBiaoTiHei': "'YouSheBiaoTiHei', 'SourceHanSansCN', sans-serif",
}

function buildUserPrompt(family, substituteStack, acquireVia) {
	const sub = substituteStack.split(',')[0].replace(/['"]/g, '').trim()
	return `【${family}】尚未入库，页面暂用 ${sub}。请按以下方式获取：${acquireVia}。入库后更新 _font_map.json 为 bundled 并补 @font-face。`
}

function parseArgs(argv) {
	const out = {}
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i]
		if (a.startsWith('--')) {
			const key = a.slice(2)
			out[key] = argv[i + 1]
			i++
		}
	}
	return out
}

function listFontFiles(dir) {
	if (!dir || !fs.existsSync(dir)) return []
	const results = []
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name)
		const st = fs.statSync(full)
		if (st.isFile() && FONT_EXT.has(path.extname(name).toLowerCase())) {
			results.push(full)
		}
	}
	return results
}

function parseFontFaceSrcFromLess(lessPath, projectRoot) {
	if (!lessPath || !fs.existsSync(lessPath)) return []
	const text = fs.readFileSync(lessPath, 'utf8')
	const urls = []
	const re = /url\s*\(\s*["']?([^"')]+)["']?\s*\)/g
	let m
	while ((m = re.exec(text)) !== null) {
		let u = m[1].trim()
		if (u.startsWith('@/')) u = path.join(projectRoot, 'src', u.slice(2))
		else if (!path.isAbsolute(u)) u = path.join(path.dirname(lessPath), u)
		urls.push(path.normalize(u))
	}
	return urls.filter((p) => fs.existsSync(p))
}

function basenameMatchesFamily(basename, family) {
	const b = basename.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
	const f = family.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
	return b.includes(f) || f.includes(b.slice(0, Math.min(6, b.length)))
}

function loadFontMapSubstitutes(pageOutDir) {
	if (!pageOutDir) return {}
	const p = path.join(pageOutDir, '_font_map.json')
	if (!fs.existsSync(p)) return {}
	try {
		const map = JSON.parse(fs.readFileSync(p, 'utf8'))
		const out = {}
		for (const [family, entry] of Object.entries(map.families || {})) {
			if (entry.substituteStack) out[family] = entry.substituteStack
		}
		return out
	} catch {
		return {}
	}
}

function main() {
	const args = parseArgs(process.argv)
	const projectRoot = path.resolve(args.projectRoot || process.cwd())
	const exportDir = args.exportDir ? path.resolve(args.exportDir) : null
	const pageOutDir = args.pageOutDir ? path.resolve(args.pageOutDir) : null
	const fontManifestPath = args.fontManifest
		? path.resolve(args.fontManifest)
		: pageOutDir
			? path.join(pageOutDir, '_font_manifest.json')
			: null

	if (!fontManifestPath || !fs.existsSync(fontManifestPath)) {
		console.error('Missing --fontManifest or _font_manifest.json')
		process.exit(1)
	}

	const manifest = JSON.parse(fs.readFileSync(fontManifestPath, 'utf8'))
	const needs = manifest.needsBundling || manifest.fonts?.map((f) => f.family) || []
	const mapSubstitutes = loadFontMapSubstitutes(pageOutDir)

	const scopeDirs = [
		path.join(projectRoot, 'src/assets/font'),
		exportDir ? path.join(exportDir, 'fonts') : null,
		exportDir ? path.join(exportDir, 'assets/fonts') : null,
		pageOutDir ? path.join(path.dirname(pageOutDir), 'fonts') : null,
	].filter(Boolean)

	const globalLess = path.join(projectRoot, 'src/assets/less/global.less')
	const pageFontsLess = pageOutDir
		? path.join(path.dirname(pageOutDir), 'fonts.less')
		: null

	const scopedFiles = []
	for (const d of scopeDirs) scopedFiles.push(...listFontFiles(d))
	scopedFiles.push(...parseFontFaceSrcFromLess(globalLess, projectRoot))
	if (pageFontsLess) scopedFiles.push(...parseFontFaceSrcFromLess(pageFontsLess, projectRoot))

	const uniqueFiles = [...new Set(scopedFiles)]

	const report = {
		auditedAt: new Date().toISOString().slice(0, 10),
		searchScope: scopeDirs.map((d) => (fs.existsSync(d) ? d : `${d} (missing)`)),
		fontFaceFrom: [globalLess, pageFontsLess].filter((p) => p && fs.existsSync(p)),
		scopedFileCount: uniqueFiles.length,
		scopedFiles: uniqueFiles.map((f) => path.relative(projectRoot, f)),
		items: [],
		summaryForUser: '',
	}

	for (const family of needs) {
		const hit = uniqueFiles.find((f) => basenameMatchesFamily(path.basename(f), family))
		if (hit) {
			report.items.push({
				family,
				status: 'bundled',
				file: path.relative(projectRoot, hit),
				searchedInScope: true,
			})
			continue
		}
		const acquireVia = ACQUIRE_HINTS[family] || '设计师提供或合法采购'
		const substituteStack =
			mapSubstitutes[family] || DEFAULT_SUBSTITUTES[family] || "'SourceHanSansCN', sans-serif"
		report.items.push({
			family,
			status: 'pending_acquire',
			file: null,
			searchedInScope: true,
			acquireVia,
			substituteStack,
			userPrompt: buildUserPrompt(family, substituteStack, acquireVia),
		})
	}

	const pending = report.items.filter((i) => i.status === 'pending_acquire')
	if (pending.length) {
		report.summaryForUser = `${pending.length} 个字体待入库，页面已配置暂用替代字体，请用户按 acquireVia 获取后替换。`
	}

	const outPath = pageOutDir ? path.join(pageOutDir, '_font_acquire.json') : null
	if (outPath) {
		fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
		console.log('Wrote', outPath)
	}

	console.log(JSON.stringify(report, null, 2))

	if (pending.length) {
		console.error(`\n${pending.length} font(s) pending_acquire — using substituteStack; notify user:`)
		for (const p of pending) console.error(`  • ${p.userPrompt}`)
		process.exit(2)
	}
}

main()
