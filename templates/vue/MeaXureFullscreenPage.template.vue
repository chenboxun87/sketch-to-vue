<template>
  <!--
    MeaXureFullscreenPage.template.vue
    ===================================
    全屏 Sketch MeaXure 设计稿还原页模板（Vue 2 Options API）
    - 信箱式等比缩放（letterbox scaling）
    - 自动渲染 layer_stack（切片 / 矢量 / 文本三类图层）
    - 内置所有已知渲染缺陷过滤器（退化描边路径、按下态切片、蒙版层、图表区静态层）
    - ECharts 图表叠加层预留挂载点

    使用步骤：
    1. 复制本文件到目标页面目录，重命名为 Index.vue
    2. 搜索所有 TODO 注释，按提示填写项目特定值
    3. 将图表组件替换到 TODO: ECharts 区域
    4. 手动将页面路由加入 routerInfo.js（禁止运行 npm run router）
    5. [可选] 对称 KPI：跑 detect-symmetric-module-gaps.mjs，有 dispositionMismatches 时启用 §1.5
    6. [推荐] 含 icon-gap / 多 chart zone 时：用 templates/shared/boardRender.mjs（规则 74），
       勿 copy  sibling 项目的 *BoardRender.js；交付前跑 verify-board-render-plan.mjs
    7. 渲染顺序：slice/vector → ECharts(z≥5000) → text(z≥9000)（规则 75）
  -->
  <div class="dcv-shell" ref="shell">
    <div class="dcv-letterbox" :style="letterboxStyle">
      <div class="dcv-board" :style="boardStyle">

        <!-- ① 静态图层渲染区 -->
        <template v-for="item in renderItems">
          <!-- 切片图片层 -->
          <img
            v-if="item.kind === 'slice'"
            :key="item.id"
            :style="item.style"
            :src="item.src"
            :alt="item.name"
            draggable="false"
          />
          <!-- 矢量 CSS 层 -->
          <div
            v-else-if="item.kind === 'vector'"
            :key="item.id"
            :style="item.style"
          />
          <!-- 文本层 -->
          <div
            v-else-if="item.kind === 'text'"
            :key="item.id"
            :style="item.style"
          >{{ item.content }}</div>
        </template>

        <!-- ② ECharts 图表叠加层 -->
        <div
          v-for="ov in chartOverlays"
          :key="ov.key"
          :style="ov.style"
        >
          <!-- TODO: [ECharts] 替换为你的图表组件，并传入 ov.zone 数据 -->
          <!-- 示例：
          <BarChart v-if="ov.type === 'bar'" :zone="ov.zone" :data="mockData[ov.key]" />
          <LineChart v-else-if="ov.type === 'line'" :zone="ov.zone" :data="mockData[ov.key]" />
          <PieChart v-else-if="ov.type === 'pie'" :zone="ov.zone" :data="mockData[ov.key]" />
          -->
        </div>

      </div>
    </div>
  </div>
</template>

<script>
// ─────────────────────────────────────────────────────────────────────────────
// § 0. 设计稿数据文件导入
//     TODO: [import-paths] 如果本文件不在数据目录的直接父级，请修正以下路径
// ─────────────────────────────────────────────────────────────────────────────
import layerStackData  from './data/_layer_stack.json'
import allElementsData from './data/_all_elements.json'
import renderGapsData  from './data/_render_gaps_report.json'

// TODO: [chart-zones] 如果 _chart_zones.json 尚不存在，注释掉这行，并在 data() 中改为 null
import chartZonesData  from './data/_chart_zones.json'

/**
 * TODO: [symmetric-kpi] 规则 62：当 detect-symmetric-module-gaps.mjs 报告 dispositionMismatches 时：
 *   1. 复制 <skill>/assets/symmetric_module_clones.template.json → data/_symmetric_module_clones.json 并填 id
 *   2. 取消下行 import 注释，删除下方空 stub
 *   详见 references/symmetric-kpi-override.md
 */
