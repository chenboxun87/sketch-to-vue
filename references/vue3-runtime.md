# Vue 3 框架实现规范

> **导航**：长文档请用编辑器大纲（## 标题）跳转；阶段索引见 [reading-guide.md](./reading-guide.md)。

来源：sketch-meaxure-to-vue（硬获规则，完整保留）

---

## 硬获规则（静态基线没问题、真实 Vue app 才暴露的问题）

每一条都是真实踩坑并修复过的——在发布前检查所有四条。

---

### 规则 1：打包设计字体（容易遗漏——"看起来有样式"）

MeaXure `font-family` 值（`YouSheBiaoTiHei`、`PingFangSC-*`、`SourceHanSansCN-*`、`DingTalk-JinBuTi`、`AlibabaPuHuiTi_*`、`D-DIN-PRO-*` 等）**不是 web-safe 字体**。

没有 `@font-face` 且字体未安装时，浏览器**静默 fallback**：inline CSS（size/color/shadow/spacing）仍然生效，所以看起来有样式，但独特字体消失了。CJK fallback 对宽度测试不可见（每个汉字都是 1em 宽）——用 Latin 字符串或 `document.fonts.check('NNpx "Family"')` 检测。

**修复步骤：**
1. 从提取的 layers 中收集所有不重复的 `fontFamily`
2. 字体文件放 `public/fonts/`
3. 为每个设计字族名声明一个 `@font-face`，**名称与导出中的名称完全一致**，`font-weight: 100 900`（允许可变字体追踪 weight，防止静态字体被 faux-bold）
4. 在 `main.ts` 中 import 一次 css

```css
/* public/fonts/fonts.css */
@font-face {
  font-family: "YouSheBiaoTiHei";
  src: url("/fonts/YouSheBiaoTiHei.woff2") format("woff2"),
       url("/fonts/YouSheBiaoTiHei.ttf") format("truetype");
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: "D-DIN-PRO-700";
  src: url("/fonts/D-DIN-PRO-700.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}
```

```ts
// main.ts
import '/fonts/fonts.css'
```

**注意**：Windows 自带字体（如 `MicrosoftYaHeiUI`）无需打包；仅限 Apple 的字体（`PingFangSC`、`.SFNS-*`）在非 Mac 设备上需要打包。

---

### 规则 2：给画板设置底色（透明背景 slice → 黑色条带）

全屏背景 slice 通常仅上半部分不透明，**下方透明**（在 Sketch 里画板填充会显示在那里）。拉伸到页面盒后，透明部分露出应用的深色背景，底部出现黑色条带。

**修复**：将 stage/board 的 `background` 设为 slice 渐变到的那个青/浅色——**对 slice 的最后一行不透明像素采样**，不要猜测泛泛的深色。

```javascript
// 采样方法：把 bg slice 画到 canvas，从底部向上扫描 alpha
function sampleLastOpaqueRowColor(imgEl) {
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth;
  canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0);

  for (let y = canvas.height - 1; y >= 0; y--) {
    const pixel = ctx.getImageData(canvas.width >> 1, y, 1, 1).data;
    if (pixel[3] > 10) {  // alpha > ~4%
      return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
    }
  }
  return '#06122c';  // fallback（不要猜，实际采样）
}
```

---

### 规则 3：文字用 `pre-wrap`，并重新对齐偏移的 fragment 块

**用 `white-space: pre-wrap` 渲染**（遵守作者写的 `\n`，长段落也会折行）。只对真正的单行盒（`boxHeight ≈ lineHeight`）用 `pre`，防止紧凑标签折到第二行。旧的 `<br>` 方案已废弃。

**Fragment 去重 + 重新对齐：** 一个段落通常**同时**作为多行聚合图层和逐行 fragment 图层存在。保留 **fragments**（它们保留了逐行样式，比如最后一句加粗），删除聚合图层。但 fragment 集有时会比聚合图层偏移几个 px，骑到卡片顶部边框上。当聚合图层含有显式 `\n` 时，把 fragment 块的顶部对齐到聚合图层的 `rect.y`（对每个 fragment 应用 `dy = aggregate.y - min(fragment.y)`）。

**症状**：某张卡片的文字紧贴顶部边框，而兄弟卡片有正常间距。

---

### 规则 4：搭建代码生成不会生成的 Runtime Shell

分段/代码生成产出的是图层数据 + 页面/panel 组件，不是 runtime。一个可运行的 app 还需要（构建一次，项目无关）：

**`types/layer.ts`**
```typescript
export interface LayerRect { x: number; y: number; w: number; h: number }
export interface LayerNode {
  id: string; name: string; type: 'slice' | 'text' | 'shape' | 'group';
  z: number; rect: LayerRect; content?: string; css?: string[];
  fontFamily?: string; fontSize?: number; opacity?: number; rotation?: number;
  exports?: Array<{ path: string; format: string }>;
}
```

**`router/index.ts`**（按项目配置）

**`stores/ui.ts`**（Pinia/Vuex）
```typescript
export const useUiStore = defineStore('ui', {
  state: () => ({ zoomMode: 'fill' as 'fill' | 'fit' }),
  actions: { setZoomMode(mode: 'fill' | 'fit') { this.zoomMode = mode } }
})
```

