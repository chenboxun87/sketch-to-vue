# emit-react.mjs — Design Specification

> Target: React 18 (JSX) + CSS Modules  
> Input: `scene-graph.json` (same as Vue emitter)  
> Output: `Index.jsx` + `index.module.css`

---

## 1. Activation

```yaml
# SKILL.md invocation
target: react
```

The AI reads `emit-react.mjs` instead of the default `gen-vue-from-scene-graph.mjs`.  
All upstream stages (Extract → Scene Graph → Layout Decision) are **unchanged**.

---

## 2. Output File Structure

```
src/pages/<PageName>/
├── Index.jsx          # React component (default export)
├── index.module.css   # CSS Modules stylesheet
└── assets/            # Copied from design export (same as Vue)
```

---

## 3. Component Skeleton

```jsx
// Copyright (c) 2026 chenboxun87 · https://github.com/chenboxun87/sketch-to-code
// Licensed under CC BY-NC-ND 4.0

import React, { useRef, useEffect, useState } from 'react';
import * as echarts from 'echarts';
import styles from './index.module.css';

// asset imports (resolved deterministically from scene graph)
import bg from './assets/background.png';

export default function PageName() {
  /* --- ECharts refs (one per chart node) --- */
  const chartRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const inst = echarts.init(chartRef.current);
    inst.setOption({ /* extracted from scene graph chartFeatures */ });
    return () => inst.dispose();
  }, []);

  return (
    <div className={styles.root}>
      {/* rendered nodes */}
    </div>
  );
}
```

---

## 4. Node-Type → JSX Mapping

| Scene Graph `type` | Vue output | React JSX output |
|---|---|---|
| `background` | `<div class="...">` | `<div className={styles.root}>` |
| `slice` (image) | `<img :src="..." />` | `<img src={assetVar} alt="" />` |
| `text` | `<span>{{ text }}</span>` | `<span>{text}</span>` |
| `shape` | `<div class="shape-xxx">` | `<div className={styles.shapeXxx}>` |
| `chart` | `<div ref="chartRef">` | `<div ref={chartRef} className={styles.chart}>` |
| `group` | `<div class="group">` | `<div className={styles.group}>` |

---

## 5. CSS Strategy: CSS Modules

### Why CSS Modules (not inline style)

- Scoped by default — no class name collision
- Supports pseudo-selectors and media queries
- Works with all CSS properties including gradients and animations
- Industry-standard React pattern

### Class naming convention

Convert layer name to camelCase CSS Module class:

| Layer name | CSS Module class |
|---|---|
| `panel-bg` | `.panelBg` |
| `kpi-icon-backup` | `.kpiIconBackup` |
| `位图备份 11` → `bitmap11` | `.bitmap11` |

Non-ASCII layer names: strip non-alphanumeric chars, fallback to `layer<index>`.

### CSS property mapping (same as Vue)

All layout/visual CSS properties are **identical** to Vue emitter output:
- `position: absolute`, `left`, `top`, `width`, `height`
- `background`, `background-image` (linear/radial gradient)
- `box-shadow` (including synthesized gradient border via `synthBorderFromAttrs`)
- `border-radius` (including `50%` for ellipse nodes)
- `z-index` (from scene graph stacking order)
- `object-fit`, `object-position` (for slice images)
- `font-size`, `font-weight`, `color`, `letter-spacing`, `text-align`

---

## 6. ECharts Integration

### Detection (unchanged from Vue)

Chart nodes are identified by `disposition: "chart"` in scene graph,  
with `chartFeatures` containing extracted geometry (colors, bar widths, etc.).

### React implementation pattern

```jsx
// One useRef + useEffect per chart node
const barChart1Ref = useRef(null);

useEffect(() => {
  if (!barChart1Ref.current) return;
  const chart = echarts.init(barChart1Ref.current);
  chart.setOption({
    // chartFeatures from scene graph
    xAxis: { type: 'category', data: ['A', 'B', 'C'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: [120, 200, 150] }]
  });
  // Resize observer
  const ro = new ResizeObserver(() => chart.resize());
  ro.observe(barChart1Ref.current);
  return () => { chart.dispose(); ro.disconnect(); };
}, []);

// JSX
<div ref={barChart1Ref} className={styles.barChart1} />
```

