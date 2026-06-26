import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildChartZones } from './extract-chart-features.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const fx = path.join(dir, '../docs/fixtures/sampleDashboard')
let failed = 0
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); failed++ } else console.log('OK:', m) }

const els = JSON.parse(fs.readFileSync(path.join(fx, '_all_elements.json'), 'utf8')).elements
const stackRaw = JSON.parse(fs.readFileSync(path.join(fx, '_layer_stack.json'), 'utf8'))
const layers = Array.isArray(stackRaw) ? stackRaw : (stackRaw.layers || [])
const panels = JSON.parse(fs.readFileSync(path.join(fx, 'panels.json'), 'utf8'))

const out = buildChartZones(els, layers, panels)
assert(out.zones.length >= 2, `at least 2 zones detected (got ${out.zones.length})`)
assert(out.zones[0].confidence === 'high', 'first zone is high confidence')
assert(Array.isArray(out.zones[0].categories), 'categories is array')
assert(out.zones[0].axis !== undefined, 'axis extracted')

if (failed) process.exit(1)
console.log('Fixture chart-zones regression passed')