**`ScreenStage.vue`**（等比缩放画板，`宽度铺满` / `整页适配`）：
```vue
<template>
  <div ref="vp" class="screen-viewport">
    <div ref="stage" class="screen-stage" :style="stageStyle">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
const vp = ref<HTMLElement>()
const stage = ref<HTMLElement>()
const DESIGN_W = 1920, DESIGN_H = 1080
const scale = ref(1)

function fit() {
  if (!vp.value) return
  const sx = vp.value.clientWidth / DESIGN_W
  const sy = vp.value.clientHeight / DESIGN_H
  scale.value = Math.min(sx, sy)  // 整页适配；fill 用 Math.max
}

const stageStyle = computed(() => ({
  width: `${DESIGN_W}px`, height: `${DESIGN_H}px`,
  transform: `scale(${scale.value})`, transformOrigin: '0 0',
  position: 'absolute', left: 0, top: 0
}))

const ro = new ResizeObserver(fit)
onMounted(() => { fit(); ro.observe(vp.value!) })
onUnmounted(() => ro.disconnect())
</script>

<style scoped>
.screen-viewport { position: fixed; inset: 0; overflow: hidden; }
</style>
```

**`PanelSection.vue`**（面板容器，固定在设计坐标 box.y，内部暴露 chart slot）：
```vue
<template>
  <div class="panel-section" :style="panelStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  x: number; y: number; width: number; height: number; zIndex?: number
}>()

const panelStyle = computed(() => ({
  position: 'absolute',
  left: `${props.x}px`,
  top: `${props.y}px`,
  width: `${props.width}px`,
  height: `${props.height}px`,
  zIndex: props.zIndex ?? 1,
}))
</script>
```

**`StageLayers.vue`**（遍历 layerNodes 并按类型分发到 LayerNode）：
```vue
<template>
  <div class="stage-layers">
    <LayerNode
      v-for="node in visibleLayers"
      :key="node.id"
      :node="node"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LayerNode from './LayerNode.vue'
import type { LayerNode as LayerNodeType } from '@/types/layer'

const props = defineProps<{ layers: LayerNodeType[] }>()
// 排除 reference/preview 装饰层（已在 extract 阶段标记 isReference:true）
const visibleLayers = computed(() =>
  props.layers.filter(l => !l.isReference).sort((a, b) => a.z - b.z)
)
</script>
```

**`LayerNode.vue`**（img / shape / text 统一渲染；text 使用 pre-wrap 逻辑）：
```vue
<template>
  <!-- slice → img -->
  <img
    v-if="node.type === 'slice'"
    :src="getAssetPath(node.exports?.[0]?.path ?? '')"
    :style="nodeStyle"
    class="layer-slice"
    loading="lazy"
    alt=""
  />
  <!-- shape → div + background -->
  <div
    v-else-if="node.type === 'shape'"
    :style="[nodeStyle, shapeStyle]"
    class="layer-shape"
  />
  <!-- text → span；pre-wrap / pre 由 isSingleLine 决定 -->
  <span
    v-else-if="node.type === 'text'"
    :style="[nodeStyle, textStyle]"
    class="layer-text"
  >{{ node.content }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LayerNode } from '@/types/layer'
import { getAssetPath } from '@/utils/assetPath'

const props = defineProps<{ node: LayerNode }>()

const nodeStyle = computed(() => ({
  position: 'absolute',
  left: `${props.node.rect.x}px`,
  top: `${props.node.rect.y}px`,
  width: `${props.node.rect.w}px`,
  height: `${props.node.rect.h}px`,
  zIndex: props.node.z,
  opacity: props.node.opacity ?? 1,
  transform: props.node.rotation ? `rotate(${props.node.rotation}deg)` : undefined,
}))

const isSingleLine = computed(() =>
  props.node.fontSize
    ? props.node.rect.h <= props.node.fontSize * 1.5
    : false
)

const textStyle = computed(() => ({
  fontFamily: props.node.fontFamily,
  fontSize: `${props.node.fontSize}px`,
  whiteSpace: isSingleLine.value ? 'pre' : 'pre-wrap',
}))

const shapeStyle = computed(() => {
  const fills = props.node.fills ?? []
  if (!fills.length) return {}
  const f = fills[0]
  if (f.fillType === 'Color') return { background: f.color?.['color-hex'] }
  // Gradient：直接使用 MeaXure 的 css 字符串
  return {}
})
</script>
```

---

## ECharts 集成模式

### `useECharts` composable

```typescript
// composables/useECharts.ts
import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

export function useECharts(
  el: Ref<HTMLElement | undefined>,
  optionRef: Ref<EChartsOption>
) {
  let chart: echarts.ECharts | null = null

  function init() {
    if (!el.value || chart) return
    chart = echarts.init(el.value)
    chart.setOption(optionRef.value, true)
  }

  function resize() { chart?.resize() }

  watch(optionRef, (opt) => chart?.setOption(opt, true), { deep: true })

  const ro = new ResizeObserver(resize)
  onMounted(() => {
    init()
    if (el.value) ro.observe(el.value)
  })
  onUnmounted(() => {
    ro.disconnect()
    chart?.dispose()
    chart = null
  })

  return { chart: () => chart }
}
```

