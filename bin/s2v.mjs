#!/usr/bin/env node
/**
 * sketch-to-vue CLI  —  s2v
 * Copyright (c) 2026 chenboxun87  |  CC BY-NC-ND 4.0
 * https://github.com/chenboxun87/sketch-to-vue
 *
 * Usage:
 *   s2v extract  <meaxure-dir>           [--out scene-graph.json]
 *   s2v emit     <scene-graph.json>      [--framework vue2|vue3|react|uniapp] [--out <dir>]
 *   s2v audit    <scene-graph.json>      [--assets <dir>]
 *   s2v pipeline <meaxure-dir>           [--framework react] [--out <dir>]
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir   = path.join(__dirname, '..')

const COMMANDS = ['extract', 'emit', 'audit', 'pipeline', 'help']

function printHelp() {
  console.log(`
sketch-to-vue CLI (s2v) v${JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version}
Copyright (c) 2026 chenboxun87  |  CC BY-NC-ND 4.0

COMMANDS
  s2v extract  <meaxure-dir>       Parse Sketch MeaXure export -> scene-graph.json
  s2v emit     <scene-graph.json>  Generate component code from scene graph
  s2v audit    <scene-graph.json>  Audit asset & style consumption
  s2v pipeline <meaxure-dir>       Run extract + emit in one step

OPTIONS
  --framework  vue2 | vue3 | react | uniapp   (default: vue2)
  --out        output path (file or dir)
  --assets     assets directory for audit

EXAMPLES
  s2v extract  ./design-meaxure --out scene.json
  s2v emit     scene.json --framework react --out ./src/pages/Home
  s2v pipeline ./design-meaxure --framework uniapp --out ./src/pages/Home
  s2v audit    scene.json --assets ./design-meaxure/assets

LEARN MORE
  https://github.com/chenboxun87/sketch-to-vue
`)
}

async function runExtract(args) {
  const inputDir = args[0]
  if (!inputDir) { console.error('Error: meaxure-dir is required'); process.exit(1) }
  const outFlag = args.indexOf('--out')
  const outPath = outFlag !== -1 ? args[outFlag + 1] : 'scene-graph.json'

  const { extractMeaxure } = await import(path.join(rootDir, 'scripts/extract-meaxure.mjs'))
  const { buildSceneGraph } = await import(path.join(rootDir, 'scripts/scene-graph.mjs'))

  console.log(`[s2v] Extracting from: ${inputDir}`)
  const elements = await extractMeaxure(inputDir)
  const graph    = await buildSceneGraph(elements, { meaxureDir: inputDir })
  fs.writeFileSync(outPath, JSON.stringify(graph, null, 2), 'utf8')
  console.log(`[s2v] Scene graph written to: ${outPath}`)
}

async function runEmit(args) {
  const inputFile = args[0]
  if (!inputFile) { console.error('Error: scene-graph.json is required'); process.exit(1) }

  const fwFlag  = args.indexOf('--framework')
  const fw      = fwFlag !== -1 ? args[fwFlag + 1] : 'vue2'
  const outFlag = args.indexOf('--out')
  const outDir  = outFlag !== -1 ? args[outFlag + 1] : './s2v-output'

  fs.mkdirSync(outDir, { recursive: true })
  const graph = JSON.parse(fs.readFileSync(inputFile, 'utf8'))

  console.log(`[s2v] Emitting ${fw} code to: ${outDir}`)

  if (fw === 'react') {
    const { genReactFromSceneGraph } = await import(path.join(rootDir, 'scripts/emit-react.mjs'))
    const result = await genReactFromSceneGraph(graph)
    for (const [filename, content] of Object.entries(result)) {
      fs.writeFileSync(path.join(outDir, filename), content, 'utf8')
      console.log(`  -> ${filename}`)
    }
  } else if (fw === 'uniapp') {
    const { genUniappFromSceneGraph } = await import(path.join(rootDir, 'scripts/emit-uniapp.mjs'))
    const result = await genUniappFromSceneGraph(graph)
    for (const [filename, content] of Object.entries(result)) {
      fs.writeFileSync(path.join(outDir, filename), content, 'utf8')
      console.log(`  -> ${filename}`)
    }
  } else {
    const { genVueFromSceneGraph } = await import(path.join(rootDir, 'scripts/gen-vue-from-scene-graph.mjs'))
    const result = await genVueFromSceneGraph(graph, { framework: fw })
    for (const [filename, content] of Object.entries(result)) {
      fs.writeFileSync(path.join(outDir, filename), content, 'utf8')
      console.log(`  -> ${filename}`)
    }
  }

  console.log(`[s2v] Done. Open ${outDir} to review the generated code.`)
}

async function runAudit(args) {
  const inputFile = args[0]
  if (!inputFile) { console.error('Error: scene-graph.json is required'); process.exit(1) }

  const assetsFlag = args.indexOf('--assets')
  const assetsDir  = assetsFlag !== -1 ? args[assetsFlag + 1] : null
  const graph      = JSON.parse(fs.readFileSync(inputFile, 'utf8'))

  const { auditAssetConsumption } = await import(path.join(rootDir, 'scripts/audit-asset-consumption.mjs'))
  const report = await auditAssetConsumption(graph, { assetsDir })
  const outFile = 'slice-asset-audit.json'
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8')
  console.log(`[s2v] Audit report written to: ${outFile}`)
  console.log(`  Used: ${report.used?.length ?? 0}  Missing: ${report.missing?.length ?? 0}  Unused: ${report.unused?.length ?? 0}`)
}

async function runPipeline(args) {
  await runExtract(['--out', '_s2v_tmp_graph.json', ...args])
  await runEmit(['_s2v_tmp_graph.json', ...args])
  fs.unlinkSync('_s2v_tmp_graph.json')
}

// ── main ──────────────────────────────────────────────────────────────────
const [,, cmd, ...rest] = process.argv

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp()
} else if (cmd === 'extract') {
  await runExtract(rest).catch(e => { console.error(e.message); process.exit(1) })
} else if (cmd === 'emit') {
  await runEmit(rest).catch(e => { console.error(e.message); process.exit(1) })
} else if (cmd === 'audit') {
  await runAudit(rest).catch(e => { console.error(e.message); process.exit(1) })
} else if (cmd === 'pipeline') {
  await runPipeline(rest).catch(e => { console.error(e.message); process.exit(1) })
} else {
  console.error(`Unknown command: ${cmd}`)
  printHelp()
  process.exit(1)
}