// import symmetricModuleClones from './data/_symmetric_module_clones.json'
const symmetricModuleClones = { excludeNativeIds: [], specs: [] }

/** 对称 KPI 替换：隐藏目标行错误原生层（excludeNativeIds 为空时无影响） */
const KPI_OVERRIDE_EXCLUDE_IDS = new Set(symmetricModuleClones.excludeNativeIds || [])

// TODO: [multi-artboard] 多画板项目取消注释
// import artboardMergePlan from './data/_artboard_merge_plan.json'

// ─────────────────────────────────────────────────────────────────────────────
// § 1. 项目级常量
//     ⚠️ 必须填写前三项，其余可按需调整
// ─────────────────────────────────────────────────────────────────────────────

/** TODO: [board-size] 设计稿画布宽度（像素，1x CSS px） */
const BOARD_W = 1920

/** TODO: [board-size] 设计稿画布高度（像素，1x CSS px） */
const BOARD_H = 1080

/**
 * TODO: [content-shift] 如果设计稿包含头部导航等"chrome"需要跳过，
 *   填写内容区相对画布左上角的偏移量（单位 px）。
 *   全画布布局（无 chrome）时保持 0 / 0。
 */
const CONTENT_SHIFT_X = 0
const CONTENT_SHIFT_Y = 0

/**
 * TODO: [static-base] 设计稿切片图片的 public URL 前缀。
 *   例如：'/static/my-module/design-assets'
 *   （路径末尾不加斜杠）
 */
const STATIC_BASE = '/static/TODO_YOUR_MODULE/design-assets'

// ─────────────────────────────────────────────────────────────────────────────
// § 1.1 vector-css 消费（规则 47 / 66 — 与 templates/shared/vectorStyle.mjs 同步）
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCssValue(val) {
  return String(val || '')
    .trim()
    .replace(/;\s*$/, '')
    .replace(/\bNaNpx\b/g, '0')
}

function parseCssArray(css, opts = {}) {
  const style = {}
  ;(css || []).forEach((line) => {
    const m = String(line).match(/^([^:]+):\s*(.+)$/)
    if (!m) return
    const prop = m[1].trim()
    let val = normalizeCssValue(m[2])
    if (!val) return
    if (prop === 'transform' && !opts.keepTransform) return
    const camel = prop.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
    style[camel] = val
  })
  return style
}

function rgbaFromSketchColor(color) {
  if (!color || !color.rgb) return ''
  const { r, g, b } = color.rgb
  let a = color.alpha
  if (a == null) a = 1
  else if (a > 1) a = a / 255
  return `rgba(${r},${g},${b},${Number(a.toFixed(3))})`
}

function synthBorderFromAttrs(attrs) {
  const borders = (attrs && attrs.borders) || []
  if (!borders.length) return {}

  const hasExplicitBorder = (attrs.css || []).some(
    (c) => /^border\s*:/i.test(String(c)) && !/border-radius/i.test(String(c))
  )
  if (hasExplicitBorder) return {}

  const insetParts = []
  for (const b of borders) {
    const thick = b.thickness || b.width || 1
    let color = ''

    if (b.fillType === 'Gradient' && b.gradient && Array.isArray(b.gradient.colorStops)) {
      const stops = b.gradient.colorStops
      const best = stops.reduce(
        (acc, s) => ((s.color && s.color.alpha) || 0) > ((acc.color && acc.color.alpha) || 0) ? s : acc,
        stops[0] || { color: { alpha: 0 } }
      )
      color = rgbaFromSketchColor(best.color)
    } else if (b.color) {
      color = typeof b.color === 'string' ? b.color.split(/\s+/)[0] : rgbaFromSketchColor(b.color)
    }

    if (!color || /,\s*0\)$/.test(color)) continue
    if (String(b.position || 'Center') === 'Inside') {
      insetParts.push(`inset 0 0 0 ${thick}px ${color}`)
    }
  }

  if (!insetParts.length) return {}
  return { boxShadow: insetParts.join(', ') }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 1.5 对称 KPI 镜像（可选，规则 62）