### Hook extraction (recommended)

For pages with 3+ charts, emit a `useChart` custom hook:

```jsx
// useChart.js (auto-generated alongside Index.jsx)
export function useChart(ref, option) {
  useEffect(() => {
    if (!ref.current) return;
    const inst = echarts.init(ref.current);
    inst.setOption(option);
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(ref.current);
    return () => { inst.dispose(); ro.disconnect(); };
  }, []);
}
```

---

## 7. Asset Resolution

**Rule (identical to Vue emitter — deterministic, never guess):**

1. Scene graph `sliceName` → look up `slice-asset-audit.json` → get exact file path
2. Generate `import` statement at top of file: `import <camelName> from './assets/<filename>'`
3. Use the import variable in JSX: `src={<camelName>}`

```jsx
// Generated imports
import bitmapBackup11 from './assets/bitmap-backup-11.png';
import iconEnergy from './assets/icon-energy.png';

// Usage in JSX
<img src={bitmapBackup11} className={styles.bitmapBackup11} alt="" />
```

**Never use string literals for local asset paths. Always use import variables.**

---

## 8. Conditional Rendering

| Vue | React JSX |
|---|---|
| `v-if="condition"` | `{condition && <Component />}` |
| `v-show="visible"` | `style={{ display: visible ? 'block' : 'none' }}` |
| `v-if / v-else` | Ternary: `{cond ? <A /> : <B />}` |

---

## 9. List Rendering

| Vue | React JSX |
|---|---|
| `v-for="item in list"` | `{list.map((item, i) => <div key={i}>...</div>)}` |

Always include `key` prop in map output.

---

## 10. Big-Screen Scaling

Same scaling strategy as Vue:

```css
/* index.module.css */
.root {
  width: 1920px;
  height: 1080px;
  transform-origin: top left;
  /* JS sets: style.transform = `scale(${vw/1920})` */
}
```

```jsx
useEffect(() => {
  const scale = () => {
    const s = window.innerWidth / 1920;
    document.querySelector(`.${styles.root}`).style.transform = `scale(${s})`;
  };
  scale();
  window.addEventListener('resize', scale);
  return () => window.removeEventListener('resize', scale);
}, []);
```

---

## 11. Differences from Vue Emitter (Summary)

| Aspect | Vue Emitter | React Emitter |
|---|---|---|
| Template | `<template>` SFC | JSX in `.jsx` file |
| Style scope | `<style scoped>` | CSS Modules `.module.css` |
| Class binding | `:class="..."` | `className={styles.xxx}` |
| Asset ref | `require('./assets/x.png')` or static | `import x from './assets/x.png'` |
| ECharts mount | `mounted() { echarts.init(this.$refs.x) }` | `useEffect` + `useRef` |
| Resize | Vue resize mixin | `ResizeObserver` in useEffect |
| Reactivity | `data()` / `computed` | `useState` / `useMemo` |

---

## 12. Taro Compatibility Note

`emit-react.mjs` output is **Taro-compatible** with minor adjustments:
- Replace `<div>` → `<View>`, `<img>` → `<Image>`, `<span>` → `<Text>`
- Replace CSS Modules with Taro's built-in style system
- ECharts: use `@antv/f2` or `echarts-for-react` Taro version

A separate `emit-taro.mjs` can be a thin wrapper that post-processes React emitter output.

---

## 13. AI Execution Checklist

When generating React output, the AI MUST verify:

- [ ] Every local image uses `import` variable, NOT string path
- [ ] Every CSS class is in `index.module.css` and referenced via `styles.xxx`
- [ ] ECharts charts use `useRef` + `useEffect` + `dispose()` cleanup
- [ ] `key` prop present on all `.map()` renders
- [ ] Big-screen pages include resize scaling logic
- [ ] No `el-*` or `ls-*` component references (React output is standalone)
- [ ] `border-radius: 50%` applied to ellipse-named nodes
- [ ] `synthBorderFromAttrs` gradient borders preserved in CSS