### `ChartBox.vue` 模式

```vue
<!-- components/ChartBox.vue -->
<template>
  <div ref="hostEl" class="chart-box" :style="boxStyle">
    <div v-if="loading" class="chart-loading">加载中...</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type PropType } from 'vue'
import { useECharts } from '@/composables/useECharts'
import gsap from 'gsap'
import type { EChartsOption } from 'echarts'

const props = defineProps({
  left: Number, top: Number, width: Number, height: Number,
  option: { type: Object as PropType<EChartsOption>, default: () => ({}) },
  loading: Boolean
})

const hostEl = ref<HTMLElement>()
useECharts(hostEl, computed(() => props.option))

const boxStyle = computed(() => ({
  position: 'absolute', left: `${props.left}px`, top: `${props.top}px`,
  width: `${props.width}px`, height: `${props.height}px`
}))

// GSAP 入场动画
import { onMounted } from 'vue'
onMounted(() => {
  gsap.from(hostEl.value, { autoAlpha: 0, y: 18, duration: 0.6, ease: 'power2.out' })
})
</script>
```

---

## Fake Chart 替换步骤

1. **定义图表区域**（band-relative 坐标）
2. **清除区域，保留外框**：隐藏静态 slice 中心落在区域内的层（轴、图例、柱/环、静态控件），但保留卡片背景图和 section 标题
3. **嫁接 ChartBox**：放置在区域盒子的坐标和 z-index 上
4. **接 mock 数据**：`mockFetch(data, ms)` 模拟延迟，通过 mock → 设置 `loading` → 图表响应式更新；后续把 mockFetch 换成真实 fetch
5. **使用源数据真实颜色**：从 MeaXure JSON 按坐标提取（见 meaxure-track.md 精确颜色提取）
6. **处理动态标题**：如果控件切换图表维度，静态 slice 标题不会更新——要么隐藏 slice 标题改用响应式文字，要么接受固定标题

**3D 饼/环/比例图默认方案**：faux-3D ECharts 甜甜圈（向下偏移几 px 的深色深度环 + 阴影 + 渐变填充，纯 ECharts）。只有用户明确要求真 3D 时才用 `echarts-gl` 或 Three.js（有 bundle 重量代价）。

---

## 性能注意事项

- `ResizeObserver` + `dispose` 必须配对，防止内存泄漏
- `setOption(opt, true)` 的第二个参数 `notMerge:true` 防止图表数据叠加
- 大屏多图表场景：使用 `echarts.connect(group)` 联动 tooltip
- Vue Router 切换时确认 `onUnmounted` 能触发 dispose（使用 `<keep-alive>` 时需特别处理）

---

## 大屏运行时 Composable

### usePolling — 数据轮询

```typescript
// composables/usePolling.ts
import { onMounted, onUnmounted } from 'vue'

export function usePolling(fetchFn: () => Promise<void>, interval = 30_000) {
  let timer: ReturnType<typeof setInterval>
  onMounted(async () => {
    await fetchFn()
    timer = setInterval(fetchFn, interval)
  })
  onUnmounted(() => clearInterval(timer))
}
```

```typescript
// 页面中使用
usePolling(async () => {
  const data = await fetchDashboardData()
  chartOption.value = buildOption(data)
}, 30_000)
```

### useCountUp — 数字翻滚（GSAP）

```typescript
// composables/useCountUp.ts
import { ref, onMounted } from 'vue'
import gsap from 'gsap'  // npm i gsap

export function useCountUp(endVal: number, duration = 1.5) {
  const display = ref(0)
  onMounted(() => {
    gsap.to(display, {
      duration,
      value: endVal,
      ease: 'power2.out',
      onUpdate() { display.value = Math.round(display.value) }
    })
  })
  return { display }
}
```

```typescript
// 页面中使用
const { display: totalCount } = useCountUp(12345)
// <span>{{ totalCount }}</span>
```

### useFadeInUp — 面板入场淡入上移（GSAP）

```typescript
// composables/useFadeInUp.ts
import { Ref, onMounted } from 'vue'
import gsap from 'gsap'

export function useFadeInUp(el: Ref<HTMLElement | null>, delay = 0) {
  onMounted(() => {
    gsap.from(el.value, {
      duration: 0.6,
      y: 24,
      opacity: 0,
      delay,
      ease: 'power2.out'
    })
  })
}
```

```typescript
// 页面中使用（各面板错开 delay 营造层次感）
const panelRef = ref<HTMLElement | null>(null)
useFadeInUp(panelRef, 0.1)
// <div ref="panelRef">...</div>
```

> ⚠️ GSAP 须已安装（`npm i gsap`）。Vue 2 项目若无 GSAP，改用 `vue2-runtime.md` 中的 `animateNumber` + `requestAnimationFrame` 版本。
>
> 入场动画不影响数据绑定——数据先完成绑定，动画仅改变视觉呈现。