//     excludeNativeIds / specs 均为空时 _SYMMETRIC_CLONES=[]，对渲染零影响
// ─────────────────────────────────────────────────────────────────────────────

const _RAW = Array.isArray(layerStackData)
  ? layerStackData
  : (layerStackData.layers || [])

const LAYER_BY_ID = Object.create(null)
_RAW.forEach((layer) => {
  if (layer && layer.id) LAYER_BY_ID[layer.id] = layer
})

const ELEMENT_BY_ID = Object.create(null)
const _elementList = allElementsData.elements || allElementsData
;(_elementList || []).forEach((el) => {
  if (el && el.id) ELEMENT_BY_ID[el.id] = el
})

function shiftRectByDy(rect, dy) {
  if (!rect || dy == null) return null
  return { x: rect.x, y: rect.y + dy, w: rect.w, h: rect.h }
}

function buildLayerFromElement(el, dy, idSuffix) {
  if (!el || !el.rect) return null
  const rect = shiftRectByDy(el.rect, dy)
  const id = `${el.id}${idSuffix}`
  if (el.type === 'text') {
    return {
      id,
      name: el.name,
      type: el.type,
      role: 'symmetric-clone',
      z: el.z,
      zIndex: el.z,
      rect,
      source: {
        kind: 'text',
        content: el.content,
        fontFamily: el.fontFamily,
        fontSize: el.fontSize,
        fontWeight: el.fontWeight,
        color: el.color,
      },
    }
  }
  if (el.type === 'slice') {
    const exp = (el.exports && el.exports[0]) || {}
    const file = exp.path || exp.name || ''
    return {
      id,
      name: el.name,
      type: el.type,
      role: 'symmetric-clone',
      z: el.z,
      zIndex: el.z,
      rect,
      source: { kind: 'slice-file', file, css: el.css || [] },
    }
  }
  if (el.type === 'shape' && Array.isArray(el.css) && el.css.length) {
    return {
      id,
      name: el.name,
      type: el.type,
      role: 'symmetric-clone',
      z: el.z,
      zIndex: el.z,
      rect,
      source: { kind: 'vector-css', css: el.css || [] },
    }
  }
  return null
}

function cloneLayerWithDy(layer, dy, idSuffix) {
  if (!layer || !layer.rect) return null
  return {
    ...layer,
    id: `${layer.id}${idSuffix}`,
    role: 'symmetric-clone',
    rect: shiftRectByDy(layer.rect, dy),
    source: layer.source ? { ...layer.source } : layer.source,
  }
}

function buildSymmetricCloneLayers() {
  const out = []
  for (const spec of symmetricModuleClones.specs || []) {
    const dy = spec.dy
    const idSuffix = spec.idSuffix || '-symclone'
    for (const sourceId of spec.sourceElementIds || []) {
      const base = LAYER_BY_ID[sourceId]
      const el = ELEMENT_BY_ID[sourceId]
      const cloned = base
        ? cloneLayerWithDy(base, dy, idSuffix)
        : buildLayerFromElement(el, dy, idSuffix)
      if (!cloned) continue
      const zMap = spec.zOverrideBySourceId || {}
      const z = zMap[sourceId] != null ? zMap[sourceId] : spec.zOverride
      if (z != null) {
        cloned.z = z
        cloned.zIndex = z
      }
      out.push(cloned)
    }
  }
  return out
}

const _SYMMETRIC_CLONES = buildSymmetricCloneLayers()
const _ALL_LAYERS = _RAW.concat(_SYMMETRIC_CLONES)

// ─────────────────────────────────────────────────────────────────────────────
// § 2. 模块级工具函数
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将设计稿内部文件路径转为可用的 public URL。
 * 保留 icon/、pic/ 子目录；Windows 路径先归一化再取 /assets/ 之后段。
 * 见 templates/shared/layerUrl.mjs 与 hard-won-rules 规则 63。
 *
 * @param {string} filePath - layer_stack 中的原始 source.file 路径
 * @returns {string} 可在 <img :src> 中直接使用的 URL
 */
