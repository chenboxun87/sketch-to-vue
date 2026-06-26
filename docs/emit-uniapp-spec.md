# emit-uniapp.mjs — Design Specification

> Target: UniApp (Vue 2 syntax) — H5 / WeChat Mini Program / App  
> Input: `scene-graph.json` (same as Vue emitter)  
> Output: `index.vue` (UniApp rules) + `pages.json` snippet

---

## 1. Activation

```yaml
# SKILL.md invocation
target: uniapp
```

UniApp uses **Vue 2 single-file component syntax** but with UniApp-specific  
components, units (rpx), and build constraints. The emitter is a fork of  
`gen-vue-from-scene-graph.mjs` with targeted substitutions.

---

## 2. Output File Structure

```
src/pages/<PageName>/
├── index.vue          # UniApp page component
├── assets/            # Same asset folder as Vue emitter
└── pages.json.snippet # Append to project pages.json
```

---

## 3. Design Base Resolution & rpx Conversion

UniApp uses **rpx** as the responsive unit. The spec assumes:

| Design base | rpx base | Formula |
|---|---|---|
| 750px wide (mobile) | 750rpx | `rpx = px * 1` (1:1 for 750 base) |
| 375px wide (mobile @2x) | 750rpx | `rpx = px * 2` |
| 1920px wide (PC/dashboard) | Keep `px` + viewport scale | See Big-Screen section |

**Detection rule**: If the design canvas width is ≤ 1024px → use rpx.  
If canvas width > 1024px (dashboard/big-screen) → keep absolute px + viewport scaling.

```javascript
// In emit-uniapp.mjs
const BASE_WIDTH = sceneGraph.canvasWidth || 750;
const useRpx = BASE_WIDTH <= 1024;
const toCss = (px) => useRpx ? `${Math.round(px * 750 / BASE_WIDTH)}rpx` : `${px}px`;
```

---

## 4. Component Tag Mapping

| HTML (Vue) | UniApp tag | Notes |
|---|---|---|
| `<div>` | `<view>` | Universal container |
| `<span>` | `<text>` | Inline text (cannot nest block elements) |
| `<img>` | `<image>` | Use `:src` binding |
| `<a>` | `<navigator>` | Internal navigation |
| `<video>` | `<video>` | Same tag |
| `<canvas>` | `<canvas>` | Same tag |
| Custom ECharts | `<l-echart>` | via lime-echart package |

### Critical UniApp constraints

1. **`<text>` cannot contain `<view>` or other block elements** — text nodes must be leaf nodes.
2. **`position: fixed` is limited** — avoid on non-root elements in mini program target.
3. **CSS custom properties (`var()`)** — not supported in WeChat Mini Program target; inline the value.
4. **External fonts** — not supported in mini program; use system fonts only.
5. **`box-shadow` on `<image>`** — not supported; wrap in `<view>` with shadow applied to wrapper.

---

## 5. Component Skeleton

```vue
<template>
  <view class="root">
    <!-- rendered nodes -->
  </view>
</template>

<script>
// UniApp page script (Options API, Vue 2 compatible)
export default {
  name: 'PageName',
  data() {
    return {
      chartData: { /* extracted from scene graph */ }
    }
  },
  onLoad() {
    this.$nextTick(() => {
      this.initCharts();
    });
  },
  methods: {
    initCharts() {
      /* ECharts via lime-echart */
    }
  }
}
</script>

<style scoped>
.root {
  width: 750rpx;   /* or 1920px for big-screen */
  position: relative;
}
/* all node styles */
</style>
```

---

## 6. Node-Type → UniApp Tag Mapping

| Scene Graph `type` | HTML tag | UniApp tag | Style unit |
|---|---|---|---|
| `background` | `<div>` | `<view>` | rpx / px |
| `slice` (image) | `<img>` | `<image>` | rpx / px |
| `text` | `<span>` | `<text>` | rpx / px (font-size in rpx) |
| `shape` | `<div>` | `<view>` | rpx / px |
| `chart` | `<div ref="...">` | `<l-echart ref="..." />` | rpx / px |
| `group` | `<div>` | `<view>` | rpx / px |

---

## 7. ECharts Integration via lime-echart

### Installation (note for AI to include in output)

```bash
# Add to package.json
npm install lime-echart
```

```javascript
// pages.json: register easycom
{
  "easycom": {
    "^l-echart$": "lime-echart/components/l-echart/l-echart"
  }
}
```

### Template usage

```vue
<l-echart ref="barChart" style="width:690rpx;height:300rpx;" />
```

### Script initialization

```javascript
onLoad() {
  this.$nextTick(async () => {
    const chart = await this.$refs.barChart.init();
    chart.setOption({
      xAxis: { type: 'category', data: ['A', 'B', 'C'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [120, 200, 150] }]
    });
  });
}
```

### Difference from Vue web emitter

| Aspect | Vue Web | UniApp (lime-echart) |
|---|---|---|
| Mount hook | `mounted()` | `onLoad()` + `this.$nextTick` |
| Init call | `echarts.init(this.$refs.x)` | `await this.$refs.x.init()` |
| Resize | window resize event | UniApp lifecycle `onResize` |
| Dispose | `chart.dispose()` | `onUnload()` |

---

## 8. Asset Resolution

**Same deterministic rule as Vue/React emitters:**

