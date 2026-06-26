/**
 * G9：emit-baseline vs Vue 页 [data-mg-id] 坐标偏差 ≤ tolerance px
 *
 * node verify-mg-g9.mjs --emit "<emitDir>/index.html" --data "<pilot>/data" [--vue-url URL] [--tolerance 2]
 *
 * 无 --vue-url 时仅校验 emit HTML 与 _all_elements.json 一致（静态子集）。
 */
import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const getArg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

const emitHtml = getArg('--emit')
const dataDir = getArg('--data')
const vueUrl = getArg('--vue-url')
const tolerance = Number(getArg('--tolerance') || 2)
const idsArg = getArg('--ids')
const focusIds = idsArg ? idsArg.split(',').map((s) => s.trim()) : null

if (!emitHtml || !dataDir) {
  console.error(
    'Usage: node verify-mg-g9.mjs --emit "<emit>/index.html" --data "<pilot>/data" [--vue-url URL] [--tolerance 2] [--ids id1,id2]'
  )
  process.exit(1)
}

const all = JSON.parse(fs.readFileSync(path.join(dataDir, '_all_elements.json'), 'utf8'))
const stack = JSON.parse(fs.readFileSync(path.join(dataDir, '_layer_stack.json'), 'utf8'))
const byId = Object.fromEntries(all.elements.map((e) => [e.id, e]))

function parseEmitRects(html) {
  const map = {}
  const re = /data-id="([^"]+)"[^>]*style="([^"]*)"/g
  let m
  while ((m = re.exec(html))) {
    const id = m[1]
    const style = m[2]
    const pick = (prop) => {
      const r = new RegExp(`${prop}:([\\d.]+)px`).exec(style)
      return r ? Number(r[1]) : null
    }
    map[id] = {
      left: pick('left'),
      top: pick('top'),
      width: pick('width'),
      height: pick('height'),
    }
  }
  return map
}

function diffRect(label, expected, actual, tol) {
  const issues = []
  for (const k of ['left', 'top', 'width', 'height']) {
    const e = expected[k]
    const a = actual[k]
    if (e == null || a == null) continue
    const d = Math.abs(e - a)
    if (d > tol) issues.push({ key: k, expected: e, actual: a, delta: d })
  }
  return issues.length ? { label, issues } : null
}

const emitMap = parseEmitRects(fs.readFileSync(emitHtml, 'utf8'))
const layerIds = stack.layers
  .filter((l) => !l.excludeFromVueDecor)
  .map((l) => l.elementId)
const checkIds = focusIds || layerIds

const emitVsData = []
for (const id of checkIds) {
  const el = byId[id]
  if (!el || el.renderAs === 'skip') continue
  const exp = {
    left: el.rect?.x,
    top: el.rect?.y,
    width: el.rect?.w,
    height: el.rect?.h,
  }
  const act = emitMap[id]
  if (!act) {
    emitVsData.push({ id, name: el.name, error: 'missing_in_emit' })
    continue
  }
  const d = diffRect(`${id} emit vs data`, exp, act, tolerance)
  if (d) emitVsData.push({ id, name: el.name, ...d })
}

let vueVsEmit = []
let vueOk = true

if (vueUrl) {
  let playwright
  try {
    playwright = await import('playwright')
  } catch {
    console.error('[G9] 需要 playwright：npm install -D playwright && npx playwright install chromium')
    process.exit(1)
  }
  const browser = await playwright.chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(vueUrl, { waitUntil: 'networkidle', timeout: 120000 })

  const vueRects = await page.evaluate(() => {
    const out = {}
    document.querySelectorAll('[data-mg-id]').forEach((el) => {
      const id = el.getAttribute('data-mg-id')
      const stage = document.querySelector('.mg-frame') || document.body
      const stageR = stage.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      out[id] = {
        left: r.left - stageR.left,
        top: r.top - stageR.top,
        width: r.width,
        height: r.height,
      }
    })
    return out
  })
  await browser.close()

  for (const id of checkIds) {
    const exp = emitMap[id]
    const act = vueRects[id]
    if (!exp || !act) continue
    const d = diffRect(`${id} vue vs emit`, exp, act, tolerance)
    if (d) {
      vueVsEmit.push({ id, name: byId[id]?.name, ...d })
      vueOk = false
    }
  }
}

const report = {
  tolerance,
  emitVsDataFailures: emitVsData,
  vueVsEmitFailures: vueVsEmit,
  checked: checkIds.length,
  ok: emitVsData.length === 0 && vueOk,
}

const outPath = path.join(dataDir, '_g9_verify_report.json')
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

console.log('[G9]', report.ok ? 'PASS' : 'FAIL', `checked=${report.checked} tol=${tolerance}px`)
if (emitVsData.length) console.log('  emit vs data:', emitVsData.length, 'issues')
if (vueVsEmit.length) console.log('  vue vs emit:', vueVsEmit.length, 'issues')
console.log('  →', outPath)

if (!report.ok) process.exit(1)
