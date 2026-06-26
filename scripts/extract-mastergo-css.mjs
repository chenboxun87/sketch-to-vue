/**
 * MasterGo 设计稿 CSS 提取器
 * =====================================================================
 * 从 MasterGo 导出目录（含 FILE_DATA.json）自动提取指定帧内所有节点的
 * 精确 CSS 样式，输出：
 *   1. 逐节点样式表（适合代码比对）
 *   2. 可选 --vue：为 Vue 组件直接输出 <style lang="less"> 片段
 *   3. 可选 --diff <vueFile>：与已有 Vue 组件比对，列出差异
 *
 * 用法:
 *   node scripts/extract-mastergo-css.mjs \
 *     --dir "<design-export>\sampleDialog" \
 *     --frame "智能体默认窗口"
 *
 *   node scripts/extract-mastergo-css.mjs \
 *     --dir "<design-export>\sampleDialog" \
 *     --frame "智能体默认窗口" \
 *     --vue \
 *     --out "src/pages/customerManagerDashboard/components/AiFloatingEntry.vue"
 *
 *   # 同时提取两个帧并合并输出:
 *   node scripts/extract-mastergo-css.mjs \
 *     --dir "<design-export>\sampleDialog" \
 *     --frame "智能体默认窗口,示例弹窗帧" \
 *     --vue
 *
 * =====================================================================
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── CLI 参数解析 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}
const hasFlag = (flag) => args.includes(flag)

const designDir = getArg('--dir') || '<design-export>/sampleDialog'
const frameNames = (getArg('--frame') || '智能体默认窗口,示例弹窗帧')
  .split(',').map(s => s.trim())
const outputVue = hasFlag('--vue')
const outFile = getArg('--out')
const verbose = hasFlag('--verbose') || hasFlag('-v')

// ─── 颜色转换工具 ──────────────────────────────────────────────────────────────
const toHex2 = (v) => Math.round(v * 255).toString(16).padStart(2, '0')

function colorToHex(c) {
  if (!c) return 'transparent'
  const r = toHex2(c.r), g = toHex2(c.g), b = toHex2(c.b)
  const a = c.a !== undefined ? c.a : 1
  if (Math.abs(a - 1) < 0.001) return `#${r}${g}${b}`.toUpperCase()
  const ah = toHex2(a)
  return `#${r}${g}${b}${ah}`.toUpperCase()
}

function colorToRgba(c) {
  if (!c) return 'transparent'
  const r = Math.round(c.r * 255)
  const g = Math.round(c.g * 255)
  const b = Math.round(c.b * 255)
  const a = c.a !== undefined ? c.a : 1
  if (Math.abs(a - 1) < 0.001) return `rgb(${r},${g},${b})`
  return `rgba(${r},${g},${b},${parseFloat(a.toFixed(4))})`
}

// 同时返回 hex 和 rgba（用于 CSS）
function colorToCss(c) {
  return colorToHex(c) + '  /* ' + colorToRgba(c) + ' */'
}

// ─── 渐变 ────────────────────────────────────────────────────────────────────
function gradientToCss(fill) {
  const stops = (fill.gradientStops || [])
    .map(s => `${colorToHex(s.color)} ${(s.position * 100).toFixed(1)}%`)
    .join(', ')

  if (fill.type === 'GRADIENT_RADIAL') return `radial-gradient(${stops})`

  // LINEAR: 从 transform 矩阵推算角度
  const t = fill.transform
  let deg = 180
  if (t && t[0] && t[1]) {
    const angle = Math.atan2(t[0][1], t[0][0])
    deg = Math.round((angle * 180) / Math.PI + 90)
    if (deg < 0) deg += 360
  }
  return `linear-gradient(${deg}deg, ${stops})`
}