1. `sliceName` → `slice-asset-audit.json` → exact file path
2. In UniApp, image `src` uses **static path** (no ES import needed for `<image>`)

```vue
<!-- UniApp image: use /static/ path or relative path -->
<image src="/static/assets/bitmap-backup-11.png" mode="aspectFill" />

<!-- Or relative (for H5 target) -->
<image src="./assets/bitmap-backup-11.png" mode="aspectFill" />
```

**`mode` attribute mapping (equivalent to CSS object-fit):**

| CSS `object-fit` | UniApp `image mode` |
|---|---|
| `cover` | `aspectFill` |
| `contain` | `aspectFit` |
| `fill` / default | `scaleToFill` |
| `none` | `center` |

---

## 9. rpx vs px Decision Tree

```
Is design canvas width <= 1024px?
├── YES → Mobile design → all dimensions in rpx
│   └── toCss(px) = `${Math.round(px * 750 / canvasWidth)}rpx`
└── NO  → Dashboard/big-screen → keep px
    └── Apply viewport scaling (same as Vue big-screen strategy)
        width: 1920px; transform: scaleX(vw/1920)
```

**Font size special rule**: Always convert to rpx on mobile, even on big-screen  
if the text is part of a mobile card component.

---

## 10. Big-Screen in UniApp

UniApp supports H5 deployment for dashboard pages. Strategy:

```vue
<template>
  <view class="root" :style="scaleStyle">
    <!-- nodes in absolute px -->
  </view>
</template>

<script>
export default {
  data() { return { scaleStyle: '' } },
  onLoad() { this.applyScale(); },
  methods: {
    applyScale() {
      // #ifdef H5
      const s = window.innerWidth / 1920;
      this.scaleStyle = `transform:scale(${s});transform-origin:top left;`;
      // #endif
    }
  }
}
</script>
```

Note: `// #ifdef H5` / `// #endif` are UniApp conditional compilation directives.

---

## 11. pages.json Snippet (auto-generated)

```json
{
  "path": "pages/PageName/index",
  "style": {
    "navigationBarTitleText": "PageName",
    "navigationBarBackgroundColor": "#0d1117",
    "navigationBarTextStyle": "white",
    "backgroundColor": "#0d1117"
  }
}
```

---

## 12. WeChat Mini Program Constraints

When `target: uniapp-mp` (mini program sub-target), apply these additional restrictions:

| Feature | Web/H5 | Mini Program |
|---|---|---|
| CSS `var()` | Supported | NOT supported — inline values |
| External `@font-face` | Supported | NOT supported — use system font |
| `box-shadow` on `<image>` | OK | Wrap in `<view>` |
| `position: fixed` | OK | Only on page root |
| `overflow: scroll` | OK | Use `scroll-view` component |
| Gradient on border | Via `box-shadow: inset` | Same approach works |

**System fonts available in WeChat Mini Program:**
- `PingFang SC` (iOS)
- `Microsoft YaHei` (Android fallback)
- `sans-serif` (safe fallback)

---

## 13. Styling: scoped CSS with rpx

```vue
<style scoped>
.root {
  position: relative;
  width: 750rpx;
  background: #0d1117;
}
.panelBg {
  position: absolute;
  left: 24rpx;
  top: 48rpx;
  width: 340rpx;
  height: 200rpx;
  background: linear-gradient(135deg, #1f6feb 0%, #8957e5 100%);
  border-radius: 16rpx;
}
.kpiValue {
  position: absolute;
  left: 40rpx;
  top: 80rpx;
  font-size: 48rpx;
  font-weight: 700;
  color: #f0f6fc;
}
</style>
```

---

## 14. Differences from Vue Web Emitter (Summary)

| Aspect | Vue Web | UniApp |
|---|---|---|
| Root tag | `<div>` | `<view>` |
| Text tag | `<span>` | `<text>` |
| Image tag | `<img :src>` | `<image :src mode="...">` |
| Length unit | `px` | `rpx` (mobile) / `px` (dashboard) |
| ECharts | `echarts.init(ref)` | `lime-echart` + `await ref.init()` |
| Lifecycle mount | `mounted()` | `onLoad()` |
| Conditional compile | N/A | `// #ifdef H5` etc. |
| Assets | ES import | `/static/` path or relative |
| Font | Any web font | System fonts only (MP target) |
| CSS variables | Supported | NOT in MP target |

---

## 15. AI Execution Checklist

When generating UniApp output, the AI MUST verify:

- [ ] All `<div>` replaced with `<view>`; all `<span>` with `<text>`; all `<img>` with `<image mode="...">`
- [ ] All pixel values converted to rpx (if mobile canvas) via `toCss()` formula
- [ ] ECharts initialized via `lime-echart` in `onLoad` (not `mounted`)
- [ ] Image src uses `/static/` path or relative `./assets/` — NOT ES import
- [ ] CSS `var()` avoided if mini program target
- [ ] `mode` attribute present on all `<image>` tags
- [ ] `pages.json` snippet included in output
- [ ] `box-shadow` on image nodes wrapped in `<view>` container
- [ ] Gradient borders use `box-shadow: inset` approach (same as Vue)
- [ ] `border-radius: 50%` for ellipse-named nodes (in rpx if mobile)
- [ ] Big-screen pages include `// #ifdef H5` conditional scale logic
