/**
 * MasterGo extract 前/中 enrich 编排：DSL → 帧 PNG 切片补全
 */
import fs from 'fs'
import path from 'path'
import {
  enrichElementsFromDsl,
  enrichElementsFromManualJson,
  loadDslFile,
  loadManualEnrichFile,
} from './enrich-from-dsl.mjs'
import { cropFramePngFallbacks } from './enrich-mg-frame-png.mjs'

/**
 * @returns {{ dsl?: object, framePng?: object }}
 */
export function enrichMgElements({
  elements,
  designDir,
  outDir,
  board,
  frameId,
  dslPath,
  enableFramePng = true,
}) {
  const report = { dsl: null, manual: null, framePng: null }

  const dsl = loadDslFile(dslPath)
  if (dsl) {
    report.dsl = enrichElementsFromDsl(elements, dsl)
  }

  const manual = loadManualEnrichFile(outDir)
  if (manual) {
    report.manual = enrichElementsFromManualJson(elements, manual)
  }

  if (enableFramePng && frameId && designDir && board) {
    report.framePng = cropFramePngFallbacks(elements, board, designDir, frameId)
  }

  const logPath = path.join(outDir, '_mg_enrich_report.json')
  fs.writeFileSync(logPath, JSON.stringify(report, null, 2))
  return report
}