// ─── fills → CSS background ─────────────────────────────────────────────────
function fillsToCss(fills) {
  if (!fills || !fills.length) return null
  const visible = fills.filter(f => f.visible !== false)
  if (!visible.length) return null

  const parts = visible.map(f => {
    if (f.type === 'SOLID') return `${colorToHex(f.color)}  /* ${colorToRgba(f.color)} */`
    if (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') return gradientToCss(f)
    if (f.type === 'IMAGE') return `/* image(${f.scaleMode}) → 需贴图 */`
    return `/* ${f.type} */`
  })
  return parts.join(',\n    ')
}

// ─── strokes → CSS border ────────────────────────────────────────────────────
function strokesToCss(strokes, weight, align) {
  if (!strokes || !strokes.length) return null
  const s = strokes[0]
  const w = weight || 1
  const pos = align === 'INSIDE' ? 'inset ' : ''
  return `${w}px solid ${colorToHex(s.color)}  /* ${colorToRgba(s.color)} */`
}

// ─── effects → CSS filter / box-shadow / backdrop-filter ────────────────────
function effectsToCss(effects) {
  if (!effects || !effects.length) return null
  const shadows = [], filters = [], backdrop = []

  for (const e of effects) {
    if (e.visible === false) continue
    if (e.type === 'DROP_SHADOW') {
      const c = colorToHex(e.color)
      const cr = colorToRgba(e.color)
      shadows.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${c}  /* ${cr} */`)
    } else if (e.type === 'INNER_SHADOW') {
      const c = colorToHex(e.color)
      const cr = colorToRgba(e.color)
      shadows.push(`inset ${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${c}  /* ${cr} */`)
    } else if (e.type === 'LAYER_BLUR') {
      filters.push(`blur(${e.radius}px)`)
    } else if (e.type === 'BACKGROUND_BLUR') {
      backdrop.push(`blur(${e.radius}px)`)
    }
  }

  const result = {}
  if (shadows.length) result['box-shadow'] = shadows.join(',\n    ')
  if (filters.length) result['filter'] = filters.join(' ')
  if (backdrop.length) result['backdrop-filter'] = backdrop.join(' ')
  return result
}

// ─── text style → CSS ────────────────────────────────────────────────────────
function textStyleToCss(style, fills) {
  if (!style) return {}
  const css = {}
  if (style.fontSize) css['font-size'] = `${style.fontSize}px`
  if (style.fontWeight && style.fontWeight !== 'regular') css['font-weight'] = style.fontWeight
  if (style.fontFamily) css['font-family'] = `'${style.fontFamily}', sans-serif`
  if (style.lineHeightPx && style.lineHeightUnit !== 'AUTO')
    css['line-height'] = `${style.lineHeightPx}px`
  else if (style.lineHeightUnit === 'AUTO') css['line-height'] = 'auto'
  if (style.letterSpacing && style.letterSpacing !== 0)
    css['letter-spacing'] = `${style.letterSpacing}px`
  if (style.textAlignHorizontal) {
    const map = { LEFT: 'left', RIGHT: 'right', CENTER: 'center', JUSTIFIED: 'justify' }
    css['text-align'] = map[style.textAlignHorizontal] || 'left'
  }

  const colorFill = fillsToCss(fills)
  if (colorFill) css['color'] = colorFill

  return css
}

// ─── cornerRadius → CSS border-radius ────────────────────────────────────────
function radiusToCss(node) {
  if (node.cornerRadius !== undefined && node.cornerRadius > 0)
    return `${node.cornerRadius}px`
  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii
    if (tl === tr && tr === br && br === bl) return `${tl}px`
    return `${tl}px ${tr}px ${br}px ${bl}px`
  }
  return null
}

// ─── 节点 → CSS 属性对象 ────────────────────────────────────────────────────
function nodeToProps(node, originX, originY) {
  const b = node.absoluteBoundingBox
  const props = {}

  if (b) {
    props.left   = `${Math.round(b.x - originX)}px`
    props.top    = `${Math.round(b.y - originY)}px`
    props.width  = `${Math.round(b.width)}px`
    props.height = `${Math.round(b.height)}px`
    props.position = 'absolute'
  }

  const radius = radiusToCss(node)
  if (radius) props['border-radius'] = radius

  if (node.opacity !== undefined && node.opacity !== 1)
    props.opacity = node.opacity.toFixed(4)

  const bg = fillsToCss(node.fills)
  if (bg && node.type !== 'TEXT') props.background = bg

  const border = strokesToCss(node.strokes, node.strokeWeight, node.strokeAlign)
  if (border) props.border = border

  const fx = effectsToCss(node.effects)
  if (fx) Object.assign(props, fx)

  if (node.type === 'TEXT') {
    const textCss = textStyleToCss(node.style, node.fills)
    Object.assign(props, textCss)
    props['/* content */'] = JSON.stringify(node.characters?.substring(0, 60) || '')
  }

  if (node.blendMode && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH')
    props['mix-blend-mode'] = node.blendMode.toLowerCase().replace(/_/g, '-')

  if (node.layoutMode) {
    props.display = 'flex'
    props['flex-direction'] = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'
    if (node.paddingTop    || node.paddingBottom ||
        node.paddingLeft   || node.paddingRight) {
      props.padding = `${node.paddingTop||0}px ${node.paddingRight||0}px ${node.paddingBottom||0}px ${node.paddingLeft||0}px`
    }
    if (node.itemSpacing) props.gap = `${node.itemSpacing}px`
  }

  if (node.clipsContent) props.overflow = 'hidden'

  return props
}

// ─── 递归扁平化节点 ───────────────────────────────────────────────────────────
function flattenNodes(node, originX, originY, depth = 0, result = []) {
  const b = node.absoluteBoundingBox
  const entry = {
    depth,
    id:   node.id,
    name: node.name,
    type: node.type,
    chars: node.type === 'TEXT' ? node.characters?.substring(0, 80) : undefined,
    rx: b ? Math.round(b.x - originX) : 0,
    ry: b ? Math.round(b.y - originY) : 0,
    w:  b ? Math.round(b.width)  : 0,
    h:  b ? Math.round(b.height) : 0,
    css: nodeToProps(node, originX, originY),
    node, // 保留原始节点
  }
  result.push(entry)
  for (const child of (node.children || [])) {
    flattenNodes(child, originX, originY, depth + 1, result)
  }
  return result
}

// ─── CSS 属性对象 → Less 字符串 ──────────────────────────────────────────────
function cssToLess(selector, props, indent = '') {
  const lines = [`${indent}${selector} {`]
  for (const [k, v] of Object.entries(props)) {
    if (k === 'box-shadow' && v.includes('\n')) {
      lines.push(`${indent}  ${k}:`)
      for (const shadow of v.split(',\n    ')) {
        lines.push(`${indent}    ${shadow.trim()},`)
      }
      // 去掉最后一行的逗号
      lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, ';')
    } else if (!k.startsWith('/*')) {
      lines.push(`${indent}  ${k}: ${v};`)
    }
  }
  lines.push(`${indent}}`)
  return lines.join('\n')
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
function run() {
  const fdPath = path.join(designDir, 'FILE_DATA.json')
  if (!fs.existsSync(fdPath)) {
    console.error(`[ERROR] FILE_DATA.json 不存在: ${fdPath}`)
    console.error(`  请先运行 MasterGo 导出，或检查 --dir 路径`)
    process.exit(1)
  }

  console.log(`\n读取设计文件: ${fdPath}`)
  const fd = JSON.parse(fs.readFileSync(fdPath, 'utf8'))
  const page1 = fd.document?.children?.find(p => p.type === 'CANVAS') ||
                fd.document?.children?.[0]
  if (!page1) {
    console.error('[ERROR] 找不到页面节点')
    process.exit(1)
  }

  // ─── 处理每个目标帧 ────────────────────────────────────────────────────────
  const allOutput = []

  for (const frameName of frameNames) {
    const frame = page1.children?.find(f => f.name === frameName)
    if (!frame) {
      console.warn(`[WARN] 找不到帧: "${frameName}"，已跳过`)
      console.warn(`  可用帧: ${page1.children?.map(f => f.name).join(', ')}`)
      continue
    }

    const b = frame.absoluteBoundingBox
    const originX = b?.x || 0
    const originY = b?.y || 0
    const W = Math.round(b?.width || 0)
    const H = Math.round(b?.height || 0)

    console.log(`\n${'═'.repeat(70)}`)
    console.log(`帧: "${frameName}"  ${W}×${H}  origin=(${originX},${originY})`)
    console.log('═'.repeat(70))

    const nodes = []
    for (const child of (frame.children || [])) {
      flattenNodes(child, originX, originY, 0, nodes)
    }

    // ─── 按类型分组输出 ────────────────────────────────────────────────────
    const backgrounds = nodes.filter(n =>
      (n.type === 'RECTANGLE' || n.type === 'PEN') &&
      n.w >= W * 0.5 && n.h >= H * 0.5)
    const texts   = nodes.filter(n => n.type === 'TEXT')
    const images  = nodes.filter(n =>
      n.node?.fills?.some(f => f.type === 'IMAGE') ||
      n.node?.fills?.some(f => f.visible !== false && f.type === 'IMAGE'))
    const buttons = nodes.filter(n =>
      n.name.includes('按钮') || n.name.includes('发送') ||
      n.name.includes('btn') || n.name.includes('Btn'))
    const others  = nodes.filter(n =>
      !backgrounds.includes(n) && !texts.includes(n) &&
      !images.includes(n) && !buttons.includes(n))

    const sections = [
      { title: '背景层', list: backgrounds },
      { title: '文字层', list: texts },
      { title: '图片层', list: images },
      { title: '按钮层', list: buttons },
      { title: '其他图形', list: others },
    ]

    const lessBlocks = []

    for (const { title, list } of sections) {
      if (!list.length) continue
      console.log(`\n┌─ ${title} (${list.length}个)`)

      for (const n of list) {
        const pad = '│ ' + '  '.repeat(n.depth)
        const id = n.id
        const cssClass = `.${slugify(n.name)}-${id.replace(/:/g, '-')}`

        // 控制台输出
        console.log(`${pad}[${n.type}] "${n.name}"  id=${id}`)
        console.log(`${pad}  rx=${n.rx} ry=${n.ry} w=${n.w} h=${n.h}`)
        if (n.chars) console.log(`${pad}  文字: "${n.chars}"`)

        for (const [k, v] of Object.entries(n.css)) {
          if (k === '/* content */') continue
          const vShort = String(v).replace(/\n\s+/g, ' ')
          console.log(`${pad}  ${k}: ${vShort.substring(0, 100)}`)
        }

        // Less 代码块
        lessBlocks.push(
          `/* ${n.name}  rx=${n.rx} ry=${n.ry} w=${n.w} h=${n.h} */\n` +
          cssToLess(cssClass, n.css)
        )
      }
    }

    // ─── Vue Less 输出 ──────────────────────────────────────────────────────
    if (outputVue) {
      const lessOutput = [
        `/* ════════════════════════════════════════════════════════`,
        ` * 自动生成: extract-mastergo-css.mjs`,
        ` * 帧: "${frameName}"  ${W}×${H}`,
        ` * 时间: ${new Date().toISOString()}`,
        ` * ════════════════════════════════════════════════════════ */`,
        '',
        ...lessBlocks,
      ].join('\n\n')

      allOutput.push({ frameName, lessOutput, nodes, W, H, originX, originY })
    }

    // ─── 输出到文件 ────────────────────────────────────────────────────────
    const outPath = outFile ||
      path.join(__dirname, '..', `_design-css-${slugify(frameName)}.less`)

    if (outputVue) {
      const header = allOutput[allOutput.length - 1].lessOutput
      fs.writeFileSync(outPath, header, 'utf8')
      console.log(`\n[输出] Less 已写入: ${outPath}`)
    }
  }

  // ─── 汇总报告（不指定 --vue 时也输出 JSON） ───────────────────────────────
  if (!outputVue) {
    const jsonOut = path.join(__dirname, '..', '_design-nodes.json')
    const summary = frameNames.map(frameName => {
      const frame = page1.children?.find(f => f.name === frameName)
      if (!frame) return { frameName, nodes: [] }
      const b = frame.absoluteBoundingBox
      const ox = b?.x || 0, oy = b?.y || 0
      const nodes = []
      for (const child of (frame.children || [])) flattenNodes(child, ox, oy, 0, nodes)
      return { frameName, nodes: nodes.map(n => ({ id: n.id, name: n.name, type: n.type, rx: n.rx, ry: n.ry, w: n.w, h: n.h, css: n.css })) }
    })
    fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2), 'utf8')
    console.log(`\n[输出] 节点 JSON 已写入: ${jsonOut}`)
    console.log('   提示: 加 --vue 参数可输出 Less 代码片段')
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function slugify(name) {
  return name
    .replace(/[\s\/\\:*?"<>|@#$%^&()+=\[\]{}|;',!~`]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .substring(0, 40) || 'node'
}

run()