function relativeAssetPath(filePath) {
  const raw = String(filePath || '').replace(/\\/g, '/').trim()
  if (!raw) return ''
  if (raw.includes('/assets/')) {
    return raw.slice(raw.indexOf('/assets/') + '/assets/'.length)
  }
  return raw.replace(/^\/+/, '')
}

function assetUrl(filePath) {
  const rel = relativeAssetPath(filePath)
  if (!rel) return ''
  const encoded = rel.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  return `${STATIC_BASE}/${encoded}`
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. 正则常量（过滤器用）
// ─────────────────────────────────────────────────────────────────────────────

/** 过滤掉交互态"按下"切片，避免叠加在默认态上面 */
const PRESSED_RE = /^(按下|按下\d+|pressed)$/i

/** 过滤掉蒙版形状层（纯结构层，不应渲染为视觉元素） */
const MASK_RE = /^蒙版$/

// ─────────────────────────────────────────────────────────────────────────────
// § 4. Vue 组件定义
// ─────────────────────────────────────────────────────────────────────────────

export default {
  name: /* TODO: [component-name] 改为你的组件名 */ 'MeaXureFullscreenPage',

  // TODO: [child-components] 注册你的 ECharts 图表子组件
  // components: {
  //   BarChart: () => import('./components/BarChart.vue'),
  //   LineChart: () => import('./components/LineChart.vue'),
  //   PieChart: () => import('./components/PieChart.vue'),
  // },

  data() {
    return {
      /** 用于触发响应式重算的窗口尺寸快照 */
      windowWidth:  window.innerWidth,
      windowHeight: window.innerHeight,

      // TODO: [mock-data] 添加 ECharts 所需的 mock / API 数据字段
      // mockData: {},
    }
  },

  computed: {
    // ── 2.1 缩放比（信箱式，保持宽高比） ─────────────────────────────────────
    /**
     * 计算使设计稿完整显示在 shell 容器内的等比缩放比。
     * 同时响应窗口 resize（通过 windowWidth / windowHeight）。
     */
    scale() {
      const sw = this.$refs.shell?.clientWidth  || this.windowWidth
      const sh = this.$refs.shell?.clientHeight || this.windowHeight
      return Math.min(sw / BOARD_W, sh / BOARD_H)
    },

    /** 信箱外框尺寸：按缩放后的设计稿实际像素定大小，flex 居中 */
    letterboxStyle() {
      const s = this.scale
      return {
        width:    `${BOARD_W * s}px`,
        height:   `${BOARD_H * s}px`,
        position: 'relative',
      }
    },

    /** 画板容器：原始尺寸 + CSS scale 变换，以实现像素级还原 */
    boardStyle() {
      return {
        width:           `${BOARD_W}px`,
        height:          `${BOARD_H}px`,
        transform:       `scale(${this.scale})`,
        transformOrigin: '0 0',
        position:        'absolute',
        top:             0,
        left:            0,
      }
    },

    // ── 2.2 渲染图层列表（核心计算属性） ──────────────────────────────────────
    /**
     * 将 _layer_stack.json 中的图层数据转换为可直接渲染的对象数组。
     *
     * 内置过滤器：
     *  ① 退化描边路径（border width > 元素短边 / 2）→ 跳过
     *  ② 图表区内的静态层（ECharts 接管区域）→ 跳过
     *  ③ 按下态切片（PRESSED_RE）→ 跳过
     *  ④ 蒙版层（MASK_RE）→ 跳过
     *  ⑤ 文本内容 + 位置完全相同的重复项 → 去重保留首次
     *  ⑥ 对称 KPI excludeNativeIds（规则 62）→ 跳过错误原生层
     *
     * 对称 KPI clone 层由 §1.5 `_symmetric_module_clones.json` 生成并 concat 进 stack。
     *
     * 返回格式：
     *  - { kind:'slice',  id, name, style, src }
     *  - { kind:'vector', id, name, style }
     *  - { kind:'text',   id, name, style, content }
     */
    renderItems() {
      // ── 从 render_gaps_report 读取过滤数据 ───────────────────────────────
      const degenerateIds = new Set(
        (renderGapsData.degenerateBorderPaths || []).map((d) => d.id)
      )

      /** blendMap[layerId] → CSS mix-blend-mode 值 */
      const blendMap = {}
      for (const b of renderGapsData.blendHints || []) {
        blendMap[b.id] = b.blendMode
      }

      /** ECharts 接管区域内的静态层 id 集合 */
      const chartExcludeIds = new Set()
      const zones = chartZonesData?.zones || []
      for (const z of zones) {
        for (const id of z.excludeLayerIds || []) chartExcludeIds.add(id)
      }

      // ── 图层源：layer_stack + 对称 KPI clone（§1.5） ───────────────────────
      const stack = _ALL_LAYERS
      // allElementsData 暂用于文本样式扩展（见下方 TODO）
      const elements = allElementsData.elements || allElementsData

      // ── 文本去重 key：content + 坐标四舍五入到 4px 格 ────────────────────
      const textKeys = new Set()

      const sliceItems = []
      const otherItems = []
      const textItems  = []

      stack.forEach((layer) => {
        const { id, name, rect, zIndex, z } = layer
        // 过滤 ⑥：对称 KPI 错误原生层（规则 62）
        if (KPI_OVERRIDE_EXCLUDE_IDS.has(id)) return
        const zi  = zIndex || z || 0
        const src = layer.source || {}
        const kind = src.kind || layer.kind || ''

        // 过滤 ①：退化描边路径
        if (degenerateIds.has(id)) return
        // 过滤 ②：图表区静态层
        if (chartExcludeIds.has(id)) return

        // ── 切片层处理 ──────────────────────────────────────────────────────
        if (kind === 'slice-file') {
          if (PRESSED_RE.test(name || '')) return  // 过滤 ③
          if (MASK_RE.test(name || ''))   return  // 过滤 ④

          const style = {
            position: 'absolute',
            left:     `${rect.x - CONTENT_SHIFT_X}px`,
            top:      `${rect.y - CONTENT_SHIFT_Y}px`,
            width:    `${rect.w}px`,
            height:   `${rect.h}px`,
            zIndex:   zi,
          }
          if (blendMap[id]) style.mixBlendMode = blendMap[id]

          const file = src.file || src.path || ''
          sliceItems.push({ kind: 'slice', id, name, style, src: assetUrl(file) })
          return
        }

        // ── 矢量 CSS 层处理 ─────────────────────────────────────────────────
        if (kind === 'vector-css') {
          if (MASK_RE.test(name || '')) return  // 过滤 ④

          const css = src.css || []

          // 内联退化描边检测（border 宽度 > 元素短边 / 2 且元素较小）
          const borderCss = css.find(
            (c) => /^border\s*:\s*\d/i.test(c) && !/border-radius/i.test(c)
          )
          if (borderCss) {
            const bm = borderCss.match(/border\s*:\s*(\d+)px/i)
            if (bm) {
              const bw = parseInt(bm[1], 10)
              if (
                bw > 2 &&
                (bw * 2 > rect.w || bw * 2 > rect.h) &&
                (rect.w < 60 || rect.h < 60)
              ) return
            }
          }

          const style = {
            position:  'absolute',
            left:      `${rect.x - CONTENT_SHIFT_X}px`,
            top:       `${rect.y - CONTENT_SHIFT_Y}px`,
            width:     `${rect.w}px`,
            height:    `${rect.h}px`,
            zIndex:    zi,
            boxSizing: 'border-box',
            ...parseCssArray(css, { keepTransform: true }),
            ...synthBorderFromAttrs(src),
          }
          otherItems.push({ kind: 'vector', id, name, style })
          return
        }

        // ── 文本层处理 ──────────────────────────────────────────────────────
        if (kind === 'text' || layer.type === 'text' || src.kind === 'text') {
          const content = layer.content || src.content || ''

          // 过滤 ⑤：文本去重
          const dedupeKey = `${content}|${Math.round((rect.x - CONTENT_SHIFT_X) / 4)}|${Math.round((rect.y - CONTENT_SHIFT_Y) / 4)}`
          if (textKeys.has(dedupeKey)) return
          textKeys.add(dedupeKey)

          const style = {
            position:   'absolute',
            left:       `${rect.x - CONTENT_SHIFT_X}px`,
            top:        `${rect.y - CONTENT_SHIFT_Y}px`,
            width:      `${rect.w}px`,
            zIndex:     zi,
            whiteSpace: 'pre-wrap',
            overflow:   'hidden',
          }

          // TODO: [text-style] 从 allElementsData 中找到对应图层的文本样式并应用。
          //   不同项目的 allElementsData 结构可能不同，常见字段示例：
          //
          //   const el = elements.find(e => e.id === id)
          //   if (el?.style) {
          //     style.fontSize   = `${el.style.fontSize}px`
          //     style.color      = el.style.color || el.style.fill
          //     style.fontFamily = el.style.fontFamily
          //     style.fontWeight = el.style.fontWeight
          //     style.lineHeight = el.style.lineHeight
          //                        ? `${el.style.lineHeight}px` : 'normal'
          //     style.textAlign  = el.style.textAlign
          //   }

          textItems.push({ kind: 'text', id, name, style, content })
        }
      })

      // 渲染顺序：切片（最底）→ 矢量 → 文本（最顶），zIndex 由各项 style.zIndex 控制
      return [...sliceItems, ...otherItems, ...textItems]
    },

    // ── 2.3 ECharts 图表叠加层 ────────────────────────────────────────────────
    /**
     * 从 _chart_zones.json 提取高置信度图表区，生成绝对定位的叠加容器配置。
     * 模型在模板中按 ov.type / ov.zone 渲染对应的 ECharts 组件。
     */
    chartOverlays() {
      const zones = chartZonesData?.zones || []
      return zones
        .filter((z) => z.confidence === 'high' || z.rendered)
        .map((z) => ({
          key:  z.id,
          type: z.chartType,
          zone: z,
          style: {
            position: 'absolute',
            left:     `${z.rect.x - CONTENT_SHIFT_X}px`,
            top:      `${z.rect.y - CONTENT_SHIFT_Y}px`,
            width:    `${z.rect.w}px`,
            height:   `${z.rect.h}px`,
            zIndex:   1500,
          },
        }))
    },
  },

  mounted() {
    this._onResize = () => {
      this.windowWidth  = window.innerWidth
      this.windowHeight = window.innerHeight
    }
    window.addEventListener('resize', this._onResize)

    // TODO: [fetch-data] 在此处发起 API 请求，获取图表数据
    // this.loadData()
  },

  beforeDestroy() {
    window.removeEventListener('resize', this._onResize)
  },

  methods: {
    // TODO: [fetch-data] 实现数据加载方法
    // async loadData() {
    //   const [err, res] = await fetchXxxData()
    //   if (!err) {
    //     this.mockData = res.data
    //   }
    // },
  },
}
</script>

<style scoped>
/* ── 外层 Shell：占满父容器，黑色背景，flex 居中 ── */
.dcv-shell {
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ── 信箱框：由 :style letterboxStyle 控制实际像素尺寸 ── */
.dcv-letterbox {
  position: relative;
  /* overflow: hidden; */ /* 如需裁剪越界内容取消注释 */
}

/*
 * dcv-board：原始设计稿尺寸，由 CSS scale 变换实现等比缩放。
 * 尺寸和 transform 均由 :style boardStyle 控制，此处不重复设置。
 */
.dcv-board {
  /* position / width / height / transform → 由 :style 控制 */
}
</style>
